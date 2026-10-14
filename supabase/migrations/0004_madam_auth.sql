-- =============================================================
-- 0004_madam_auth.sql — PIN Mod madam (disahkan server-side)
-- Run selepas 0001 + 0002 + 0003
-- PIN awal: 2026  (tukar bila-bila masa, lihat nota di bawah)
-- =============================================================

create extension if not exists pgcrypto with schema extensions;

-- Schema private: TIDAK didedahkan melalui API (anon tak boleh baca)
create schema if not exists private;

create table if not exists private.app_config (
  key text primary key,
  value text not null
);

-- PIN asal = '2026' (disimpan sebagai hash bcrypt).
-- Nak tukar PIN nanti:
--   update private.app_config
--   set value = extensions.crypt('PIN_BARU', extensions.gen_salt('bf'))
--   where key = 'madam_pin';
insert into private.app_config (key, value)
values ('madam_pin', extensions.crypt('2026', extensions.gen_salt('bf')))
on conflict (key) do nothing;

-- ---------- Helper: semak PIN ----------
create or replace function private.check_madam(p_pin text)
returns boolean
language sql
stable
security definer
set search_path = private, extensions
as $$
  select exists (
    select 1 from private.app_config
    where key = 'madam_pin'
      and value = extensions.crypt(p_pin, value)
  );
$$;

-- ---------- Public: verify (untuk UI gate) ----------
create or replace function public.madam_verify(p_pin text)
returns boolean
language sql
stable
security definer
set search_path = private, extensions, public
as $$
  select private.check_madam(p_pin);
$$;

-- ---------- Admin RPC + p_pin ----------

drop function if exists public.set_booking_status(uuid, text);
create or replace function public.set_booking_status(
  p_booking_id uuid,
  p_status text,
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
  update public.bookings set status = p_status where id = p_booking_id;
end;
$$;

drop function if exists public.add_allowlist(text, text);
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
  insert into public.allowlist (student_id, name)
  values (p_student_id, p_name)
  on conflict (student_id) do update set name = excluded.name;
end;
$$;

drop function if exists public.remove_allowlist(text);
create or replace function public.remove_allowlist(
  p_student_id text,
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
  delete from public.allowlist where student_id = p_student_id;
end;
$$;

drop function if exists public.add_extra_class_block(int, time, time, text, text, date);
create or replace function public.add_extra_class_block(
  p_day_of_week int,
  p_start_time time,
  p_end_time time,
  p_label text,
  p_venue text,
  p_week_start date,
  p_pin text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_id uuid;
begin
  if not private.check_madam(p_pin) then
    raise exception 'UNAUTHORIZED';
  end if;
  insert into public.class_blocks (day_of_week, start_time, end_time, label, venue, week_start)
  values (p_day_of_week, p_start_time, p_end_time, p_label, p_venue, p_week_start)
  returning id into v_id;
  return v_id;
end;
$$;

drop function if exists public.remove_extra_class_block(uuid);
create or replace function public.remove_extra_class_block(
  p_id uuid,
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
  delete from public.class_blocks where id = p_id;
end;
$$;

-- ---------- Grants ----------
grant execute on function public.madam_verify(text) to anon, authenticated;
grant execute on function public.set_booking_status(uuid, text, text) to anon, authenticated;
grant execute on function public.add_allowlist(text, text, text) to anon, authenticated;
grant execute on function public.remove_allowlist(text, text) to anon, authenticated;
grant execute on function public.add_extra_class_block(int, time, time, text, text, date, text) to anon, authenticated;
grant execute on function public.remove_extra_class_block(uuid, text) to anon, authenticated;
