-- =============================================================
-- 0009_prebooking_window.sql — Prebooking 2 minggu ke hadapan
-- Run selepas 0001 – 0008
-- Pelajar boleh tempah: minggu semasa + 2 minggu seterusnya.
-- Contoh: kalau sekarang Week 3, boleh tempah Week 3, 4 dan 5.
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
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_name text;
  v_current_monday date := (date_trunc('week', now() at time zone 'Asia/Kuala_Lumpur'))::date;
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
  -- Julat mesti positif dan gandaan 30 minit.
  if (p_slot_end - p_slot_start) < interval '30 minutes'
     or (extract(epoch from (p_slot_end - p_slot_start))::int % 1800) <> 0 then
    raise exception 'INVALID_SLOT_LENGTH';
  end if;

  -- 3) Tetingkap tempahan: minggu semasa hingga +2 minggu (Isnin, Asia/Kuala_Lumpur)
  if p_week_start < v_current_monday or p_week_start > v_current_monday + 14 then
    raise exception 'WRONG_WEEK';
  end if;

  -- 4) Bukan waktu kelas (berlaku pada mana-mana bahagian julat)
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

  insert into public.bookings
    (week_start, day_of_week, slot_start, slot_end, student_id, student_name, mode, status)
  values
    (p_week_start, p_day_of_week, p_slot_start, p_slot_end, p_student_id, v_name, p_mode, 'pending')
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

-- ---------- Grants ----------
grant execute on function public.book_slot(date, int, time, time, text, text) to anon, authenticated;
