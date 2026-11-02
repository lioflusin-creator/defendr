# Defendr — comment tout reconstruire

Ce dossier contient tout le logiciel de gestion du club. Il ne contient aucune donnée d'adhérent.

## Ce qu'il contient
- `index.html`, `app.js`, `style.css` : l'application.
- `inscription.html` : la fiche d'inscription en ligne.
- `schema.sql`, `migration-2.sql`, `migration-3.sql` : la structure de la base de données, à exécuter dans cet ordre.
- `config.js` : l'adresse du projet Supabase utilisé par l'application.

## Pour tout reconstruire (par exemple avec l'aide de Claude)
1. Créer un projet Supabase (région Europe) et exécuter les fichiers `.sql` dans l'éditeur SQL, dans l'ordre ci-dessus.
2. Mettre l'adresse et la clé publique du nouveau projet dans `config.js`.
3. Publier le dossier sur un hébergement de pages web (par exemple GitHub Pages).
4. Créer son compte dans l'application (le premier compte devient président).
5. Réimporter les données à partir du dernier fichier Excel de sauvegarde.
