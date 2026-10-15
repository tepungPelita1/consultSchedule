-- =============================================================
-- 0006_full_name.sql — Nama penuh pelajar (untuk hover/tap)
-- Run selepas 0001 – 0005
-- allowlist.name  = kod pendek (cth. HKL)  -> dipapar pada blok
-- allowlist.full_name = nama penuh          -> dipapar bila hover/tap
-- =============================================================

alter table public.allowlist
  add column if not exists full_name text not null default '';

-- ---------- get_week_slots: tambah student_full_name ----------
-- Return type berubah, jadi kena drop dahulu.
drop function if exists public.get_week_slots(date);

create function public.get_week_slots(p_week_start date)
returns table (
  day_of_week int,
  slot_start time,
  slot_end time,
  status text,
  booking_id uuid,
  student_name text,
  student_full_name text,
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
    al.full_name as student_full_name,
    b.mode
  from slots s
  left join lateral (
    select bk.id, bk.student_id, bk.student_name, bk.mode, bk.status
    from public.bookings bk
    where bk.week_start = p_week_start
      and bk.day_of_week = s.day_of_week
      and bk.slot_start = s.slot_start
      and bk.status in ('pending', 'approved')
    limit 1
  ) b on true
  left join public.allowlist al on al.student_id = b.student_id
  order by s.day_of_week, s.slot_start;
$$;

-- ---------- add_allowlist: isi full_name = kod untuk pelajar baru ----------
-- Kalau pelajar sudah ada (conflict), kekalkan full_name sedia ada.
create or replace function public.add_allowlist(
  p_student_id text,
  p_name text,
  p_pin text
)
returns void
language plpgsql
security definer
set search_path = public, private, extensions
as $$
begin
  if not private.check_madam(p_pin) then
    raise exception 'UNAUTHORIZED';
  end if;
  insert into public.allowlist (student_id, name, full_name)
  values (p_student_id, p_name, p_name)
  on conflict (student_id) do update set name = excluded.name;
end;
$$;

-- ---------- Grants ----------
grant execute on function public.get_week_slots(date) to anon, authenticated;
grant execute on function public.add_allowlist(text, text, text) to anon, authenticated;
