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
