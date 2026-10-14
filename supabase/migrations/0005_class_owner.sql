-- =============================================================
-- 0005_class_owner.sql — Pemilik kelas: madam | student
-- Run selepas 0001 – 0004
-- =============================================================

alter table public.class_blocks
  add column if not exists owner text not null default 'madam';

alter table public.class_blocks
  drop constraint if exists class_blocks_owner_check;

alter table public.class_blocks
  add constraint class_blocks_owner_check check (owner in ('madam', 'student'));
