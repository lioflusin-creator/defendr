-- =====================================================================
-- DEFENDR — rubrique « Prospects »
-- Les personnes invitées à s'inscrire (lien d'inscription ou dossier PDF)
-- et celles saisies à la main, en attendant qu'elles deviennent membres.
-- À exécuter une fois dans Supabase → Éditeur SQL.
-- =====================================================================
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  phone text,
  email text,
  source text not null default 'manuel' check (source in ('manuel', 'lien', 'pdf')),
  status text not null default 'a_contacter' check (status in ('a_contacter', 'invite', 'inscrit', 'abandon')),
  invited_at timestamptz,
  notes text,
  member_id uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.prospects enable row level security;
drop policy if exists "staff all" on public.prospects;
create policy "staff all" on public.prospects for all using (public.is_staff()) with check (public.is_staff());
