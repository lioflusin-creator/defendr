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
