-- =====================================================================
-- DEFENDR — liaison avec le tableur ADAC National
-- À exécuter une fois dans Supabase → SQL Editor.
-- =====================================================================
alter table public.club_settings
  add column if not exists adac_url text,
  add column if not exists adac_key text,
  add column if not exists adac_discipline text default 'BDR';
