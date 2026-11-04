// Connexion à la base de données Supabase du club.
// La clé « anon » est publique par conception : la sécurité repose sur les règles d'accès (RLS) de la base.
export const SUPABASE_URL = 'https://rfatircmebcdsitlexpk.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmYXRpcmNtZWJjZHNpdGxleHBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1NTA1MzAsImV4cCI6MjEwOTEyNjUzMH0.B7p78WlHVBIAawg0wrjeIfP0LVIEyz7v_AI7zjltCkA';

// Adresse du site de CE club (sans https://). Sert de garde-fou : une copie du logiciel
// installée ailleurs refuse de se connecter à cette base tant que ce fichier n'a pas été adapté.
export const SITE = 'lioflusin-creator.github.io/defendr';
