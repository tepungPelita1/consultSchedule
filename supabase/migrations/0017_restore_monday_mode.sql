-- =============================================================
-- 0017_restore_monday_mode.sql
-- Isnin kembali boleh pilih online / bersemuka — sama seperti
-- hari lain. Buang sekatan MONDAY_ONLINE_ONLY daripada book_slot.
--
-- Ini redefine book_slot versi 0015 (rollover hujung minggu)
-- tanpa sekatan Isnin. Signature & bahasa fungsi tak berubah,
-- tapi guna create or replace untuk kekal selamat.
--
-- Admin: jalankan selepas 0016 dalam Supabase SQL Editor.
-- =============================================================

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

  -- 3) Tetingkap tempahan: minggu berjalan hingga +2 minggu.
  --    Hujung minggu (Sabtu/Ahad) = minggu kerja dah tamat → minggu hadapan.
  if extract(isodow from (now() at time zone 'Asia/Kuala_Lumpur')) >= 6 then
    v_current_monday := v_current_monday + 7;
  end if;

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

grant execute on function public.book_slot(date, int, time, time, text, text) to anon, authenticated;
