-- =============================================================
-- 0020_live_scoring.sql
-- Papan markah: kira terus selepas sesi habis + tie-break "siapa dahulu".
--
-- A) Sebelum ini satu minggu hanya dikira selepas MINGGU itu tamat
--    (v_done = current_week - 1), jadi konsultasi hari Khamis baru naik
--    papan markah pada Sabtu. Sekarang minggu dikira sebaik SESI itu
--    habis: tempahan `approved` yang slot_end-nya dah lepas (waktu KL)
--    terus masuk kiraan.
--
--    Minggu semasa kekal `null` (belum diputuskan) selagi tiada sesi yang
--    dah habis — penting supaya pelajar yang ada sesi Rabu tidak dicop
--    "missed" pada hari Isnin. Minggu hadapan sentiasa `null`.
--
-- B) Tambah `first_slot_at` = masa slot konsultasi paling awal yang dah
--    dikira. Client guna ia sebagai tie-break terakhir, menggantikan
--    susunan nama A-Z: kalau minggu hadir, streak dan jumlah sesi semua
--    seri, siapa yang sesinya lebih awal, dia di atas. Contoh: slot Isnin
--    10:00 kalahkan slot Rabu 14:00 dalam minggu yang sama.
--
-- Privasi tidak berubah: tiada student_id, booking_id, mod atau status.
--
-- Admin: jalankan selepas 0019 dalam Supabase SQL Editor.
-- =============================================================

-- ---------- Helper: masa sekarang (tempatan KL) ----------
create or replace function private.kl_now()
returns timestamp
language sql
stable
set search_path = private, public
as $$
  select (now() at time zone 'Asia/Kuala_Lumpur');
$$;

-- ---------- get_leaderboard (ganti versi 0019) ----------
drop function if exists public.get_leaderboard();

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
  v_now timestamp;
  v_last date;
begin
  select value::date into v_start from private.app_config where key = 'season_start';
  select value::int into v_len from private.app_config where key = 'season_weeks';
  v_start := coalesce(v_start, date '2026-09-28');
  v_len := least(greatest(coalesce(v_len, 12), 1), 52);

  v_monday := private.current_week_monday();
  v_current := ((v_monday - v_start) / 7) + 1;
  v_now := private.kl_now();
  v_last := v_start + (v_len - 1) * 7;

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
          -- weeks[i]: bilangan sesi approved yang DAH HABIS dalam minggu ke-i.
          -- null = belum diputuskan (minggu hadapan, atau minggu semasa yang
          -- belum ada sesi habis). Minggu lepas yang kosong = 0 (missed).
          'weeks', (
            select json_agg(
              case
                when g.i > v_current then null
                when g.i = v_current and done.c = 0 then null
                else done.c
              end
              order by g.i
            )
            from generate_series(1, v_len) as g(i)
            cross join lateral (
              select count(*)::int as c
              from public.bookings b
              where b.student_id = a.student_id
                and b.status = 'approved'
                and b.week_start = v_start + (g.i - 1) * 7
                and ((b.week_start + (b.day_of_week - 1)) + b.slot_end) <= v_now
            ) as done
          ),
          -- Tie-break: slot konsultasi paling awal yang dah dikira.
          'first_slot_at', (
            select min((b.week_start + (b.day_of_week - 1)) + b.slot_start)
            from public.bookings b
            where b.student_id = a.student_id
              and b.status = 'approved'
              and b.week_start between v_start and v_last
              and ((b.week_start + (b.day_of_week - 1)) + b.slot_end) <= v_now
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
