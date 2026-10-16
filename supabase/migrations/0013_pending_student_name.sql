-- =============================================================
-- 0013_pending_student_name.sql
-- get_week_slots: pulangkan student_name (kod 3 huruf) untuk
-- blok yang ditempah supaya UI boleh papar nama pada pending.
-- =============================================================

drop function if exists public.get_week_slots(date);

create or replace function public.get_week_slots(p_week_start date)
returns table (
  day_of_week int,
  slot_start time,
  slot_end time,
  status text,
  taken boolean,
  student_name text
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
    (b.status is not null) as taken,
    b.student_name
  from slots s
  left join lateral (
    select bk.status, bk.student_name
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

grant execute on function public.get_week_slots(date) to anon, authenticated;
