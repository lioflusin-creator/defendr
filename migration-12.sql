-- =====================================================================
-- DEFENDR — remise des T-shirts : date à laquelle le T-shirt a été remis
-- au membre (vide = pas encore remis).
-- À exécuter une fois dans Supabase → Éditeur SQL (après migration-11.sql).
-- =====================================================================
alter table public.members
  add column if not exists tshirt_given_at date;
