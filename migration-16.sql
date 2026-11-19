-- =====================================================================
-- DEFENDR — suivi des déclarations à l'ADAC National
-- Note sur chaque fiche la date du dernier envoi au tableau des adhérents
-- ADAC et la saison concernée (badge « Déclaré à l'ADAC » et filtre
-- « Pas déclarés à l'ADAC » dans la liste des membres).
-- À exécuter une fois dans Supabase → Éditeur SQL (après migration-15.sql).
-- =====================================================================
alter table public.members
  add column if not exists adac_sent_at date,
  add column if not exists adac_season_id uuid references public.seasons(id) on delete set null;
