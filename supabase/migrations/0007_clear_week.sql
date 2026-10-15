-- =============================================================
-- 0007_clear_week.sql — Kosongkan tempahan / kelas ad-hoc sesuatu minggu
-- Run selepas 0001 – 0006
-- Kedua-dua RPC perlukan PIN Mod madam dan hanya kena pada minggu tersebut.
-- =============================================================

-- ---------- Buang semua tempahan minggu berkenaan ----------
create or replace function public.clear_week_bookings(
  p_week_start date,
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
  delete from public.bookings where week_start = p_week_start;
end;
$$;

-- ---------- Buang semua kelas ad-hoc (week_start = minggu itu) ----------
-- Nota: kelas tetap (week_start is null) TIDAK dipadam.
create or replace function public.clear_week_extra_classes(
  p_week_start date,
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
  delete from public.class_blocks where week_start = p_week_start;
end;
$$;

-- ---------- Grants ----------
grant execute on function public.clear_week_bookings(date, text) to anon, authenticated;
grant execute on function public.clear_week_extra_classes(date, text) to anon, authenticated;
