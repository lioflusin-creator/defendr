# Defendr — comment tout reconstruire

Ce dossier contient tout le logiciel de gestion du club. Il ne contient aucune donnée d'adhérent.

## Ce qu'il contient
- `index.html`, `app.js`, `style.css` : l'application.
- `inscription.html` : la fiche d'inscription en ligne.
- `schema.sql` : la structure complète de la base de données (les fichiers `migration-*.sql` sont déjà inclus dedans).
- `config.js` : l'adresse du projet Supabase utilisé par l'application.

## Pour tout reconstruire (par exemple avec l'aide de Claude)
1. Créer un projet Supabase (région Europe) et exécuter `schema.sql` dans l’éditeur SQL.
2. Mettre l'adresse et la clé publique du nouveau projet dans `config.js`.
3. Publier le dossier sur un hébergement de pages web (par exemple GitHub Pages).
4. Créer son compte dans l'application (le premier compte devient président).
5. Dans Paramètres → Sauvegarde, utiliser « Restaurer depuis une sauvegarde » avec le dernier fichier Excel.
