-- =============================================================
-- 0022_telegram_withdrawn.sql
-- Bila pelajar tarik balik tempahan `pending` sendiri, mesej Telegram
-- yang asal DI-EDIT supaya status bertukar jadi "Withdrawn by student".
-- Mesej itu tidak dipadam -- Madam tetap nampak ada orang pernah book
-- dan kemudian tarik, yang penting kalau dia dah rancang masanya.
--
-- Halangan yang perlu diselesaikan:
--   editMessageText perlukan `message_id`, tetapi pg_net TIDAK serentak:
--   `net.http_post` hanya memasukkan permintaan ke baris gilir dan
--   pulangkan nombor permintaan. Jawapan Telegram (yang mengandungi
--   message_id) tiba kemudian dalam `net._http_response`. Jadi trigger
--   yang menghantar notifikasi tak mungkin tahu message_id pada masa itu.
--
--   Penyelesaian: simpan nombor permintaan dalam private.telegram_sent,
--   kemudian "tuai" message_id daripada net._http_response bila-bila ada
--   peluang. pg_net membuang respons lama selepas beberapa jam, jadi
--   penuaian dibuat awal (setiap kali trigger notify berjalan) supaya
--   message_id dipindahkan ke jadual kita sebelum respons itu hilang.
--
-- Admin: jalankan selepas 0021 dalam Supabase SQL Editor.
-- =============================================================

-- ---------- 1) Jejak mesej yang dihantar ----------
-- Hanya mesej "NEW BOOKING" dijejak, sebab itulah satu-satunya yang
-- perlu diedit kemudian. Schema private tidak didedahkan melalui API.
create table if not exists private.telegram_sent (
  booking_id uuid primary key,
  request_id bigint not null,
  message_id bigint,
  chat_id    text not null,
  created_at timestamptz not null default now()
);

revoke all on table private.telegram_sent from anon, authenticated;

-- ---------- 2) Pembina teks (dikongsi) ----------
-- Diasingkan daripada 0021 sebab editMessageText perlu menghantar teks
-- PENUH yang baharu, jadi laluan tarik balik kena bina mesej yang sama
-- bentuk. Satu pembina = dua laluan tak boleh terpesong.
create or replace function private.telegram_booking_text(
  p_tajuk      text,
  p_status     text,
  p_code       text,
  p_week_start date,
  p_dow        int,
  p_slot_start time,
  p_slot_end   time,
  p_mode       text
)
returns text
language plpgsql
stable
as $$
declare
  v_mula    timestamp;
  v_tamat   timestamp;
  v_hari    text;
  v_bulan   text;
  v_mod     text;
  v_am1     text;
  v_am2     text;
  v_masa    text;
  v_sempang text;
begin
  v_mula := (p_week_start + (p_dow - 1)) + p_slot_start;
  v_tamat := (p_week_start + (p_dow - 1)) + p_slot_end;

  v_hari := case p_dow
    when 1 then 'Monday'
    when 2 then 'Tuesday'
    when 3 then 'Wednesday'
    when 4 then 'Thursday'
    when 5 then 'Friday'
    else 'Day ' || p_dow
  end;

  v_bulan := case extract(month from v_mula)::int
    when 1 then 'January'   when 2 then 'February'  when 3 then 'March'
    when 4 then 'April'     when 5 then 'May'       when 6 then 'June'
    when 7 then 'July'      when 8 then 'August'    when 9 then 'September'
    when 10 then 'October'  when 11 then 'November' else 'December'
  end;

  v_mod := case p_mode when 'online' then 'Online' else 'In Person' end;

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

  return '<b>' || p_tajuk || '</b>'
    || E'\n\n' || '<b>'
      || replace(replace(replace(
           coalesce(nullif(p_code, ''), '?'),
           '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
      || '</b>'
    || E'\n' || v_hari || ', ' || extract(day from v_mula)::int || ' '
      || v_bulan || ' ' || extract(year from v_mula)::int
    || E'\n' || v_masa
    || E'\n' || v_mod
    || E'\n\n' || '<i>Status: ' || p_status || '</i>';
end;
$$;

-- ---------- 3) Penuai message_id ----------
-- Pindahkan message_id daripada net._http_response ke jadual kita sebelum
-- pg_net membuang respons itu. Juga buang jejak lama yang tak berguna lagi.
create or replace function private.telegram_harvest()
returns void
language plpgsql
security definer
set search_path = private, public, extensions
as $$
begin
  update private.telegram_sent s
  set message_id = (r.content::jsonb -> 'result' ->> 'message_id')::bigint
  from net._http_response r
  where r.id = s.request_id
    and s.message_id is null
    and r.status_code = 200
    and r.content is not null;

  delete from private.telegram_sent
  where created_at < now() - interval '30 days';
exception
  when others then
    raise warning 'telegram_harvest gagal: %', sqlerrm;
end;
$$;

revoke all on function private.telegram_harvest() from public;

-- ---------- 4) notify_telegram_booking: rekod nombor permintaan ----------
-- Sama seperti 0021, kecuali ia kini guna pembina teks dikongsi dan
-- menyimpan nombor permintaan bagi mesej "NEW BOOKING".
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
  v_teks    text;
  v_body    jsonb;
  v_req     bigint;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      return new;
    end if;
    v_tajuk := 'NEW BOOKING';
    v_nota := 'Awaiting Madam''s Approval';
  elsif tg_op = 'UPDATE' then
    if new.status <> 'approved' or old.status = 'approved' then
      return new;
    end if;
    v_tajuk := 'BOOKING APPROVED';
    v_nota := 'Approved by Madam';
  else
    return new;
  end if;

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

  -- Tuai dahulu: respons bagi mesej terdahulu mungkin dah sampai, dan
  -- pg_net akan membuangnya tak lama lagi.
  perform private.telegram_harvest();

  v_teks := private.telegram_booking_text(
    v_tajuk, v_nota, new.student_name,
    new.week_start, new.day_of_week, new.slot_start, new.slot_end, new.mode
  );

  v_body := jsonb_build_object(
    'chat_id', v_chat,
    'text', v_teks,
    'parse_mode', 'HTML'
  );

  if coalesce(v_thread, '') <> '' then
    v_body := v_body || jsonb_build_object('message_thread_id', v_thread::bigint);
  end if;

  v_req := net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := v_body,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  -- Hanya mesej "NEW BOOKING" dijejak; itulah yang diedit bila ditarik balik.
  if tg_op = 'INSERT' then
    insert into private.telegram_sent (booking_id, request_id, chat_id)
    values (new.id, v_req, v_chat)
    on conflict (booking_id) do update
      set request_id = excluded.request_id,
          message_id = null,
          chat_id = excluded.chat_id,
          created_at = now();
  end if;

  return new;

exception
  when others then
    raise warning 'notify_telegram_booking gagal: %', sqlerrm;
    return new;
end;
$$;

revoke all on function private.notify_telegram_booking() from public;

-- ---------- 5) Laluan tarik balik ----------
-- Fungsi berasingan, bukan cabang dalam fungsi di atas: dalam trigger
-- DELETE hanya `old` wujud, jadi mencampurkan kedua-duanya hanya
-- menjemput ralat null.
create or replace function private.notify_telegram_withdrawn()
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
  v_msg     bigint;
  v_req     bigint;
  v_teks    text;
  v_body    jsonb;
begin
  -- Hanya tempahan pending boleh ditarik oleh pelajar (0018). Tempahan
  -- approved ditolak oleh Madam melalui UPDATE, bukan DELETE.
  if old.status <> 'pending' then
    return old;
  end if;

  select value into v_enabled from private.app_config where key = 'telegram_enabled';
  if coalesce(v_enabled, 'false') <> 'true' then
    return old;
  end if;

  select value into v_token from private.app_config where key = 'telegram_bot_token';
  select value into v_chat from private.app_config where key = 'telegram_chat_id';
  select value into v_thread from private.app_config where key = 'telegram_thread_id';

  if coalesce(v_token, '') = '' or coalesce(v_chat, '') = '' then
    return old;
  end if;

  perform private.telegram_harvest();

  select s.message_id, s.request_id into v_msg, v_req
  from private.telegram_sent s
  where s.booking_id = old.id;

  -- Kalau penuaian belum dapat, cuba terus dari respons pg_net.
  if v_msg is null and v_req is not null then
    select (r.content::jsonb -> 'result' ->> 'message_id')::bigint into v_msg
    from net._http_response r
    where r.id = v_req and r.status_code = 200 and r.content is not null;
  end if;

  if v_msg is not null then
    -- Laluan biasa: edit mesej asal supaya statusnya berubah.
    v_teks := private.telegram_booking_text(
      'NEW BOOKING', 'Withdrawn by student', old.student_name,
      old.week_start, old.day_of_week, old.slot_start, old.slot_end, old.mode
    );
    v_body := jsonb_build_object(
      'chat_id', v_chat,
      'message_id', v_msg,
      'text', v_teks,
      'parse_mode', 'HTML'
    );
    perform net.http_post(
      url := 'https://api.telegram.org/bot' || v_token || '/editMessageText',
      body := v_body,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  else
    -- Sandaran: message_id tak dapat dijumpai (respons pg_net dah dibuang,
    -- atau mesej asal memang tak pernah berjaya dihantar). Hantar mesej
    -- baharu -- kalau tidak, group akan kekal menunjukkan tempahan yang
    -- "menunggu kelulusan" padahal ia dah tiada, dan Madam boleh tersalah
    -- menyimpan slot itu.
    v_teks := private.telegram_booking_text(
      'BOOKING WITHDRAWN', 'Withdrawn by student', old.student_name,
      old.week_start, old.day_of_week, old.slot_start, old.slot_end, old.mode
    );
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
  end if;

  delete from private.telegram_sent where booking_id = old.id;

  return old;

exception
  when others then
    raise warning 'notify_telegram_withdrawn gagal: %', sqlerrm;
    return old;
end;
$$;

revoke all on function private.notify_telegram_withdrawn() from public;

-- ---------- 6) Trigger ----------
drop trigger if exists trg_notify_telegram_withdrawn on public.bookings;
create trigger trg_notify_telegram_withdrawn
after delete on public.bookings
for each row execute function private.notify_telegram_withdrawn();

-- ---------- Nota operasi ----------
-- Lihat jejak mesej:
--   select * from private.telegram_sent order by created_at desc limit 10;
-- Kalau message_id kekal null lama-lama, penuaian tak berjaya -- semak
--   select id, status_code, left(content, 80) from net._http_response
--   order by created desc limit 5;
