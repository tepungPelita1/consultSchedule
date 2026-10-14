-- =============================================================
-- 0003_student_id.sql — No. ID pelajar (10 digit) + self-cancel
-- Run selepas 0001_init.sql + 0002_class_blocks.sql
-- =============================================================

-- Buang versi lama (7-arg) yang masih membawa p_student_name
drop function if exists public.book_slot(date, int, time, time, text, text, text);

-- ---------- book_slot: guna nama dari allowlist (buang p_student_name) ----------
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
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_name text;
begin
  -- 0) Format ID: 10 digit nombor sahaja
  if p_student_id !~ '^[0-9]{10}$' then
    raise exception 'INVALID_STUDENT_ID';
  end if;

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
      and (cb.week_start is null or cb.week_start = p_week_start)
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

-- ---------- RPC: Cancel (student buang tempahan sendiri) ----------
-- Hanya pemilik booking (student_id padan) boleh cancel; baris dipadam.
create or replace function public.cancel_booking(p_booking_id uuid, p_student_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id text;
  v_status text;
begin
  if p_student_id !~ '^[0-9]{10}$' then
    raise exception 'INVALID_STUDENT_ID';
  end if;

  select bk.student_id, bk.status into v_student_id, v_status
  from public.bookings bk
  where bk.id = p_booking_id;

  if v_student_id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_status not in ('pending', 'approved') then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_student_id <> p_student_id then
    raise exception 'NOT_YOUR_BOOKING';
  end if;

  delete from public.bookings where id = p_booking_id;
end;
$$;

-- ---------- Grants ----------
grant execute on function public.book_slot(date, int, time, time, text, text) to anon, authenticated;
grant execute on function public.cancel_booking(uuid, text) to anon, authenticated;
