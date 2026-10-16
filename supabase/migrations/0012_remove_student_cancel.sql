-- =============================================================
-- 0012_remove_student_cancel.sql
-- Buang keupayaan pelajar tarik balik tempahan sendiri.
-- Selepas ini, tempahan pending/approved hanya boleh diurus oleh
-- Madam (approve/reject) melalui Mod madam.
-- =============================================================

-- Buang RPC yang membenarkan pelajar batalkan tempahan ikut slot.
drop function if exists public.cancel_booking_by_slot(date, int, time, text);

-- Buang RPC lama (kalau masih ada di DB lama).
drop function if exists public.cancel_booking(uuid, text);
