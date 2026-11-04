-- =====================================================================
-- DEFENDR — structure de la base de données (Supabase / PostgreSQL)
-- =====================================================================

-- ---------- Comptes utilisateurs et rôles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'en_attente' check (role in ('admin','enseignant','en_attente')),
  created_at timestamptz not null default now()
);

-- Le premier compte créé devient administrateur. Les suivants sont « en attente »
-- et n'ont accès à rien tant que l'administrateur ne les a pas validés.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    case when exists (select 1 from public.profiles) then 'en_attente' else 'admin' end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','enseignant'));
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- Paramètres du club (une seule ligne) ----------
create table public.club_settings (
  id int primary key default 1 check (id = 1),
  club_name text not null default 'Mon club',
  fee_new numeric(10,2),
  fee_returning numeric(10,2),
  fee_jobseeker numeric(10,2),
  fee_student numeric(10,2),
  default_start_time time default '19:00',
  default_end_time time default '20:30',
  whatsapp_number text,
  revenue_types text[] not null default array['Cotisation mensuelle','Cotisation annuelle','Stage','Équipement','Autre'],
  expense_categories text[] not null default array['Loyer','Équipement','Salaires','Assurance','Communication','Entretien','Événement','Fournitures','Autre'],
  rooms text[] not null default array[]::text[],
  threshold_assidu int not null default 70,
  threshold_regulier int not null default 45,
  threshold_risque int not null default 25,
  updated_at timestamptz not null default now()
);
insert into public.club_settings (id) values (1);

-- ---------- Saisons ----------
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  label text not null,                       -- ex : 2026/2027
  opening_balance numeric(10,2) not null default 0,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index one_active_season on public.seasons (is_active) where is_active;

-- ---------- Disciplines et niveaux ----------
create table public.disciplines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  color text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.levels (
  id uuid primary key default gen_random_uuid(),
  rank int not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Membres ----------
create table public.members (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  address text,
  birth_date date,
  gender text,
  discipline_id uuid references public.disciplines(id) on delete set null,
  level_id uuid references public.levels(id) on delete set null,
  status text not null default 'actif' check (status in ('actif','inactif')),
  member_role text not null default 'membre',
  registration_date date default current_date,
  tshirt_size text,
  fee_type text,
  fee_amount numeric(10,2),
  emergency_contact text,
  emergency_phone text,
  medical_certificate boolean not null default false,
  qss boolean not null default false,
  medical_waiver boolean not null default false,
  how_found text,
  other_defense_sport boolean not null default false,
  other_defense_sport_details text,
  consent_image boolean not null default false,
  consent_data boolean not null default false,
  rules_read boolean not null default false,
  rules_accepted boolean not null default false,
  insurance_informed boolean not null default false,
  medical_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Planning (séances) et présences ----------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete set null,
  title text not null,
  discipline_id uuid references public.disciplines(id) on delete set null,
  room text,
  course_date date not null,
  start_time time,
  end_time time,
  notes text,
  created_at timestamptz not null default now()
);

create table public.attendances (
  course_id uuid not null references public.courses(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  present boolean not null default true,
  notes text,
  primary key (course_id, member_id)
);

-- ---------- Comptabilité ----------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete set null,
  member_id uuid references public.members(id) on delete set null,
  payment_type text not null,
  amount numeric(10,2) not null,
  method text,                               -- espèces, chèque, virement, CB…
  payment_date date not null default current_date,
  status text not null default 'payé' check (status in ('payé','en attente')),
  bank_checked boolean not null default false,
  archived boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete set null,
  label text not null,
  category text,
  amount numeric(10,2) not null,
  method text,
  expense_date date not null default current_date,
  bank_checked boolean not null default false,
  archived boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Planification annuelle ----------
create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete cascade,
  month int not null check (month between 1 and 12),
  category text not null,                    -- Technico tactique, Connaissances générales…
  label text not null,
  done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- SÉCURITÉ : seules les personnes connectées et autorisées accèdent aux données
-- Admin : tout. Enseignant : membres, planning, présences, planification
-- (lecture seule sur la comptabilité masquée, paramètres en lecture).
-- =====================================================================
alter table public.profiles       enable row level security;
alter table public.club_settings  enable row level security;
alter table public.seasons        enable row level security;
alter table public.disciplines    enable row level security;
alter table public.levels         enable row level security;
alter table public.members        enable row level security;
alter table public.courses        enable row level security;
alter table public.attendances    enable row level security;
alter table public.payments       enable row level security;
alter table public.expenses       enable row level security;
alter table public.plan_items     enable row level security;

-- Profils : chacun voit les profils de l'équipe, seul l'admin les modifie
create policy "staff read profiles"  on public.profiles for select using (public.is_staff() or id = auth.uid());
create policy "admin write profiles" on public.profiles for update using (public.is_admin());

-- Tables accessibles en lecture à l'équipe, en écriture à l'admin
create policy "staff read"  on public.club_settings for select using (public.is_staff());
create policy "admin write" on public.club_settings for all using (public.is_admin()) with check (public.is_admin());
create policy "staff read"  on public.seasons for select using (public.is_staff());
create policy "admin write" on public.seasons for all using (public.is_admin()) with check (public.is_admin());
create policy "staff read"  on public.disciplines for select using (public.is_staff());
create policy "admin write" on public.disciplines for all using (public.is_admin()) with check (public.is_admin());
create policy "staff read"  on public.levels for select using (public.is_staff());
create policy "admin write" on public.levels for all using (public.is_admin()) with check (public.is_admin());

-- Tables utilisées par toute l'équipe au quotidien
create policy "staff all" on public.members     for all using (public.is_staff()) with check (public.is_staff());
create policy "staff all" on public.courses     for all using (public.is_staff()) with check (public.is_staff());
create policy "staff all" on public.attendances for all using (public.is_staff()) with check (public.is_staff());
create policy "staff all" on public.plan_items  for all using (public.is_staff()) with check (public.is_staff());

-- Comptabilité : réservée à l'admin
create policy "admin all" on public.payments for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.expenses for all using (public.is_admin()) with check (public.is_admin());

-- Mise à jour automatique des dates de modification
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger members_touch  before update on public.members       for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.club_settings for each row execute function public.touch_updated_at();

-- Colonnes ajoutées lors de la reprise des données Base44
alter table public.members add column if not exists medical_waiver_validity date, add column if not exists legacy text;
alter table public.courses add column if not exists file_url text, add column if not exists file_name text, add column if not exists instructor text, add column if not exists legacy text;
alter table public.payments add column if not exists due_date date;
alter table public.expenses add column if not exists supplier text;
alter table public.disciplines add column if not exists legacy text;
alter table public.levels add column if not exists legacy text;

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

-- =====================================================================
-- DEFENDR — rôle Trésorier (accès complet, comme le Président)
-- 'admin' = Président(e) ; 'tresorier' = Trésorier(ère) ; 'enseignant' ; 'en_attente'
-- =====================================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'tresorier', 'enseignant', 'en_attente'));

-- Accès complet : président et trésorier
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'tresorier'));
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'tresorier', 'enseignant'));
$$;

create or replace function public.is_president()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Gestion de l'équipe : le trésorier peut valider les enseignants,
-- mais seul le président peut modifier un compte président ou nommer un président.
drop policy if exists "admin write profiles" on public.profiles;
create policy "admin write profiles" on public.profiles for update
  using (public.is_president() or (public.is_admin() and role <> 'admin'))
  with check (public.is_president() or role <> 'admin');

-- =====================================================================
-- DEFENDR — restauration complète depuis une sauvegarde
-- Tout se fait en une seule transaction : en cas d'erreur, rien n'est modifié.
-- Réservé au président. Les comptes utilisateurs et les fichiers de cours sont conservés.
-- =====================================================================
create or replace function public.restore_backup(payload jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  has_settings boolean := jsonb_typeof(payload->'club_settings') = 'array' and jsonb_array_length(payload->'club_settings') > 0;
begin
  if not public.is_president() then
    raise exception 'La restauration est réservée au président.';
  end if;
  if jsonb_typeof(payload->'members') is distinct from 'array' then
    raise exception 'Fichier de sauvegarde invalide : onglet Membres introuvable.';
  end if;

  delete from public.attendances where true;
  delete from public.course_plan_items where true;
  delete from public.level_history where true;
  delete from public.payments where true;
  delete from public.expenses where true;
  delete from public.plan_items where true;
  delete from public.courses where true;
  delete from public.members where true;
  delete from public.levels where true;
  delete from public.disciplines where true;
  delete from public.seasons where true;

  insert into public.seasons     select * from jsonb_populate_recordset(null::public.seasons,     coalesce(payload->'seasons', '[]'));
  insert into public.disciplines select * from jsonb_populate_recordset(null::public.disciplines, coalesce(payload->'disciplines', '[]'));
  insert into public.levels      select * from jsonb_populate_recordset(null::public.levels,      coalesce(payload->'levels', '[]'));
  insert into public.members     select * from jsonb_populate_recordset(null::public.members,     payload->'members');
  insert into public.courses     select * from jsonb_populate_recordset(null::public.courses,     coalesce(payload->'courses', '[]'));
  insert into public.plan_items  select * from jsonb_populate_recordset(null::public.plan_items,  coalesce(payload->'plan_items', '[]'));
  insert into public.attendances select * from jsonb_populate_recordset(null::public.attendances, coalesce(payload->'attendances', '[]'));
  insert into public.course_plan_items select * from jsonb_populate_recordset(null::public.course_plan_items, coalesce(payload->'course_plan_items', '[]'));
  insert into public.level_history select * from jsonb_populate_recordset(null::public.level_history, coalesce(payload->'level_history', '[]'));
  insert into public.payments    select * from jsonb_populate_recordset(null::public.payments,    coalesce(payload->'payments', '[]'));
  insert into public.expenses    select * from jsonb_populate_recordset(null::public.expenses,    coalesce(payload->'expenses', '[]'));

  if has_settings then
    delete from public.club_settings where true;
    insert into public.club_settings select * from jsonb_populate_recordset(null::public.club_settings, payload->'club_settings') limit 1;
  end if;

  return json_build_object(
    'membres', (select count(*) from public.members),
    'paiements', (select count(*) from public.payments),
    'depenses', (select count(*) from public.expenses),
    'seances', (select count(*) from public.courses),
    'presences', (select count(*) from public.attendances),
    'planification', (select count(*) from public.plan_items));
end $$;

revoke all on function public.restore_backup(jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb) to authenticated;

-- =====================================================================
-- DEFENDR — infos publiques du club pour la fiche d'inscription en ligne
-- =====================================================================
create or replace function public.public_club_info() returns json language sql stable security definer set search_path = public as $$
  select json_build_object('club_name', club_name, 'fee_new', fee_new, 'fee_returning', fee_returning, 'fee_jobseeker', fee_jobseeker, 'fee_student', fee_student, 'club_email', club_email) from public.club_settings where id = 1
$$;
revoke all on function public.public_club_info() from public;
grant execute on function public.public_club_info() to anon, authenticated;

-- =====================================================================
-- DEFENDR — espace de stockage privé des fichiers de cours
-- =====================================================================
insert into storage.buckets (id, name, public) values ('cours', 'cours', false) on conflict (id) do nothing;
create policy "staff lit cours" on storage.objects for select to authenticated using (bucket_id = 'cours' and public.is_staff());
create policy "staff ajoute cours" on storage.objects for insert to authenticated with check (bucket_id = 'cours' and public.is_staff());
create policy "staff modifie cours" on storage.objects for update to authenticated using (bucket_id = 'cours' and public.is_staff());
create policy "staff supprime cours" on storage.objects for delete to authenticated using (bucket_id = 'cours' and public.is_staff());

-- Liaison avec le tableur ADAC National (migration-5.sql)
alter table public.club_settings
  add column if not exists adac_url text,
  add column if not exists adac_key text,
  add column if not exists adac_discipline text default 'BDR';

-- Chapitres de la planification annuelle (migration-6.sql)
alter table public.club_settings
  add column if not exists plan_sections text[];

-- Documents du club et justificatifs d’inscription (migration-7.sql)
-- =====================================================================

-- Paramètres : coordonnées bancaires, fédération, liste des documents du club
alter table public.club_settings
  add column if not exists bank_holder text,
  add column if not exists bank_iban text,
  add column if not exists bank_bic text,
  add column if not exists bank_name text,
  add column if not exists federation_label text default 'l''ADAC',
  add column if not exists club_documents jsonb not null default '{}'::jsonb;

-- Fiche membre : justificatifs de santé reçus avec l'inscription en ligne
alter table public.members add column if not exists health_files jsonb;

-- Documents du club : lisibles par tous (la page d'inscription les propose
-- au téléchargement), modifiables seulement par le président et le trésorier.
insert into storage.buckets (id, name, public, file_size_limit)
  values ('documents', 'documents', true, 15728640)
  on conflict (id) do update set public = true;
drop policy if exists "admin ajoute documents" on storage.objects;
drop policy if exists "admin modifie documents" on storage.objects;
drop policy if exists "admin supprime documents" on storage.objects;
create policy "admin ajoute documents" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and public.is_admin());
create policy "admin modifie documents" on storage.objects for update to authenticated using (bucket_id = 'documents' and public.is_admin());
create policy "admin supprime documents" on storage.objects for delete to authenticated using (bucket_id = 'documents' and public.is_admin());

-- Justificatifs de santé envoyés à l'inscription : tout le monde peut en
-- ENVOYER (sans pouvoir lire ni remplacer quoi que ce soit), seule l'équipe
-- du club peut les LIRE.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('inscriptions', 'inscriptions', false, 10485760,
          array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
  on conflict (id) do nothing;
drop policy if exists "public envoie justificatif" on storage.objects;
drop policy if exists "staff lit justificatifs" on storage.objects;
drop policy if exists "admin supprime justificatifs" on storage.objects;
create policy "public envoie justificatif" on storage.objects for insert to anon, authenticated with check (bucket_id = 'inscriptions');
create policy "staff lit justificatifs" on storage.objects for select to authenticated using (bucket_id = 'inscriptions' and public.is_staff());
create policy "admin supprime justificatifs" on storage.objects for delete to authenticated using (bucket_id = 'inscriptions' and public.is_admin());

-- Infos publiques pour la page d'inscription : on ajoute le RIB et les documents
create or replace function public.public_club_info() returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'club_name', club_name, 'fee_new', fee_new, 'fee_returning', fee_returning, 'fee_jobseeker', fee_jobseeker, 'fee_student', fee_student,
    'club_email', club_email, 'bank_holder', bank_holder, 'bank_iban', bank_iban, 'bank_bic', bank_bic, 'bank_name', bank_name,
    'club_documents', club_documents)
  from public.club_settings where id = 1
$$;
revoke all on function public.public_club_info() from public;
grant execute on function public.public_club_info() to anon, authenticated;
