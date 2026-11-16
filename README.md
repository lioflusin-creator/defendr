# Defendr

Logiciel de gestion de club de self-défense affilié à l’ADAC : membres, inscriptions en ligne, planning et appel, planification annuelle, grades, comptabilité, WhatsApp, liaison avec le tableur ADAC National.

Application web installable sur iPhone (Safari → Partager → Sur l'écran d'accueil). Les données sont stockées dans Supabase (hébergement en Europe), protégées par connexion et par des règles d'accès : ce dépôt ne contient aucune donnée d'adhérent.

- **Installer Defendr pour un nouveau club** : voir [INSTALLER-NOUVEAU-CLUB.md](INSTALLER-NOUVEAU-CLUB.md).
- **Tout reconstruire après un problème** : voir [LISEZ-MOI-restauration.md](LISEZ-MOI-restauration.md).
- **Démonstration** avec un club fictif : dossier `demo/`.

## Organisation du code

`app.js` démarre l’appli ; chaque rubrique a son propre fichier dans le dossier `js/` :

| Fichier | Rubrique |
|---|---|
| `js/core.js` | Connexion à la base, état partagé, petits outils (dates, montants, fenêtres, messages) |
| `js/shell.js` | Menu, connexion, démarrage et choix de la page à afficher |
| `js/dashboard.js` | Tableau de bord |
| `js/members.js` | Membres (liste, fiche, formulaire) |
| `js/referentiels.js` | Disciplines et niveaux |
| `js/grades.js` | Passages de grade |
| `js/inscriptions.js` | Inscription en ligne, dossier PDF, réinscription |
| `js/prospects.js` | Prospects et cours d’essai |
| `js/planning.js` | Planning et appel des présences |
| `js/plan.js` | Planification annuelle |
| `js/guide.js` | Guide enseignant |
| `js/stats.js` | Statistiques |
| `js/whatsapp.js` | WhatsApp |
| `js/stages.js` | Stages |
| `js/compta.js` | Comptabilité et bilan |
| `js/print.js` | Impressions et export Excel des membres |
| `js/backup.js` | Sauvegarde et restauration |
| `js/settings.js` | Paramètres |
| `js/adac.js` | Liaison avec le tableur ADAC National |
| `js/history.js` | Historique des modifications |
