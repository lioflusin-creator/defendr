-- =====================================================================
-- DEFENDR — permet au logiciel de remplacer et retirer les documents du club
-- (sans cette ligne, les anciens fichiers restent stockés inutilement).
-- À exécuter une fois dans Supabase → Éditeur SQL.
-- =====================================================================
drop policy if exists "public lit documents" on storage.objects;
create policy "public lit documents" on storage.objects for select using (bucket_id = 'documents');
