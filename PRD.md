# PRD.md — Sistem Jadual Konsultasi

> Dokumen keperluan produk untuk **Anak-Anak Madam Idayati** — scheduler konsultasi satu halaman (Mon–Fri) dengan gaya *folder-card × zine* (lihat `DESIGN.md`).

## 1. Ringkasan
Sistem jadual konsultasi untuk seorang penyelia (Madam Idayati). Jadual kelas tetap dipaparkan; masa kosong antara kelas dibuka sebagai slot **30 minit** untuk pelajar tempah. Data dalam Supabase; UI satu halaman minggu melintang.

## 2. Matlamat & Non-Goals
**Matlamat**
- Pelajar lihat jadual Mon–Fri & tempah slot kosong (30 min).
- Madam approve/reject tempahan & urus senarai pelajar & kelas tambahan (Mod madam).
- Jadual reset setiap minggu (soft reset).

**Non-goals**
- Tiada pembayaran, tiada emel/notifikasi push, tiada multi-supervisor, tiada bot Telegram penuh.

## 3. Pengguna
| Pengguna | Peranan |
|---|---|
| Pelajar (dalam allowlist) | Lihat jadual, tempah slot |
| Madam (Mod madam) | Approve/reject, urus kelas tambahan & allowlist |

## 4. Keperluan Fungsional
- **FR-1** Papar minggu melintang: masa di paksi-X (08:00–18:00, 20 kolum 30 min), baris = Isnin–Jumaat.
- **FR-2** Kelas tetap Madam dipapar sebagai blok teal (kod subjek + masa), tak boleh ditempah.
- **FR-3** Slot kosong 30 minit antara kelas boleh ditempah; pelajar boleh seret satu julat (contoh 1 jam = 2 slot) dan ia disimpan sebagai **satu** tempahan.
- **FR-4** Borang tempah: studentID (10 digit) + mod (Bersemuka/Online). Nama pendek pelajar diambil dari `allowlist` (`student_name`), bukan ditaip.
- **FR-5** Validasi: studentID mesti ada dalam `allowlist`; max 1 tempahan sehari; tempahan dibuka untuk minggu semasa + 2 minggu ke hadapan (prebooking); Isnin online sahaja.
- **FR-6** Tempahan status `pending` → Madam approve/reject.
- **FR-7** Soft reset mingguan (query ikut `week_start`).
- **FR-8** Navigasi minggu: ◀ ▶ + "Hari ini".
- **FR-9** Mod madam (checkbox): approve/reject, tambah/buang kelas tambahan, urus allowlist.
- **FR-10** i18n EN ⇄ BM + dark mode.
- **FR-11** Pelajar **tidak boleh** tarik balik tempahan sendiri. Tempahan pending/approved hanya boleh diurus oleh Madam (approve/reject).

## 5. Peraturan Perniagaan
- **BR-1** Satu slot = 1 pelajar.
- **BR-2** Max 1 tempahan sehari/pelajar.
- **BR-3** Tempahan dibuka bagi minggu semasa + 2 minggu ke hadapan (prebooking). Navigasi minggu dihadkan pada tetingkap ini. **Rollover hujung minggu:** mulai 12:00AM Sabtu, minggu semasa terus jadi minggu hadapan (Sabtu & Ahad) — pelajar tidak lagi nampak minggu yang baru tamat.
- **BR-4** Waktu kerja 08:00–18:00.
- **BR-5** `pending`/`approved` = penuh; `rejected` kembali kosong.
- **BR-6** Isnin (`day_of_week = 1`) **online sahaja** (`MONDAY_ONLINE_ONLY`); pilihan Bersemuka disembunyikan pada Isnin.

## 6. Aliran Pengguna
1. Pelajar buka `/` → lihat header folder + jadual minggu.
2. Klik/seret slot kosong → modal → isi studentID + mod → hantar.
3. Sistem sahkan allowlist → simpan `pending`.
4. Madam buka "Mod madam" → approve/reject; tambah kelas tambahan; urus allowlist.
5. Slot update (approved = hijau ✓, pending = amber).

## 7. Keperluan Bukan-Fungsional
- Responsive: board scroll melintang, label hari sticky.
- Security: RLS + RPC (allowlist validasi server-side). `allowlist`, `bookings`, dan `class_blocks` tiada akses terus dari klien — semua melalui RPC.
- Akses Mod madam: PIN `3915` (hash bcrypt dalam `private.app_config`), rate limit 3 cubaan salah / 5 minit per IP.
- Tempahan pelajar: studentID disemak server-side; 3 cubaan ID salah / 10 minit per IP.

## 8. Model Data
`allowlist(student_id, name)` · `class_blocks(day_of_week, start_time, end_time, label, venue, week_start)` · `bookings(week_start, day_of_week, slot_start, slot_end, student_id, student_name, mode, status)`.

## 9. Tech Stack
React + Vite + TS + Tailwind v4 · Supabase (Postgres/RLS/RPC/Realtime) · @tanstack/react-query · react-hook-form + zod · sonner · date-fns · Instrument Sans · Cloudflare Workers (static assets dari `./dist`, custom domain `consultation.ajamlab.my`).

## 10. Open Items
- [ ] Username Telegram Madam (butang "PM Madam").
- [ ] Warna header folder (kuning default; boleh rotate).

## 11. Kriteria Selesai
Build + lint lulus · jadual render dengan kelas sebenar · booking flow (allowlist + pending) · Mod madam approve/reject + allowlist + kelas tambahan · i18n EN/BM · soft reset disahkan.

## 12. Deployment & Operasi

### Hosting & branch
- Hosting: **Cloudflare Workers** (bukan Pages) — servis `consultschedule`, aset statik dari `./dist` (SPA fallback), custom domain `consultation.ajamlab.my`. Konfigurasi dalam `wrangler.jsonc` (`workers_dev: false`).
- Auto-deploy: **Workers Builds** (GitHub App "Cloudflare Workers and Pages"). Setiap push ke `staging` **atau** `main` mencetuskan build `npm run build` (`tsc -b && vite build`) dan deploy; status muncul sebagai check "Workers Builds: consultschedule" pada commit (merah = tak naik langsung).
- Hanya branch yang diset sebagai **Production branch** (dashboard: Workers & Pages → `consultschedule` → Settings → Builds) naik ke domain. Build dari branch lain cuma jadi preview version.
- `staging` — branch kerja. Semua perubahan dibuat di sini dahulu.
- `main` — production. Selepas siap di `staging`, merge ke `main`:

```bash
git checkout main
git merge staging
git push origin main
git checkout staging
```

> Penting: push ke `staging` tetap mencetuskan build. Sahkan setting **Production branch** dalam dashboard — kalau ia diset kepada `staging`, setiap push kerja akan terus ke live.

### Supabase
- SQL migrations dalam `supabase/migrations/`: run `0001` → `0015` ikut turutan, kemudian `supabase/seed.sql`.
- Deploy Cloudflare **tak** jalankan SQL — migration kena apply manual di Supabase SQL Editor.
- Jangan re-run migration lama — migration lepas redefine fungsi sebelum ini (contoh `0010` book_slot, `0011` security patch, `0014` Monday online-only, `0015` weekend rollover).

### Reset mingguan (soft reset)
- Tiada data dipadam automatik. Tempahan disimpan ikut `week_start`, jadi minggu baru **kosong** dengan sendirinya (semua slot jadi hijau semula).
- Kelas tetap (`class_blocks.week_start = null`) berulang setiap minggu; kelas tambahan pula ikut minggu tertentu.
- Minggu yang dah tamat keluar dari tetingkap navigasi (minggu semasa + 2) — tidak boleh dilihat/ditempah lagi.
- Madam boleh reset sesuatu minggu secara manual: butang **"Reset minggu"** (`t('clearWeek')`) → kosongkan tempahan + kelas tambahan minggu itu (`clear_week_bookings`, `clear_week_extra_classes`), sahkan dengan taip `reset`.
- `0011_security_patch.sql` mesti guna `DROP FUNCTION` sebelum `CREATE FUNCTION` untuk `public.madam_verify` dan `private.check_madam` — PostgreSQL tak benarkan `CREATE OR REPLACE` tukar bahasa fungsi (SQL → plpgsql).
- PIN Mod madam: `3915` (hash bcrypt dalam `private.app_config`). Tukar PIN:

```sql
update private.app_config
set value = extensions.crypt('PIN_BAHARU', extensions.gen_salt('bf'))
where key = 'madam_pin';
```

### Rate limit
- Madam: 3 cubaan PIN salah → kunci **5 minit** (client + server).
- Pelajar: 3 cubaan studentID salah → kunci **10 minit** (client + server).
- Server guna `private.pin_attempts`, `private.booking_attempts`, bucket ikut IP hash (`private.client_bucket()`).
- Reset masa testing:

```sql
delete from private.pin_attempts;
delete from private.booking_attempts;
```

### Selepas deploy
1. Hard refresh (`Ctrl + Shift + R`).
2. Test masuk Mod madam guna PIN `3915`.
3. Test PIN salah 3 kali → patut lock 5 minit.
4. Test studentID salah 3 kali → patut lock 10 minit.
5. Test flow biasa: tempah → Madam approve/reject (pelajar tak boleh cancel sendiri).

### Nota bug yang pernah berlaku
- Client `src/lib/rateLimit.ts`: `fails` direset setiap cubaan sebelum `lockedUntil` di-set → kiraan tak pernah cukup 3. Sudah dibetulkan — jangan guna semula logik lama.
- Server: `CREATE OR REPLACE FUNCTION` tak boleh tukar bahasa. Guna `DROP FUNCTION IF EXISTS` dulu.
- Deploy production ikut **Production branch** dalam Workers Builds. Jangan lupa merge `staging` → `main` sebelum lepas ke live.
