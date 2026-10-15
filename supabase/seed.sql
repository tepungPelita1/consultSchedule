-- =============================================================
-- seed.sql — Data awal (JADUAL SEBENAR Madam Idayati)
-- Universiti Teknologi MARA (UiTM) Cawangan Melaka
-- Semester September 2026 -- February 2027
-- JALANKAN SELEPAS migration 0001 – 0006
-- =============================================================

-- Senarai pelajar (allowlist)
-- name = kod pendek (dipapar pada blok) · full_name = nama penuh (hover/tap)
-- student_id: 10 digit nombor
-- (Jika migration 0006 belum dijalankan, baris di bawah tambah kolumnya.)
alter table public.allowlist
  add column if not exists full_name text not null default '';

insert into public.allowlist (student_id, name, full_name) values
  ('2025229096', 'SHU', 'NORSHUAIZAM BIN ABDUL SHUKOR'),
  ('2025423452', 'HKL', 'MUHAMMAD HAIKAL BIN JASMY HAIRUDDIN'),
  ('2025228256', 'BQS', 'NUR BALQIS BINTI MD AYUB'),
  ('2025429904', 'IZH', 'NUR IZZAH FATIN BINTI FADZLAH'),
  ('2025219938', 'IZT', 'IZZAT IZZANI BIN MOHD NASIR'),
  ('2025219828', 'HZQ', 'NOR HAZIQ EZMI BIN NORAZMI'),
  ('2025229238', 'AFQ', 'MUHAMMAD AFIQ BIN AZMAN')
on conflict (student_id) do update
  set name = excluded.name, full_name = excluded.full_name;

-- ===== JADUAL KELAS (week_start = NULL -> berulang setiap minggu) =====
-- Reset jadual berulang lama supaya boleh run seed berulang tanpa duplikasi
delete from public.class_blocks where week_start is null;

-- ----- JADUAL MADAM (pengajar) — ikut staging (src/lib/mock.ts) -----
insert into public.class_blocks (day_of_week, start_time, end_time, label, venue, owner) values
  (1, '14:00', '16:00', 'ICT602', 'M3CS2515B', 'madam'),
  (2, '10:00', '12:00', 'ITT400', 'M3CS2302A', 'madam'),
  (3, '14:00', '16:00', 'PHI428', 'M3CS2551A', 'madam'),
  (3, '16:00', '18:00', 'ICT602', 'M3CS2515A', 'madam'),
  (4, '08:00', '10:00', 'ICT602', 'M3CS2515B', 'madam'),
  (4, '10:00', '12:00', 'ITT400', 'M3CS2302A', 'madam'),
  (4, '14:00', '16:00', 'PHI428', 'M3CS2551B', 'madam'),
  (5, '08:00', '10:00', 'ICT602', 'M3CS2515A', 'madam'),
  (5, '10:00', '12:00', 'PHI428', 'M3CS2551B, M3CS2551A', 'madam');

-- ----- JADUAL PELAJAR — ikut staging (src/lib/mock.ts) -----
insert into public.class_blocks (day_of_week, start_time, end_time, label, venue, owner) values
  (1, '08:00', '10:00', 'ITT626 · Backend', 'DS 1B', 'student'),
  (1, '14:00', '16:00', 'ICT602 · Mobile', 'ODL', 'student'),
  (1, '16:00', '18:00', 'CSP600 · FYP', 'DS 2A', 'student'),
  (2, '08:00', '10:00', 'LCC500 · English', 'BK 19', 'student'),
  (2, '10:00', '12:00', 'CSP600 · FYP', 'BT 07', 'student'),
  (2, '14:00', '16:00', 'ITT593 · Forensic', 'ODL', 'student'),
  (3, '08:00', '10:00', 'ITT626 · Backend', 'JMK 4', 'student'),
  (3, '10:00', '12:00', 'ITT550 · Network', 'JMK 11', 'student'),
  (3, '14:00', '16:00', 'TAC501 · Arab', 'DS 4A', 'student'),
  (4, '08:00', '10:00', 'ICT602 · Mobile', 'JMB 1', 'student'),
  (4, '10:00', '12:00', 'ITT593 · Forensic', 'JMK 6', 'student'),
  (4, '14:00', '16:00', 'ITT550 · Network', 'ODL', 'student');
