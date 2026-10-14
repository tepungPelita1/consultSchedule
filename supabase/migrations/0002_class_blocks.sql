-- =============================================================
-- 0002_class_blocks.sql — Kelas tambahan (minggu khusus) + venue
-- Run selepas 0001_init.sql
-- =============================================================

alter table public.class_blocks add column if not exists venue text not null default '';
alter table public.class_blocks add column if not exists week_start date;

-- index untuk carian kelas mengikut minggu (recurring + week-specific)
create index if not exists class_blocks_week_idx on public.class_blocks (week_start);

-- ---------- get_week_slots: kira kelas tambahan mengikut minggu ----------
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
          and (cb.week_start is null or cb.week_start = p_week_start)
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

-- ---------- book_slot: cek kelas tambahan mengikut minggu ----------
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
  select a.name into v_name
  from public.allowlist a
  where a.student_id = p_student_id;
  if v_name is null then
    raise exception 'NOT_ALLOWLISTED';
  end if;

  if p_day_of_week not between 1 and 5 then
    raise exception 'INVALID_DAY';
  end if;
  if p_slot_start < '08:00'::time or p_slot_end > '18:00'::time then
    raise exception 'OUT_OF_HOURS';
  end if;
  if (p_slot_end - p_slot_start) <> interval '30 minutes' then
    raise exception 'INVALID_SLOT_LENGTH';
  end if;

  if p_week_start <> (date_trunc('week', now() at time zone 'Asia/Kuala_Lumpur'))::date then
    raise exception 'WRONG_WEEK';
  end if;

  if exists (
    select 1 from public.class_blocks cb
    where cb.day_of_week = p_day_of_week
      and (cb.week_start is null or cb.week_start = p_week_start)
      and cb.start_time < p_slot_end
      and cb.end_time > p_slot_start
  ) then
    raise exception 'CLASS_TIME';
  end if;

  if exists (
    select 1 from public.bookings bk
    where bk.week_start = p_week_start
      and bk.day_of_week = p_day_of_week
      and bk.slot_start = p_slot_start
      and bk.status in ('pending', 'approved')
  ) then
    raise exception 'SLOT_TAKEN';
  end if;

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

-- ---------- RPC: Kelas tambahan (Mod madam) ----------
create or replace function public.add_extra_class_block(
  p_day_of_week int,
  p_start_time time,
  p_end_time time,
  p_label text,
  p_venue text,
  p_week_start date
)
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.class_blocks (day_of_week, start_time, end_time, label, venue, week_start)
  values (p_day_of_week, p_start_time, p_end_time, p_label, p_venue, p_week_start)
  returning id;
$$;

create or replace function public.remove_extra_class_block(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.class_blocks where id = p_id;
$$;

-- ---------- Grants ----------
grant execute on function public.get_week_slots(date) to anon, authenticated;
grant execute on function public.book_slot(date, int, time, time, text, text, text) to anon, authenticated;
grant execute on function public.add_extra_class_block(int, time, time, text, text, date) to anon, authenticated;
grant execute on function public.remove_extra_class_block(uuid) to anon, authenticated;
