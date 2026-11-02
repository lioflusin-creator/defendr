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
