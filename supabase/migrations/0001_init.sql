-- =============================================================
-- 0001_init.sql — Skema Jadual Konsultasi (Anak-Anak Madam Idayati)
-- Run di Supabase SQL Editor (atau via supabase db push)
-- =============================================================

-- ---------- Tables ----------

-- Senarai pelajar yang dibenarkan tempah (allowlist)
create table if not exists public.allowlist (
  id uuid primary key default gen_random_uuid(),
  student_id text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

-- Jadual kelas tetap Madam (seed)
create table if not exists public.class_blocks (
  id uuid primary key default gen_random_uuid(),
  day_of_week int not null check (day_of_week between 1 and 5),
  start_time time not null,
  end_time time not null,
  label text not null default '',
  created_at timestamptz not null default now(),
  check (start_time < end_time)
);

-- Booking tempahan pelajar
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  day_of_week int not null check (day_of_week between 1 and 5),
  slot_start time not null,
  slot_end time not null,
  student_id text not null,
  student_name text not null,
  mode text not null default 'inperson' check (mode in ('inperson', 'online')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  check (slot_start < slot_end)
);

create index if not exists bookings_week_idx on public.bookings (week_start);

-- Max 1 booking aktif sehari per pelajar (BR-2). Rejected tidak dikira, jadi boleh tempah semula.
create unique index if not exists bookings_active_unique
  on public.bookings (student_id, week_start, day_of_week)
  where status in ('pending', 'approved');

-- ---------- RPC: Slot mingguan ----------
-- Kembalikan 20 slot 30-min (08:00–18:00) bagi setiap hari Isnin–Jumaat,
-- dengan status: 'class' | 'pending' | 'approved' | 'available'
create or replace function public.get_week_slots(p_week_start date)
returns table (
  day_of_week int,
  slot_start time,
  slot_end time,
  status text,
  booking_id uuid,
  student_name text,
  mode text
)
language sql
stable
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
          and cb.start_time < s.slot_end
          and cb.end_time > s.slot_start
      ) then 'class'
      when b.status is not null then b.status
      else 'available'
    end as status,
    b.id as booking_id,
    b.student_name,
    b.mode
  from slots s
  left join lateral (
    select bk.id, bk.student_name, bk.mode, bk.status
    from public.bookings bk
    where bk.week_start = p_week_start
      and bk.day_of_week = s.day_of_week
      and bk.slot_start = s.slot_start
      and bk.status in ('pending', 'approved')
    limit 1
  ) b on true
  order by s.day_of_week, s.slot_start;
$$;

-- ---------- RPC: Tempah slot ----------
create or replace function public.book_slot(
  p_week_start date,
  p_day_of_week int,
  p_slot_start time,
  p_slot_end time,
  p_student_id text,
  p_student_name text,
  p_mode text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_name text;
begin
  -- 1) Allowlist
  select a.name into v_name
  from public.allowlist a
  where a.student_id = p_student_id;
  if v_name is null then
    raise exception 'NOT_ALLOWLISTED';
  end if;

  -- 2) Hari & waktu sah
  if p_day_of_week not between 1 and 5 then
    raise exception 'INVALID_DAY';
  end if;
  if p_slot_start < '08:00'::time or p_slot_end > '18:00'::time then
    raise exception 'OUT_OF_HOURS';
  end if;
  if (p_slot_end - p_slot_start) <> interval '30 minutes' then
    raise exception 'INVALID_SLOT_LENGTH';
  end if;

  -- 3) Minggu semasa sahaja (Isnin minggu semasa, Asia/Kuala_Lumpur)
  if p_week_start <> (date_trunc('week', now() at time zone 'Asia/Kuala_Lumpur'))::date then
    raise exception 'WRONG_WEEK';
  end if;

  -- 4) Bukan waktu kelas
  if exists (
    select 1 from public.class_blocks cb
    where cb.day_of_week = p_day_of_week
      and cb.start_time < p_slot_end
      and cb.end_time > p_slot_start
  ) then
    raise exception 'CLASS_TIME';
  end if;

  -- 5) Slot belum diambil
  if exists (
    select 1 from public.bookings bk
    where bk.week_start = p_week_start
      and bk.day_of_week = p_day_of_week
      and bk.slot_start = p_slot_start
      and bk.status in ('pending', 'approved')
  ) then
    raise exception 'SLOT_TAKEN';
  end if;

  -- 6) Max 1 sehari (aktif)
  if exists (
    select 1 from public.bookings bk
    where bk.student_id = p_student_id
      and bk.week_start = p_week_start
      and bk.day_of_week = p_day_of_week
      and bk.status in ('pending', 'approved')
  ) then
    raise exception 'DAILY_LIMIT';
  end if;

  insert into public.bookings
    (week_start, day_of_week, slot_start, slot_end, student_id, student_name, mode, status)
  values
    (p_week_start, p_day_of_week, p_slot_start, p_slot_end, p_student_id, v_name, p_mode, 'pending')
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

-- ---------- RPC: Admin (TANPA LOGIN — risiko diterima) ----------

-- Approve / reject booking
create or replace function public.set_booking_status(p_booking_id uuid, p_status text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.bookings set status = p_status where id = p_booking_id;
$$;

-- Tambah pelajar ke allowlist
create or replace function public.add_allowlist(p_student_id text, p_name text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.allowlist (student_id, name) values (p_student_id, p_name)
  on conflict (student_id) do update set name = excluded.name;
$$;

-- Buang pelajar dari allowlist
create or replace function public.remove_allowlist(p_student_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.allowlist where student_id = p_student_id;
$$;

-- ---------- Row Level Security ----------

alter table public.allowlist enable row level security;
alter table public.class_blocks enable row level security;
alter table public.bookings enable row level security;

-- Jadual kelas & booking boleh dibaca umum (untuk render jadual)
drop policy if exists "class_blocks_read" on public.class_blocks;
create policy "class_blocks_read" on public.class_blocks
  for select using (true);

drop policy if exists "bookings_read" on public.bookings;
create policy "bookings_read" on public.bookings
  for select using (true);

-- allowlist: baca umum (untuk page admin). Nota: mendedahkan ID pelajar — circle kecil.
drop policy if exists "allowlist_read" on public.allowlist;
create policy "allowlist_read" on public.allowlist
  for select using (true);

-- ---------- Grants ----------

grant usage on schema public to anon, authenticated;
grant select on public.class_blocks to anon, authenticated;
grant select on public.bookings to anon, authenticated;
grant select on public.allowlist to anon, authenticated;

grant execute on function public.get_week_slots(date) to anon, authenticated;
grant execute on function public.book_slot(date, int, time, time, text, text, text) to anon, authenticated;
grant execute on function public.set_booking_status(uuid, text) to anon, authenticated;
grant execute on function public.add_allowlist(text, text) to anon, authenticated;
grant execute on function public.remove_allowlist(text) to anon, authenticated;

-- Realtime (optional): siarkan perubahan bookings ke klien
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;
end
$$;
