-- =====================================================================
-- DEFENDR — évolutions : mineurs, attestations, grades, lien séances/programme,
-- inscriptions en ligne
-- =====================================================================

-- Mineurs : responsable légal et autorisations
alter table public.members
  add column if not exists guardian_name text,
  add column if not exists guardian_phone text,
  add column if not exists guardian_email text,
  add column if not exists parental_authorization boolean not null default false,
  add column if not exists pickup_persons text;

-- Informations du club pour les attestations
alter table public.club_settings
  add column if not exists club_address text,
  add column if not exists club_legal_id text,
  add column if not exists president_name text,
  add column if not exists club_email text;

-- Historique des niveaux (passages de grade)
create table if not exists public.level_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  from_level_id uuid references public.levels(id) on delete set null,
  to_level_id uuid references public.levels(id) on delete set null,
  changed_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.level_history enable row level security;
create policy "staff all" on public.level_history for all using (public.is_staff()) with check (public.is_staff());

-- Enregistre automatiquement chaque changement de niveau
create or replace function public.log_level_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.level_id is distinct from old.level_id then
    insert into public.level_history (member_id, from_level_id, to_level_id) values (new.id, old.level_id, new.level_id);
  end if;
  return new;
end $$;
drop trigger if exists members_level_change on public.members;
create trigger members_level_change after update of level_id on public.members
  for each row execute function public.log_level_change();

-- Éléments du programme travaillés pendant une séance
create table if not exists public.course_plan_items (
  course_id uuid not null references public.courses(id) on delete cascade,
  plan_item_id uuid not null references public.plan_items(id) on delete cascade,
  primary key (course_id, plan_item_id)
);
alter table public.course_plan_items enable row level security;
create policy "staff all" on public.course_plan_items for all using (public.is_staff()) with check (public.is_staff());

-- Demandes d'inscription en ligne : n'importe qui peut en ENVOYER une,
-- personne ne peut les LIRE à part l'équipe du club.
create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'nouvelle' check (status in ('nouvelle', 'validée', 'refusée')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  constraint registration_size check (pg_column_size(data) < 20000)
);
alter table public.registrations enable row level security;
create policy "public envoie" on public.registrations for insert to anon, authenticated
  with check (status = 'nouvelle');
create policy "staff lit" on public.registrations for select using (public.is_staff());
create policy "admin gere" on public.registrations for update using (public.is_admin()) with check (public.is_admin());
create policy "admin supprime" on public.registrations for delete using (public.is_admin());
