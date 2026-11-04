-- =====================================================================
-- DEFENDR — documents du club et justificatifs envoyés à l'inscription
-- (règlement intérieur, QSS, QSS mineur, RIB, logo ; certificat médical
--  ou questionnaire envoyé par la personne qui s'inscrit en ligne)
-- À exécuter une fois dans Supabase → Éditeur SQL.
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
