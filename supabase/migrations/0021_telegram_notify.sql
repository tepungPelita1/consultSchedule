-- =============================================================
-- 0021_telegram_notify.sql
-- Notifikasi Telegram bila ada tempahan konsultasi.
--
-- Dua peristiwa dihantar ke satu group:
--   1) Tempahan baharu  — INSERT dengan status 'pending'
--   2) Diluluskan        — UPDATE status kepada 'approved'
-- Tolak, tarik balik sendiri, dan padam TIDAK dihantar.
--
-- Mengapa dalam DB dan bukan dalam client:
--   Token bot ialah rahsia penuh — sesiapa yang ada token boleh hantar
--   mesej sebagai bot itu. Semua `VITE_*` dibakar ke dalam bundle JS yang
--   boleh dibaca sesiapa, dan CSP (config/headers.tmpl) pun hanya benarkan
--   connect-src ke self + Supabase. Jadi permintaan mesti keluar dari
--   Postgres, bukan browser. Kesannya: tiada perubahan pada src/, tiada
--   perubahan CSP, tiada perubahan Cloudflare — dan ia tangkap SEMUA jalan
--   masuk (app, RPC terus, Mod madam) sebab semuanya lalu public.bookings.
--
-- Kandungan mesej: kod pendek 3 huruf sahaja (cth. BQS). Nama penuh pelajar
-- tidak pernah keluar ke Telegram. Teks mesej dalam bahasa Inggeris, dihantar
-- dengan parse_mode HTML (bold pada tajuk & kod, italic pada status):
--
--   NEW BOOKING                      BOOKING APPROVED
--
--   SHU                              SHU
--   Monday, 9 November 2026          Monday, 9 November 2026
--   10:00 - 10:30 AM                 10:00 - 10:30 AM
--   In Person                        In Person
--
--   Status: Awaiting Madam's         Status: Approved by Madam
--   Approval
--
-- Admin: jalankan selepas 0020 dalam Supabase SQL Editor, kemudian isi
-- token + chat_id (lihat supabase/seed_private.sql — tidak di-commit).
-- =============================================================

-- ---------- 1) Extension ----------
-- Besar kemungkinan dah terpasang (Database Webhooks Supabase guna pg_net).
-- Fungsinya duduk dalam schema `net`.
create extension if not exists pg_net;

-- ---------- 2) Config ----------
-- Placeholder sahaja. Nilai sebenar diisi berasingan supaya token tidak
-- pernah masuk repo ini (repo public). `do nothing` supaya re-run migration
-- tak timpa token yang dah diset.
--
--   telegram_bot_token  token dari BotFather
--   telegram_chat_id    id group, nombor negatif (cth. -5538225499)
--   telegram_thread_id  pilihan — hanya kalau group guna Topics
--   telegram_enabled    'true' / 'false' — suis mati tanpa drop trigger
insert into private.app_config (key, value) values
  ('telegram_bot_token', ''),
  ('telegram_chat_id', ''),
  ('telegram_thread_id', ''),
  ('telegram_enabled', 'false')
on conflict (key) do nothing;

-- ---------- 3) Fungsi trigger ----------
-- security definer: pemanggil ialah `anon` (melalui book_slot /
-- set_booking_status) yang tiada akses ke schema private.
create or replace function private.notify_telegram_booking()
returns trigger
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare
  v_enabled text;
  v_token   text;
  v_chat    text;
  v_thread  text;
  v_tajuk   text;
  v_nota    text;
  v_hari    text;
  v_bulan   text;
  v_mod     text;
  v_teks    text;
  v_body    jsonb;
  v_mula    timestamp;
  v_tamat   timestamp;
  v_am1     text;
  v_am2     text;
  v_masa    text;
  v_sempang text;
begin
  -- ----- Peristiwa mana? -----
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      return new;
    end if;
    v_tajuk := 'NEW BOOKING';
    v_nota := 'Awaiting Madam''s Approval';
  elsif tg_op = 'UPDATE' then
    -- `old.status` halang mesej berulang kalau status diset semula ke nilai sama.
    if new.status <> 'approved' or old.status = 'approved' then
      return new;
    end if;
    v_tajuk := 'BOOKING APPROVED';
    v_nota := 'Approved by Madam';
  else
    return new;
  end if;

  -- ----- Config; kalau belum diset, senyap (bukan error) -----
  select value into v_enabled from private.app_config where key = 'telegram_enabled';
  if coalesce(v_enabled, 'false') <> 'true' then
    return new;
  end if;

  select value into v_token from private.app_config where key = 'telegram_bot_token';
  select value into v_chat from private.app_config where key = 'telegram_chat_id';
  select value into v_thread from private.app_config where key = 'telegram_thread_id';

  if coalesce(v_token, '') = '' or coalesce(v_chat, '') = '' then
    return new;
  end if;

  -- ----- Bina mesej -----
  -- Cap masa penuh dibina supaya to_char boleh guna format jam/AM-PM dengan
  -- selamat; `time` sendiri bukan jenis yang to_char sokong secara langsung.
  v_mula := (new.week_start + (new.day_of_week - 1)) + new.slot_start;
  v_tamat := (new.week_start + (new.day_of_week - 1)) + new.slot_end;

  -- Nama hari & bulan dibina sendiri, bukan guna to_char('Day'/'Month'),
  -- supaya ia tidak bergantung pada tetapan lc_time server.
  v_hari := case new.day_of_week
    when 1 then 'Monday'
    when 2 then 'Tuesday'
    when 3 then 'Wednesday'
    when 4 then 'Thursday'
    when 5 then 'Friday'
    else 'Day ' || new.day_of_week
  end;

  v_bulan := case extract(month from v_mula)::int
    when 1 then 'January'   when 2 then 'February' when 3 then 'March'
    when 4 then 'April'     when 5 then 'May'      when 6 then 'June'
    when 7 then 'July'      when 8 then 'August'   when 9 then 'September'
    when 10 then 'October'  when 11 then 'November' else 'December'
  end;

  v_mod := case new.mode when 'online' then 'Online' else 'In Person' end;

  -- Masa 12-jam. AM/PM diletak sekali di hujung bila kedua-dua belah sama
  -- (10:00 - 10:30 AM); kalau sesi itu melintasi tengah hari, kedua-dua belah
  -- dapat penanda sendiri (11:30 AM - 12:00 PM) supaya ia tidak mengelirukan.
  v_sempang := E'\U00002013';  -- en dash
  v_am1 := to_char(v_mula, 'AM');
  v_am2 := to_char(v_tamat, 'AM');

  if v_am1 = v_am2 then
    v_masa := to_char(v_mula, 'FMHH12:MI') || ' ' || v_sempang || ' '
           || to_char(v_tamat, 'FMHH12:MI') || ' ' || v_am2;
  else
    v_masa := to_char(v_mula, 'FMHH12:MI') || ' ' || v_am1 || ' ' || v_sempang
           || ' ' || to_char(v_tamat, 'FMHH12:MI') || ' ' || v_am2;
  end if;

  -- parse_mode HTML, bukan MarkdownV2: HTML hanya perlu escape & < >
  -- manakala MarkdownV2 menuntut escape pada - . ( ) ! + = # dan lain-lain,
  -- yang mudah pecah bila nama atau label berubah.
  v_teks := '<b>' || v_tajuk || '</b>'
    || E'\n\n' || '<b>'
      || replace(replace(replace(
           coalesce(nullif(new.student_name, ''), '?'),
           '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
      || '</b>'
    || E'\n' || v_hari || ', ' || extract(day from v_mula)::int || ' '
      || v_bulan || ' ' || extract(year from v_mula)::int
    || E'\n' || v_masa
    || E'\n' || v_mod
    || E'\n\n' || '<i>Status: ' || v_nota || '</i>';

  -- ----- Hantar -----
  v_body := jsonb_build_object(
    'chat_id', v_chat,
    'text', v_teks,
    'parse_mode', 'HTML'
  );

  if coalesce(v_thread, '') <> '' then
    v_body := v_body || jsonb_build_object('message_thread_id', v_thread::bigint);
  end if;

  perform net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := v_body,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  return new;

exception
  when others then
    -- WAJIB: notifikasi yang gagal tidak boleh menggagalkan tempahan pelajar.
    -- Warning masuk log Postgres (Supabase > Logs) tanpa abort transaksi.
    raise warning 'notify_telegram_booking gagal: %', sqlerrm;
    return new;
end;
$$;

revoke all on function private.notify_telegram_booking() from public;

-- ---------- 4) Trigger ----------
-- `update of status` — hanya berbunyi bila status ada dalam SET, iaitu
-- tepat apa yang set_booking_status buat (0004_madam_auth.sql).
-- Satu tempahan range (drag beberapa slot) = SATU baris bookings
-- (0008_range_booking.sql), jadi satu mesej, bukan satu per 30 minit.
drop trigger if exists trg_notify_telegram on public.bookings;
create trigger trg_notify_telegram
after insert or update of status on public.bookings
for each row execute function private.notify_telegram_booking();

-- ---------- Nota operasi ----------
-- Matikan sementara:
--   update private.app_config set value = 'false' where key = 'telegram_enabled';
-- Debug (jawapan Telegram; pg_net fire-and-forget, tiada retry):
--   select id, status_code, content from net._http_response
--   order by created desc limit 5;
--   200 + "ok":true = berjaya | 401 token salah | 400 chat_id salah
--   403 bot tiada dalam group / tiada kebenaran hantar
