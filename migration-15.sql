-- =====================================================================
-- DEFENDR — signatures du président et du trésorier (Paramètres → Signatures),
-- ajoutées automatiquement aux reçus de cotisation, attestations et comptes annuels.
-- Les images sont rangées dans un espace PRIVÉ : seuls le président et le
-- trésorier connectés peuvent les voir, les ajouter ou les retirer.
-- Ajoute aussi le nom du trésorier (Paramètres → Club).
-- À exécuter une fois dans Supabase → Éditeur SQL (après migration-14.sql).
-- =====================================================================
alter table public.club_settings
  add column if not exists treasurer_name text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('signatures', 'signatures', false, 1048576, array['image/png'])
  on conflict (id) do update set public = false;
drop policy if exists "admin lit signatures" on storage.objects;
drop policy if exists "admin ajoute signatures" on storage.objects;
drop policy if exists "admin modifie signatures" on storage.objects;
drop policy if exists "admin supprime signatures" on storage.objects;
create policy "admin lit signatures" on storage.objects for select to authenticated using (bucket_id = 'signatures' and public.is_admin());
create policy "admin ajoute signatures" on storage.objects for insert to authenticated with check (bucket_id = 'signatures' and public.is_admin());
create policy "admin modifie signatures" on storage.objects for update to authenticated using (bucket_id = 'signatures' and public.is_admin());
create policy "admin supprime signatures" on storage.objects for delete to authenticated using (bucket_id = 'signatures' and public.is_admin());
