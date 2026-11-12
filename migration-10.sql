-- =====================================================================
-- DEFENDR — prospects (cours d'essai, suivi), réinscription de saison,
-- restauration complète et historique des modifications.
-- À exécuter une fois dans Supabase → Éditeur SQL (après migration-9.sql).
-- =====================================================================

-- ---------- Prospects : cours d'essai et date d'inscription ----------
alter table public.prospects
  add column if not exists trial_date date,
  add column if not exists trial_course_id uuid references public.courses(id) on delete set null,
  add column if not exists trial_present boolean not null default false,
  add column if not exists converted_at timestamptz;
alter table public.prospects drop constraint if exists prospects_status_check;
alter table public.prospects add constraint prospects_status_check
  check (status in ('a_contacter', 'invite', 'essai', 'inscrit', 'abandon'));

-- ---------- Réinscription : lien personnel et saison de réinscription ----------
alter table public.members
  add column if not exists renewal_token uuid default gen_random_uuid(),
  add column if not exists renewal_sent_at timestamptz,
  add column if not exists renewed_season_id uuid references public.seasons(id) on delete set null;
update public.members set renewal_token = gen_random_uuid() where renewal_token is null;
create unique index if not exists members_renewal_token on public.members (renewal_token);

-- Ce que la page d'inscription peut pré-remplir à partir du lien personnel (rien d'autre)
create or replace function public.renewal_info(p_token uuid) returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'first_name', first_name, 'last_name', last_name, 'birth_date', birth_date, 'gender', gender,
    'phone', phone, 'email', email, 'address', address, 'tshirt_size', tshirt_size,
    'emergency_contact', emergency_contact, 'emergency_phone', emergency_phone,
    'guardian_name', guardian_name, 'guardian_phone', guardian_phone, 'guardian_email', guardian_email, 'pickup_persons', pickup_persons)
  from public.members where renewal_token = p_token
$$;
revoke all on function public.renewal_info(uuid) from public;
grant execute on function public.renewal_info(uuid) to anon, authenticated;

-- ---------- Historique des modifications ----------
create table if not exists public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,
  user_name text,
  table_name text not null,
  row_id text,
  action text not null,
  label text,
  changes jsonb
);
create index if not exists audit_log_at on public.audit_log (at desc);
create index if not exists audit_log_row on public.audit_log (row_id);
alter table public.audit_log enable row level security;
drop policy if exists "admin lit" on public.audit_log;
create policy "admin lit" on public.audit_log for select using (public.is_admin());
-- Personne ne peut écrire ni effacer l'historique : seuls les déclencheurs ci-dessous l'alimentent.

create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  diff jsonb := null;
  k text;
  lbl text;
  who uuid := auth.uid();
begin
  if coalesce(current_setting('defendr.restoring', true), '') = '1' then return null; end if;
  if tg_op = 'UPDATE' then
    diff := '{}'::jsonb;
    for k in select jsonb_object_keys(r) loop
      if k not in ('updated_at', 'created_at', 'renewal_token') and (to_jsonb(old) -> k) is distinct from (r -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(to_jsonb(old) -> k, r -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then return null; end if;
  elsif tg_op = 'DELETE' then
    diff := r - 'renewal_token'; -- copie de ce qui a été supprimé
  end if;
  lbl := coalesce(nullif(trim(coalesce(r->>'first_name', '') || ' ' || coalesce(r->>'last_name', '')), ''), r->>'label', r->>'title', r->>'club_name');
  if tg_table_name = 'payments' then
    lbl := concat_ws(' · ', (select first_name || ' ' || last_name from public.members where id = (r->>'member_id')::uuid), r->>'payment_type', (r->>'amount') || ' €');
  elsif tg_table_name = 'expenses' then
    lbl := concat_ws(' · ', lbl, (r->>'amount') || ' €');
  elsif tg_table_name = 'courses' then
    lbl := concat_ws(' · ', lbl, r->>'course_date');
  end if;
  insert into public.audit_log (user_id, user_name, table_name, row_id, action, label, changes)
  values (who, (select full_name from public.profiles where id = who), tg_table_name, r->>'id',
          case tg_op when 'INSERT' then 'ajout' when 'UPDATE' then 'modification' else 'suppression' end, lbl, diff);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['members', 'payments', 'expenses', 'prospects', 'courses', 'seasons', 'club_settings'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- ---------- Restauration : les prospects sont aussi remis en place ----------
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

  perform set_config('defendr.restoring', '1', true); -- pas d'historique ligne à ligne pendant la restauration
  if jsonb_typeof(payload->'prospects') = 'array' then delete from public.prospects where true; end if;
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
  if jsonb_typeof(payload->'prospects') = 'array' then
    insert into public.prospects select * from jsonb_populate_recordset(null::public.prospects, payload->'prospects');
  end if;

  if has_settings then
    delete from public.club_settings where true;
    insert into public.club_settings select * from jsonb_populate_recordset(null::public.club_settings, payload->'club_settings') limit 1;
  end if;

  insert into public.audit_log (user_id, user_name, table_name, action, label)
    values (auth.uid(), (select full_name from public.profiles where id = auth.uid()), 'restauration', 'restauration', 'Données restaurées depuis une sauvegarde');

  return json_build_object(
    'membres', (select count(*) from public.members),
    'paiements', (select count(*) from public.payments),
    'depenses', (select count(*) from public.expenses),
    'seances', (select count(*) from public.courses),
    'presences', (select count(*) from public.attendances),
    'planification', (select count(*) from public.plan_items),
    'prospects', (select count(*) from public.prospects));
end $$;
revoke all on function public.restore_backup(jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb) to authenticated;
