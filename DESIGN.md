# DESIGN.md — Kalendar Konsultasi (Folder-Card × Hand-Drawn Fusion)

> Reka bentuk UI sistem jadual konsultasi **Anak-Anak Madam Idayati**.
> Gabungan "folder card" bersih + sentuhan zine (kucing maskot, header kuning).

## 1. Tujuan
Calendar konsultasi untuk madam. Paparan **minggu melintang** (macam Google Calendar week view, masa di paksi-X). Madam ada kelas pada waktu kerja; masa **kosong** boleh ditempah pelajar sebagai slot konsultasi.

## 2. Gaya Visual
Fusion dua rujukan:
1. **Folder cards** (utama): sans-serif bersih, warna pastel flat, garis nipis 1px, bentuk tab folder, label kecil huruf besar.
2. **Zine calendar** (sentuhan): kucing kecil sebagai maskot, header kuning.

Prinsip: **senang dibaca dulu**. Tiada tekstur grain, tiada garisan bergoyang, tiada font tebal/dekoratif.

## 3. Warna
| Token | Hex | Guna |
|---|---|---|
| `--paper` | `#FDF7F3` | Background halaman (dark: `#1E1B19`) |
| `--card` | `#FFFDFB` | Papan timeline (dark: `#27231F`) |
| `--ink` | `#1B1B1B` | Teks & garis (dark: `#F3EDE8`) |
| `--yellow` | `#E8C95A` | Header folder |
| `--lgreen` | `#E5F0D5` | Slot kosong (hover: `--green #4CA460`) |
| `--teal` | `#55A7BA` | Masa ada kelas |
| `--amber` | `#EC9E54` | Slot ditempah |
| `--orange` | `#F26B3A` | Hari ini + garis masa sekarang |
| `--peach` | `#F8D8AC` | Pop-up tempahan |

Teks di atas warna pastel sentiasa `#1B1B1B` (tetap, walaupun dark mode).

## 4. Tipografi
- Font body: **Instrument Sans** (400/500/600), fallback Inter, system-ui.
- Font tajuk bulan: **Space Grotesk** (500/600), fallback Instrument Sans — nampak “zine” tapi masih bersih.
- Tajuk bulan: 500, `letter-spacing:-0.035em`, `clamp(2rem,7vw,3.4rem)`.
- Label (hari, jam, tarikh kecil): 11px, UPPERCASE, `letter-spacing:.09em`, 500.
- Nama dalam blok: 15px, 500.

## 5. Layout
```
┌─ folder header (kuning, tab di kiri atas) ─────────────┐
│ □                                      [kucing kecil]  │
│ Oktober 2026                                           │
│ KONSULTASI · ISN–JUM · 8 PAGI–6 PTG     ← [Hari ini] →│
└────────────────────────────────────────────────────────┘
11 Okt – 17 Okt 2026            ▢ Kosong ▢ Ada kelas ▢ Ditempah
┌──────┬8 AM─┬9 AM─┬10 AM┬ ... ┬5 PM─┐   (20 kolum, 08:00–18:00, slot 30 min)
│ ISN  │  +  │  +  │[Kelas]│ ...       │
│ SEL● │  +  │  +  │[Kelas]│ ...       │  ● = hari ini, garis oren = masa sekarang
└──────┴─────┴─────┴─────┴──────┴──────┘
N slot kosong minggu ini        ☐ Mod madam
```
- Lajur kiri (label hari) sticky bila scroll ke tepi di mobile.
- Min-width timeline 1100px; board `overflow-x:auto`.
- Bentuk folder: `clip-path` dua lapisan (luar = garis, dalam = isi) dengan tab 170px.

## 6. Komponen Slot (satu slot = 30 minit)
| Jenis | Rupa | Tindakan |
|---|---|---|
| Kelas | Teal, label kod subjek + julat masa | Tak boleh ditempah |
| Kosong | Hijau muda, "+" di tengah | Ketik → pop-up nama + ID + mod → Tempah |
| Ditempah (pending) | Amber pucat, nama + "menunggu" | Ketik → pop-up (madam: approve/reject) |
| Ditempah (approved) | Hijau pekat + ✓ | Ketik → pop-up |
| Lepas | Lutsinar 35%, garis titik | Tak boleh ditekan |
| Mod madam | Tick kotak → ketik slot kosong = tambah kelas; ketik kelas tambahan = buang | — |

Blok: border 1px, radius 6px, padding 8px 9px, nama atas / masa kecil bawah.

## 7. Logik & Data
- Waktu kerja: `H0=8`, `H1=18`, slot **30 minit** (20 kolum). Isnin–Jumaat.
- Jadual kelas mingguan (hardcode di `supabase/seed.sql`): `class_blocks` dengan `week_start = null` (berulang).
- Kelas tambahan (Mod madam): `class_blocks` dengan `week_start` = minggu tertentu.
- Status slot (keutamaan): **ditempah → kelas tambahan → kelas mingguan → kosong**.
- Backend: **Supabase** (Postgres + RLS + RPC). `bookings` sah dalam tetingkap minggu semasa + 2 minggu ke hadapan (prebooking). Mulai 12:00AM Sabtu, "minggu semasa" lompat ke minggu hadapan (rollover hujung minggu) — pelajar terus nampak jadual minggu baru.
- Navigasi: ◀ ▶ tukar minggu, "Hari ini" balik ke minggu semasa. Minggu bermula Isnin.

## 8. Do / Don't
**Do:** garis nipis 1px, warna flat, ruang selesa, teks gelap atas pastel, responsif (scroll melintang di phone), fokus keyboard nampak.
**Don't:** gradient, shadow lembut, grain, font tulisan tangan, garisan bergoyang, lebih dari satu warna aksen oren.

## 9. Adaptasi Sistem Kita (Supabase + Approval + 30 min)
1. **Slot = 30 minit** (bukan 1 jam) → paksi-X = 20 kolum; kelas dirender ikut masa sebenar (cth 14:00–15:50) dengan posisi absolut berasaskan minit.
2. **Tempahan** masuk status `pending` → Madam approve/reject (bukan terus "ditempah").
3. **Allowlist**: pelajar mesti wujud dalam `allowlist` (studentID) untuk tempah.
4. **Mod madam** (checkbox di halaman utama, menggantikan `/admin`): approve/reject, tambah/buang kelas tambahan, urus senarai pelajar.
5. **i18n**: toggle EN ⇄ BM.
6. **Dark mode**: `prefers-color-scheme` + `data-theme`; toggle dengan klik ikon kucing (warna kucing & jadual berubah).
7. Kelas di-render dengan kod subjek + tempat (venue) dari `class_blocks`.

## 10. Teknikal
- Supabase migration: `supabase/migrations/0001_init.sql` + `0002_class_blocks.sql`.
- Seed jadual sebenar: `supabase/seed.sql`.
- RPC: `get_week_slots`, `book_slot`, `set_booking_status`, `add_allowlist`, `remove_allowlist`, `add_extra_class_block`, `remove_extra_class_block`.
