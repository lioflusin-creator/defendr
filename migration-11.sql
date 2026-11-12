-- =====================================================================
-- DEFENDR — rubrique « Stages » : stages ponctuels (ex : stage 100 % féminin)
-- envoyés par WhatsApp aux prospects et aux adhérents, avec le suivi des envois.
-- À exécuter une fois dans Supabase → Éditeur SQL (après migration-10.sql).
-- =====================================================================
create table if not exists public.stages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  stage_date date not null,
  start_time time,
  end_time time,
  place text,
  price numeric(10,2),
  audience text,
  description text,
  created_at timestamptz not null default now()
);
create table if not exists public.stage_sends (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages(id) on delete cascade,
  target_type text not null check (target_type in ('prospect', 'member')),
  target_id uuid not null,
  sent_at timestamptz not null default now()
);
create index if not exists stage_sends_stage on public.stage_sends (stage_id);
alter table public.stages enable row level security;
alter table public.stage_sends enable row level security;
drop policy if exists "staff all" on public.stages;
drop policy if exists "staff all" on public.stage_sends;
create policy "staff all" on public.stages for all using (public.is_staff()) with check (public.is_staff());
create policy "staff all" on public.stage_sends for all using (public.is_staff()) with check (public.is_staff());

-- Historique des modifications des stages
drop trigger if exists audit_stages on public.stages;
create trigger audit_stages after insert or update or delete on public.stages for each row execute function public.audit_row();

-- ---------- Restauration : les stages sont aussi remis en place ----------
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
  if jsonb_typeof(payload->'stages') = 'array' then delete from public.stage_sends where true; delete from public.stages where true; end if;
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
  if jsonb_typeof(payload->'stages') = 'array' then
    insert into public.stages select * from jsonb_populate_recordset(null::public.stages, payload->'stages');
    insert into public.stage_sends select * from jsonb_populate_recordset(null::public.stage_sends, coalesce(payload->'stage_sends', '[]'));
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
    'prospects', (select count(*) from public.prospects),
    'stages', (select count(*) from public.stages));
end $$;
revoke all on function public.restore_backup(jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb) to authenticated;
