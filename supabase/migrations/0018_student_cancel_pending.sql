-- =============================================================
-- 0018_student_cancel_pending.sql
-- Pulangkan semula keupayaan pelajar batalkan tempahan sendiri,
-- tetapi HANYA selagi status masih 'pending' (belum diluluskan).
-- Tempahan 'approved' tidak boleh dibatalkan sendiri — perlu Madam.
--
-- Cancel ikut slot (week_start + day_of_week + slot_start) supaya
-- booking_id tidak perlu didedahkan kepada pelajar.
--
-- Admin: jalankan selepas 0017 dalam Supabase SQL Editor.
-- =============================================================

create or replace function public.cancel_booking_by_slot(
  p_week_start date,
  p_day_of_week int,
  p_slot_start time,
  p_student_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_student_id text;
  v_status text;
begin
  if p_student_id !~ '^[0-9]{10}$' then
    raise exception 'INVALID_STUDENT_ID';
  end if;

  select bk.id, bk.student_id, bk.status
  into v_booking_id, v_student_id, v_status
  from public.bookings bk
  where bk.week_start = p_week_start
    and bk.day_of_week = p_day_of_week
    and bk.status in ('pending', 'approved')
    and bk.slot_start <= p_slot_start
    and bk.slot_end > p_slot_start
  limit 1;

  if v_booking_id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_student_id <> p_student_id then
    raise exception 'NOT_YOUR_BOOKING';
  end if;

  -- Hanya tempahan pending boleh dibatalkan sendiri.
  if v_status <> 'pending' then
    raise exception 'ALREADY_APPROVED';
  end if;

  delete from public.bookings where id = v_booking_id;
end;
$$;

grant execute on function public.cancel_booking_by_slot(date, int, time, text) to anon, authenticated;
