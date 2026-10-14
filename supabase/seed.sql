-- =============================================================
-- seed.sql — Data awal (JADUAL SEBENAR Madam Idayati)
-- Universiti Teknologi MARA (UiTM) Cawangan Melaka
-- Semester September 2026 -- February 2027
-- JALANKAN SELEPAS migration 0001 – 0004
-- =============================================================

-- Contoh allowlist (gantikan dengan senarai pelajar sebenar)
-- Format student_id: 10 digit nombor
insert into public.allowlist (student_id, name) values
  ('2025229096', 'SHU')
on conflict (student_id) do nothing;

-- ===== JADUAL KELAS (week_start = NULL -> berulang setiap minggu) =====
-- Reset jadual berulang lama supaya boleh run seed berulang tanpa duplikasi
delete from public.class_blocks where week_start is null;

-- ----- JADUAL MADAM (pengajar) — edit di sini -----
insert into public.class_blocks (day_of_week, start_time, end_time, label, venue, owner) values
  (1, '08:00', '10:00', 'ITT626 · Backend', 'DS 1B', 'madam'),
  (1, '14:00', '16:00', 'ICT602 · Mobile', 'ODL', 'madam'),
  (1, '16:00', '18:00', 'CSP600 · Proposal', 'DS 2A', 'madam'),
  (2, '08:00', '10:00', 'LCC500 · English', 'BK 19', 'madam'),
  (2, '10:00', '12:00', 'CSP600 · Proposal', 'BT 07', 'madam'),
  (2, '14:00', '16:00', 'ITT593 · Forensic', 'ODL', 'madam'),
  (3, '08:00', '10:00', 'ITT626 · Backend', 'JMK 4', 'madam'),
  (3, '10:00', '12:00', 'ITT550 · Network', 'Lab 11', 'madam'),
  (3, '14:00', '16:00', 'TAC501 · Arab', 'DS 4A', 'madam'),
  (4, '08:00', '10:00', 'ICT602 · Mobile', 'JMB 1', 'madam'),
  (4, '10:00', '12:00', 'ITT593 · Forensic', 'JMK 6', 'madam'),
  (4, '14:00', '16:00', 'ITT550 · Network', 'ODL', 'madam'),
  (5, '08:00', '08:50', 'ICT602 · Mobile', 'M3CS2515A', 'madam'),
  (5, '09:00', '09:50', 'ICT602 · Mobile', 'M3CS2515A', 'madam'),
  (5, '10:00', '10:50', 'PHI428', 'M3CS2551B, M3CS2551A · Dewan Kuliah A', 'madam'),
  (5, '11:00', '11:50', 'PHI428', 'M3CS2551B, M3CS2551A · Dewan Kuliah A', 'madam');

-- ----- JADUAL PELAJAR — edit di sini -----
insert into public.class_blocks (day_of_week, start_time, end_time, label, venue, owner) values
  (1, '08:00', '10:00', 'ITT626 · Backend', 'DS 1B', 'student'),
  (1, '14:00', '16:00', 'ICT602 · Mobile', 'ODL', 'student'),
  (1, '16:00', '18:00', 'CSP600 · Proposal', 'DS 2A', 'student'),
  (2, '08:00', '10:00', 'LCC500 · English', 'BK 19', 'student'),
  (2, '10:00', '12:00', 'CSP600 · Proposal', 'BT 07', 'student'),
  (2, '14:00', '16:00', 'ITT593 · Forensic', 'ODL', 'student'),
  (3, '08:00', '10:00', 'ITT626 · Backend', 'JMK 4', 'student'),
  (3, '10:00', '12:00', 'ITT550 · Network', 'Lab 11', 'student'),
  (3, '14:00', '16:00', 'TAC501 · Arab', 'DS 4A', 'student'),
  (4, '08:00', '10:00', 'ICT602 · Mobile', 'JMB 1', 'student'),
  (4, '10:00', '12:00', 'ITT593 · Forensic', 'JMK 6', 'student'),
  (4, '14:00', '16:00', 'ITT550 · Network', 'ODL', 'student'),
  (5, '08:00', '08:50', 'ICT602 · Mobile', 'M3CS2515A', 'student'),
  (5, '09:00', '09:50', 'ICT602 · Mobile', 'M3CS2515A', 'student'),
  (5, '10:00', '10:50', 'PHI428', 'M3CS2551B, M3CS2551A · Dewan Kuliah A', 'student'),
  (5, '11:00', '11:50', 'PHI428', 'M3CS2551B, M3CS2551A · Dewan Kuliah A', 'student');
