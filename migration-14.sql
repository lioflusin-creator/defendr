-- =====================================================================
-- DEFENDR — reçus de cotisation (Comptabilité → Reçu de cotisation).
-- Chaque reçu reçoit un numéro par année civile : 2026-001, 2026-002…
-- Les numéros se suivent sans trou : un reçu ne peut être ni modifié ni
-- supprimé, et seule la fonction create_receipt peut en créer un.
-- Ajoute aussi le n° SIRET du club (Paramètres → Club), à côté du n° RNA.
-- À exécuter une fois dans Supabase → Éditeur SQL (après migration-13.sql).
-- =====================================================================
alter table public.club_settings
  add column if not exists club_siret text;

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  seq int not null,
  number text not null,
  issued_on date not null,
  member_id uuid references public.members(id) on delete set null,
  data jsonb not null default '{}'::jsonb,   -- copie de tout ce qui est imprimé sur le reçu
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (year, seq)
);
create index if not exists receipts_member on public.receipts (member_id);
alter table public.receipts enable row level security;
drop policy if exists "admin lit" on public.receipts;
create policy "admin lit" on public.receipts for select using (public.is_admin());
-- Aucune règle d'ajout, de modification ou de suppression : la numérotation reste sans trou.

create or replace function public.create_receipt(p_member_id uuid, p_data jsonb)
returns public.receipts language plpgsql security definer set search_path = public as $$
declare
  d date := (now() at time zone 'Europe/Paris')::date;
  y int := extract(year from d)::int;
  n int;
  r public.receipts;
begin
  if not public.is_admin() then
    raise exception 'Seuls le président et le trésorier peuvent émettre un reçu de cotisation.';
  end if;
  perform pg_advisory_xact_lock(hashtext('defendr-receipts'), y); -- deux reçus émis en même temps ne prennent pas le même numéro
  select coalesce(max(seq), 0) + 1 into n from public.receipts where year = y;
  insert into public.receipts (year, seq, number, issued_on, member_id, data)
  values (y, n, y || '-' || case when n < 1000 then lpad(n::text, 3, '0') else n::text end, d, p_member_id, coalesce(p_data, '{}'::jsonb))
  returning * into r;
  return r;
end $$;
revoke all on function public.create_receipt(uuid, jsonb) from public;
grant execute on function public.create_receipt(uuid, jsonb) to authenticated;

-- ---------- Sauvegarde automatique : les reçus sont aussi copiés ----------
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
                             'seasons', 'club_settings', 'level_history', 'course_plan_items', 'prospects', 'stages', 'stage_sends', 'receipts'] loop
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
