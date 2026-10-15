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
- **FR-3** Slot kosong 30 minit antara kelas boleh ditempah.
- **FR-4** Borang tempah: nama pendek + studentID + mod (Bersemuka/Online).
- **FR-5** Validasi: studentID mesti ada dalam `allowlist`; max 1 tempahan sehari; tempahan dibuka untuk minggu semasa + 2 minggu ke hadapan (prebooking).
- **FR-6** Tempahan status `pending` → Madam approve/reject.
- **FR-7** Soft reset mingguan (query ikut `week_start`).
- **FR-8** Navigasi minggu: ◀ ▶ + "Hari ini".
- **FR-9** Mod madam (checkbox): approve/reject, tambah/buang kelas tambahan, urus allowlist.
- **FR-10** i18n EN ⇄ BM + dark mode.

## 5. Peraturan Perniagaan
- **BR-1** Satu slot = 1 pelajar.
- **BR-2** Max 1 tempahan sehari/pelajar.
- **BR-3** Tempahan dibuka bagi minggu semasa + 2 minggu ke hadapan (prebooking). Navigasi minggu dihadkan pada tetingkap ini.
- **BR-4** Waktu kerja 08:00–18:00.
- **BR-5** `pending`/`approved` = penuh; `rejected` kembali kosong.

## 6. Aliran Pengguna
1. Pelajar buka `/` → lihat header folder + jadual minggu.
2. Klik slot kosong → modal → isi nama + studentID + mod → hantar.
3. Sistem sahkan allowlist → simpan `pending`.
4. Madam buka "Mod madam" → approve/reject; tambah kelas tambahan; urus allowlist.
5. Slot update (approved = hijau ✓, pending = amber).

## 7. Keperluan Bukan-Fungsional
- Responsive: board scroll melintang, label hari sticky.
- Security: RLS + RPC (allowlist validasi server-side).
- Akses Mod madam: tanpa login (risiko diterima — circle kecil).

## 8. Model Data
`allowlist(student_id, name)` · `class_blocks(day_of_week, start_time, end_time, label, venue, week_start)` · `bookings(week_start, day_of_week, slot_start, slot_end, student_id, student_name, mode, status)`.

## 9. Tech Stack
React + Vite + TS + Tailwind v4 · Supabase (Postgres/RLS/RPC/Realtime) · @tanstack/react-query · react-hook-form + zod · sonner · date-fns · Instrument Sans · Netlify.

## 10. Open Items
- [ ] Username Telegram Madam (butang "PM Madam").
- [ ] Warna header folder (kuning default; boleh rotate).

## 11. Kriteria Selesai
Build + lint lulus · jadual render dengan kelas sebenar · booking flow (allowlist + pending) · Mod madam approve/reject + allowlist + kelas tambahan · i18n EN/BM · soft reset disahkan.
