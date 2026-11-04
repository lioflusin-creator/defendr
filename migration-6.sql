-- =====================================================================
-- DEFENDR — chapitres de la planification annuelle réglables dans Paramètres
-- À exécuter une fois dans Supabase → Éditeur SQL.
-- =====================================================================
alter table public.club_settings
  add column if not exists plan_sections text[];
