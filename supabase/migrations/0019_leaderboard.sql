-- =============================================================
-- 0019_leaderboard.sql
-- Papan markah konsultasi ("Show rank") + buang reset minggu.
--
-- 1) Config musim dalam private.app_config (season_start, season_weeks)
-- 2) public.get_leaderboard()  — awam, data minimum (tiada student_id)
-- 3) Buang clear_week_bookings / clear_week_extra_classes — butang
--    "Reset minggu" dah dibuang; data tempahan lama kekal untuk
--    papan markah & paparan minggu lepas.
--
-- Satu minggu dikira bila pelajar ada >= 1 tempahan `approved` dalam
-- minggu itu, dan minggu itu dah selesai (sebelum minggu semasa;
-- rollover Sabtu 00:00 KL, sama dengan getCurrentWeekStart() di client).
--
-- Admin: jalankan selepas 0018 dalam Supabase SQL Editor.
-- =============================================================

-- ---------- 1) Config musim ----------
-- Tukar tarikh mula / panjang musim:
--   update private.app_config set value = '2027-03-01' where key = 'season_start';
--   update private.app_config set value = '14' where key = 'season_weeks';
insert into private.app_config (key, value) values
  ('season_start', '2026-09-28'),
  ('season_weeks', '12')
on conflict (key) do nothing;

-- Helper: Isnin minggu semasa (dengan rollover Sabtu)
create or replace function private.current_week_monday()
returns date
language sql
stable
set search_path = private, public
as $$
  select (date_trunc('week', now() at time zone 'Asia/Kuala_Lumpur'))::date
    + case
        when extract(isodow from (now() at time zone 'Asia/Kuala_Lumpur')) >= 6 then 7
        else 0
      end;
$$;

-- ---------- 2) get_leaderboard ----------
-- Pulangkan JSON:
--   { season: { start_date, length_weeks, current_week },
--     students: [ { key, full_name, short_name, weeks[], booked_this_week } ] }
-- weeks[i] = bilangan tempahan approved dalam minggu ke-(i+1); null = belum selesai.
-- Privasi: TIADA student_id, booking_id, mod atau masa slot.
-- `key` = allowlist.id (uuid rawak). Read-only, sama macam get_week_slots.
drop function if exists public.get_leaderboard();
drop function if exists public.get_leaderboard(text);

create function public.get_leaderboard()
returns json
language plpgsql
stable
security definer
set search_path = public, private, extensions
as $$
declare
  v_start date;
  v_len int;
  v_monday date;
  v_current int;
  v_done int;
begin
  select value::date into v_start from private.app_config where key = 'season_start';
  select value::int into v_len from private.app_config where key = 'season_weeks';
  v_start := coalesce(v_start, date '2026-09-28');
  v_len := least(greatest(coalesce(v_len, 12), 1), 52);

  v_monday := private.current_week_monday();
  v_current := ((v_monday - v_start) / 7) + 1;
  v_done := least(greatest(v_current - 1, 0), v_len);

  return json_build_object(
    'season', json_build_object(
      'start_date', v_start,
      'length_weeks', v_len,
      'current_week', v_current
    ),
    'students', coalesce((
      select json_agg(
        json_build_object(
          'key', a.id,
          'full_name', coalesce(nullif(a.full_name, ''), a.name),
          'short_name', a.name,
          'weeks', (
            select json_agg(
              case
                when g.i <= v_done then (
                  select count(*)::int
                  from public.bookings b
                  where b.student_id = a.student_id
                    and b.status = 'approved'
                    and b.week_start = v_start + (g.i - 1) * 7
                )
                else null
              end
              order by g.i
            )
            from generate_series(1, v_len) as g(i)
          ),
          'booked_this_week', exists (
            select 1
            from public.bookings b
            where b.student_id = a.student_id
              and b.week_start = v_monday
              and b.status in ('pending', 'approved')
          )
        )
        order by a.name
      )
      from public.allowlist a
    ), '[]'::json)
  );
end;
$$;

revoke all on function public.get_leaderboard() from public;
grant execute on function public.get_leaderboard() to anon, authenticated;

-- ---------- 3) Buang reset minggu ----------
drop function if exists public.clear_week_bookings(date, text);
drop function if exists public.clear_week_extra_classes(date, text);
