-- =====================================================================
-- DEFENDR — sauvegarde automatique mensuelle.
-- Un script Google (defendr-sauvegarde.gs) appelle chaque mois la fonction
-- backup_export avec une clé secrète et range le fichier dans le Google Drive
-- du club. La clé ne permet QUE de lire une copie des données : elle ne peut
-- rien modifier ni supprimer.
-- À exécuter une fois dans Supabase → Éditeur SQL (après migration-12.sql).
-- =====================================================================
create table if not exists public.backup_settings (
  id int primary key default 1 check (id = 1),
  backup_key text,
  last_auto_backup_at timestamptz
);
insert into public.backup_settings (id) values (1) on conflict (id) do nothing;
alter table public.backup_settings enable row level security;
drop policy if exists "admin all" on public.backup_settings;
create policy "admin all" on public.backup_settings for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.backup_export(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k text;
  tbl text;
  rows jsonb;
  out jsonb := '{}'::jsonb;
begin
  select backup_key into k from public.backup_settings where id = 1;
  if k is null or length(k) < 20 or p_key is distinct from k then
    raise exception 'Clé de sauvegarde incorrecte : recopiez le script depuis Defendr (Paramètres → Sauvegarde).';
  end if;
  foreach tbl in array array['members', 'payments', 'expenses', 'courses', 'attendances', 'plan_items', 'disciplines', 'levels',
                             'seasons', 'club_settings', 'level_history', 'course_plan_items', 'prospects', 'stages', 'stage_sends'] loop
    if to_regclass('public.' || tbl) is not null then
      execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', tbl) into rows;
      out := out || jsonb_build_object(tbl, rows);
    end if;
  end loop;
  update public.backup_settings set last_auto_backup_at = now() where id = 1;
  return jsonb_build_object('format', 'defendr-sauvegarde', 'version', 1, 'exported_at', now(), 'tables', out);
end $$;
revoke all on function public.backup_export(text) from public;
grant execute on function public.backup_export(text) to anon, authenticated;
