-- =============================================================
-- 0011_security_patch.sql — Patch kerentanan kritikal & tinggi
-- Run selepas 0001 – 0010
-- =============================================================

-- =============================================================
-- 0. Tutup akses terus ke jadual sensitif
-- =============================================================
-- Sebelum ni 0001 letak polisi baca terbuka untuk class_blocks,
-- bookings, dan allowlist. Kami ganti dengan RPC yang terkawal.

alter table public.allowlist enable row level security;
drop policy if exists "allowlist_read" on public.allowlist;

alter table public.bookings enable row level security;
drop policy if exists "bookings_read" on public.bookings;

alter table public.class_blocks enable row level security;
drop policy if exists "class_blocks_read" on public.class_blocks;

-- =============================================================
-- 1. PIN Mod madam + rate limiting
-- =============================================================
-- PIN disimpan sebagai hash bcrypt dalam private.app_config.
-- Rate limit Mod madam: 3 cubaan salah / 5 minit.
-- Rate limit pelajar: 3 cubaan salah ID / 10 minit (di book_slot).

-- 1a) Tetapkan PIN baharu (3915)
insert into private.app_config (key, value)
values ('madam_pin', extensions.crypt('3915', extensions.gen_salt('bf')))
on conflict (key) do update
  set value = extensions.crypt('3915', extensions.gen_salt('bf'));

-- 1b) Jadual cubaan PIN Mod madam
create table if not exists private.pin_attempts (
  bucket text primary key,
  fails int not null default 0,
  first_try timestamptz not null default now(),
  last_try timestamptz not null default now(),
  locked_until timestamptz
);
alter table private.pin_attempts enable row level security;

-- 1c) Jadual cubaan tempahan pelajar
create table if not exists private.booking_attempts (
  bucket text primary key,
  fails int not null default 0,
  first_try timestamptz not null default now(),
  last_try timestamptz not null default now(),
  locked_until timestamptz
);
alter table private.booking_attempts enable row level security;

-- 1d) Helper: bucket ikut IP (hash, bukan IP mentah)
--     Utamakan cf-connecting-ip, kemudian x-forwarded-for (IP publik pertama),
--     kemudian x-real-ip. Skip IP private supaya bucket stabil.
create or replace function private.client_bucket()
returns text
language plpgsql
stable
set search_path = private, extensions
as $$
declare
  v_headers json;
  v_ip text;
  v_part text;
begin
  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;

  if v_headers is not null then
    -- 1) Cloudflare real client IP
    v_ip := nullif(trim(v_headers->>'cf-connecting-ip'), '');

    -- 2) x-forwarded-for: ambil IP publik pertama
    if v_ip is null then
      for v_part in
        select trim(part)
        from unnest(string_to_array(coalesce(v_headers->>'x-forwarded-for', ''), ',')) as part
      loop
        if v_part <> ''
           and v_part !~ '^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|::1|f[cd])'
        then
          v_ip := v_part;
          exit;
        end if;
      end loop;
    end if;

    -- 3) x-real-ip
    if v_ip is null then
      v_ip := nullif(trim(v_headers->>'x-real-ip'), '');
    end if;
  end if;

  if v_ip is null or length(trim(v_ip)) = 0 then
    v_ip := 'unknown';
  end if;

  return encode(extensions.digest(v_ip, 'sha256'), 'hex');
end;
$$;

-- 1e) Helper: semak PIN + rate limit (3 kali salah / 5 minit)
--     PENTING: drop dulu — CREATE OR REPLACE tak boleh tukar bahasa SQL → plpgsql.
drop function if exists public.madam_verify(text);
drop function if exists private.check_madam(text);

create function private.check_madam(p_pin text)
returns boolean
language plpgsql
volatile
security definer
set search_path = private, extensions
as $$
declare
  v_bucket text;
  v_locked_until timestamptz;
  v_ok boolean;
  v_fails int;
begin
  if p_pin is null or length(p_pin) = 0 or length(p_pin) > 128 then
    return false;
  end if;

  v_bucket := private.client_bucket();

  select locked_until into v_locked_until
  from private.pin_attempts
  where bucket = v_bucket;

  if v_locked_until is not null and v_locked_until > now() then
    return false;
  end if;

  v_ok := exists (
    select 1 from private.app_config
    where key = 'madam_pin'
      and value = extensions.crypt(p_pin, value)
  );

  if v_ok then
    delete from private.pin_attempts where bucket = v_bucket;
    return true;
  end if;

  insert into private.pin_attempts (bucket, fails, last_try)
  values (v_bucket, 1, now())
  on conflict (bucket) do update
    set fails = case
          when private.pin_attempts.last_try < now() - interval '5 min' then 1
          else private.pin_attempts.fails + 1
        end,
        last_try = now();

  select fails into v_fails
  from private.pin_attempts
  where bucket = v_bucket;

  if v_fails >= 3 then
    update private.pin_attempts
    set locked_until = now() + interval '5 min'
    where bucket = v_bucket;
  end if;

  return false;
end;
$$;

-- 1f) Public verify untuk gate UI
create function public.madam_verify(p_pin text)
returns boolean
language plpgsql
volatile
security definer
set search_path = private, extensions, public
as $$
begin
  return private.check_madam(p_pin);
end;
$$;

-- 1g) book_slot + rate limit pelajar (3 kali salah ID / 10 minit)
create or replace function public.book_slot(
  p_week_start date,
  p_day_of_week int,
  p_slot_start time,
  p_slot_end time,
  p_student_id text,
  p_mode text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_booking_id uuid;
  v_name text;
  v_current_monday date := (date_trunc('week', now() at time zone 'Asia/Kuala_Lumpur'))::date;
  v_bucket text;
  v_locked_until timestamptz;
  v_fails int;
begin
  -- 0) Format ID: 10 digit nombor sahaja
  if p_student_id !~ '^[0-9]{10}$' then
    raise exception 'INVALID_STUDENT_ID';
  end if;

  -- 0b) Rate limit ikut IP
  v_bucket := private.client_bucket();

  select locked_until into v_locked_until
  from private.booking_attempts
  where bucket = v_bucket;

  if v_locked_until is not null and v_locked_until > now() then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  -- 1) Allowlist
  select a.name into v_name
  from public.allowlist a
  where a.student_id = p_student_id;

  if v_name is null then
    insert into private.booking_attempts (bucket, fails, last_try)
    values (v_bucket, 1, now())
    on conflict (bucket) do update
      set fails = case
            when private.booking_attempts.last_try < now() - interval '10 min' then 1
            else private.booking_attempts.fails + 1
          end,
          last_try = now();

    select fails into v_fails
    from private.booking_attempts
    where bucket = v_bucket;

    if v_fails >= 3 then
      update private.booking_attempts
      set locked_until = now() + interval '10 min'
      where bucket = v_bucket;
    end if;

    -- Return null (bukan raise) supaya insert rate limit tak rollback.
    -- Client akan anggap null = NOT_ALLOWLISTED.
    return null;
  end if;

  -- ID sah: clear cubaan salah
  delete from private.booking_attempts where bucket = v_bucket;

  -- 2) Hari & waktu sah
  if p_day_of_week not between 1 and 5 then
    raise exception 'INVALID_DAY';
  end if;
  if p_slot_start < '08:00'::time or p_slot_end > '18:00'::time then
    raise exception 'OUT_OF_HOURS';
  end if;
  if (p_slot_end - p_slot_start) < interval '30 minutes'
     or (extract(epoch from (p_slot_end - p_slot_start))::int % 1800) <> 0 then
    raise exception 'INVALID_SLOT_LENGTH';
  end if;

  -- 3) Tetingkap tempahan: minggu semasa hingga +2 minggu
  if p_week_start < v_current_monday or p_week_start > v_current_monday + 14 then
    raise exception 'WRONG_WEEK';
  end if;

  -- 4) Bukan waktu kelas
  if exists (
    select 1 from public.class_blocks cb
    where cb.day_of_week = p_day_of_week
      and (cb.week_start is null or cb.week_start = p_week_start)
      and cb.start_time < p_slot_end
      and cb.end_time > p_slot_start
  ) then
    raise exception 'CLASS_TIME';
  end if;

  -- 5) Tiada pertindihan dengan tempahan aktif lain
  if exists (
    select 1 from public.bookings bk
    where bk.week_start = p_week_start
      and bk.day_of_week = p_day_of_week
      and bk.status in ('pending', 'approved')
      and bk.slot_start < p_slot_end
      and bk.slot_end > p_slot_start
  ) then
    raise exception 'SLOT_TAKEN';
  end if;

  -- 6) Max 1 tempahan aktif sehari per pelajar
  if exists (
    select 1 from public.bookings bk
    where bk.student_id = p_student_id
      and bk.week_start = p_week_start
      and bk.day_of_week = p_day_of_week
      and bk.status in ('pending', 'approved')
  ) then
    raise exception 'DAILY_LIMIT';
  end if;

  -- 7) Insert
  begin
    insert into public.bookings
      (week_start, day_of_week, slot_start, slot_end, student_id, student_name, mode, status)
    values
      (p_week_start, p_day_of_week, p_slot_start, p_slot_end, p_student_id, v_name, p_mode, 'pending')
    returning id into v_booking_id;
  exception
    when unique_violation then
      raise exception 'DAILY_LIMIT';
  end;

  return v_booking_id;
end;
$$;

-- =============================================================
-- 2. RPC untuk senarai pelajar (perlukan PIN)
-- =============================================================

create or replace function public.get_supervisees(p_pin text)
returns table (
  id uuid,
  student_id text,
  name text,
  full_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, private, extensions
as $$
begin
  if not private.check_madam(p_pin) then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  return query
    select a.id, a.student_id, a.name, a.full_name, a.created_at
    from public.allowlist a
    order by a.name asc;
end;
$$;

-- =============================================================
-- 3. RPC untuk jadual kelas (umum, tapi melalui RPC sahaja)
-- =============================================================

create or replace function public.get_class_blocks(p_week_start date)
returns table (
  id uuid,
  day_of_week int,
  start_time time,
  end_time time,
  label text,
  venue text,
  owner text,
  week_start date
)
language sql
stable
security definer
set search_path = public
as $$
  select id, day_of_week, start_time, end_time, label, venue, owner, week_start
  from public.class_blocks
  where week_start is null or week_start = p_week_start
  order by day_of_week, start_time;
$$;

-- =============================================================
-- 4. RPC untuk minggu yang ada tempahan aktif
-- =============================================================

create or replace function public.get_active_booking_weeks(p_weeks text)
returns table (week_start date)
language sql
stable
security definer
set search_path = public
as $$
  select distinct b.week_start
  from public.bookings b
  where b.week_start = any (string_to_array(p_weeks, ',')::date[])
    and b.status in ('pending', 'approved')
  order by b.week_start;
$$;

-- =============================================================
-- 5. RPC untuk Madam: senarai tempahan minggu dengan nama penuh
-- =============================================================

create or replace function public.get_week_bookings(
  p_week_start date,
  p_pin text
)
returns table (
  id uuid,
  week_start date,
  day_of_week int,
  slot_start time,
  slot_end time,
  student_id text,
  student_name text,
  full_name text,
  mode text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, private, extensions
as $$
begin
  if not private.check_madam(p_pin) then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  return query
    select
      b.id,
      b.week_start,
      b.day_of_week,
      b.slot_start,
      b.slot_end,
      b.student_id,
      b.student_name,
      coalesce(a.full_name, b.student_name) as full_name,
      b.mode,
      b.status,
      b.created_at
    from public.bookings b
    left join public.allowlist a on a.student_id = b.student_id
    where b.week_start = p_week_start
    order by b.created_at desc;
end;
$$;

-- =============================================================
-- 6. get_week_slots: jangan bocorkan nama pelajar
-- =============================================================
-- Return type berubah, jadi drop dahulu.

drop function if exists public.get_week_slots(date);

create or replace function public.get_week_slots(p_week_start date)
returns table (
  day_of_week int,
  slot_start time,
  slot_end time,
  status text,
  taken boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with slots as (
    select
      d.day as day_of_week,
      make_time(h.hour, m.minute, 0)::time as slot_start,
      (make_time(h.hour, m.minute, 0) + interval '30 minutes')::time as slot_end
    from generate_series(1, 5) as d(day)
    cross join generate_series(8, 17) as h(hour)
    cross join (values (0), (30)) as m(minute)
  )
  select
    s.day_of_week,
    s.slot_start,
    s.slot_end,
    case
      when exists (
        select 1 from public.class_blocks cb
        where cb.day_of_week = s.day_of_week
          and (cb.week_start is null or cb.week_start = p_week_start)
          and cb.start_time < s.slot_end
          and cb.end_time > s.slot_start
      ) then 'class'
      when b.status is not null then b.status
      else 'available'
    end as status,
    (b.status is not null) as taken
  from slots s
  left join lateral (
    select bk.status
    from public.bookings bk
    where bk.week_start = p_week_start
      and bk.day_of_week = s.day_of_week
      and bk.status in ('pending', 'approved')
      and bk.slot_start < s.slot_end
      and bk.slot_end > s.slot_start
    limit 1
  ) b on true
  order by s.day_of_week, s.slot_start;
$$;

-- =============================================================
-- 7. Buang keupayaan pelajar tarik balik tempahan sendiri
-- =============================================================
-- Tempahan pending/approved hanya boleh diurus oleh Madam (approve/reject).
-- Buang RPC lama yang bergantung pada booking_id yang tidak lagi diedarkan.

drop function if exists public.cancel_booking(uuid, text);

-- =============================================================
-- 8. Grants
-- =============================================================

grant execute on function public.madam_verify(text) to anon, authenticated;
grant execute on function public.book_slot(date, int, time, time, text, text) to anon, authenticated;
grant execute on function public.get_supervisees(text) to anon, authenticated;
grant execute on function public.get_class_blocks(date) to anon, authenticated;
grant execute on function public.get_active_booking_weeks(text) to anon, authenticated;
grant execute on function public.get_week_bookings(date, text) to anon, authenticated;
grant execute on function public.get_week_slots(date) to anon, authenticated;
