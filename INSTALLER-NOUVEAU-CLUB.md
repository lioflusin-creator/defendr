# Installer Defendr pour votre club

Defendr est le logiciel de gestion d’un club de self-défense affilié à l’ADAC : membres, inscriptions en ligne, planning et appel, planification annuelle, grades, comptabilité, WhatsApp et liaison avec le tableur ADAC National.

Ce guide installe **votre propre copie**, vide, avec **votre propre base de données**. Personne d’autre n’a accès aux données de votre club.

- **Coût** : gratuit (comptes gratuits GitHub et Supabase).
- **Durée** : 30 à 45 minutes, une seule fois.
- **Il vous faut** : un ordinateur, une adresse e-mail pour le club, ce guide ouvert à côté.

> **Important avant de commencer** : si votre navigateur propose de **traduire** les pages de GitHub ou de Supabase, refusez (ou choisissez « Ne jamais traduire ce site »). Une page traduite traduit aussi le code, qui ne fonctionne plus.

Dans ce guide, remplacez **VOTRE-PSEUDO** par le nom de votre compte GitHub (étape 1).

---

## 1. Créer un compte GitHub

GitHub hébergera votre copie du logiciel et le site de votre club.

1. Allez sur https://github.com/signup et créez un compte avec l’e-mail du club.
2. Choisissez un nom de compte simple, sans espace, par exemple `club-krav-beziers`. C’est **VOTRE-PSEUDO** : il fera partie de l’adresse du logiciel.

## 2. Copier le logiciel

1. Connecté à GitHub, ouvrez https://github.com/lioflusin-creator/defendr
2. En haut à droite, cliquez sur **Fork**.
3. Laissez le nom `defendr`, puis cliquez sur **Create fork**.

Vous avez maintenant votre copie : `https://github.com/VOTRE-PSEUDO/defendr`.

## 3. Créer la base de données (Supabase)

1. Allez sur https://supabase.com et cliquez sur **Start your project**, puis **Continue with GitHub** (avec le compte de l’étape 1).
2. Créez une organisation si on vous le demande (nom du club, type « Personal », plan **Free**).
3. Cliquez sur **New project** :
   - **Name** : le nom de votre club.
   - **Database Password** : cliquez sur **Generate a password** et **notez-le en lieu sûr**.
   - **Region** : **West EU (Paris)** ou une autre région d’Europe.
4. Cliquez sur **Create new project** et patientez 1 à 2 minutes.

## 4. Créer les tables de la base

1. Ouvrez, dans un nouvel onglet : `https://raw.githubusercontent.com/VOTRE-PSEUDO/defendr/main/schema.sql`
2. Vérifiez que la page n’est **pas traduite** (vous devez lire `create table`, en anglais).
3. Sélectionnez tout (Ctrl+A, ou Cmd+A sur Mac) et copiez (Ctrl+C).
4. Dans Supabase, menu de gauche : **SQL Editor**, puis **New query**.
5. Collez (Ctrl+V) et cliquez sur **Run** en bas à droite. Si un avertissement « destructive operation » s’affiche, confirmez avec **Run this query**.
6. Résultat attendu : **Success. No rows returned**.

## 5. Régler les e-mails de connexion

Supabase envoie un e-mail pour confirmer chaque nouveau compte et pour les mots de passe oubliés. Il doit savoir où renvoyer les gens.

1. Dans Supabase : **Authentication** → **URL Configuration**.
2. **Site URL** : `https://VOTRE-PSEUDO.github.io/defendr/` puis **Save**.
3. **Redirect URLs** → **Add URL** : `https://VOTRE-PSEUDO.github.io/defendr/**` puis **Save URLs**.

## 6. Relier le logiciel à votre base

1. Dans Supabase : **Project Settings** (roue dentée) → **Data API** (ou **API**). Gardez cet onglet ouvert :
   - **Project URL** : une adresse du type `https://abcdefgh.supabase.co`.
   - La clé publique, nommée **anon public** ou **Publishable key**.
   - ⚠️ N’utilisez **jamais** la clé **service_role** ni la **Secret key** : elles donnent tous les droits sur la base.
2. Sur GitHub, ouvrez votre copie : `https://github.com/VOTRE-PSEUDO/defendr`, puis cliquez sur le fichier **config.js**.
3. Cliquez sur le crayon ✏️ (Edit this file) en haut à droite du fichier.
4. Remplacez les trois valeurs entre apostrophes, en gardant les apostrophes :
   ```js
   export const SUPABASE_URL = 'https://abcdefgh.supabase.co';
   export const SUPABASE_ANON_KEY = 'collez ici la clé anon public';
   export const SITE = 'VOTRE-PSEUDO.github.io/defendr';
   ```
5. Cliquez sur **Commit changes…**, puis à nouveau sur **Commit changes**.

> Tant que `config.js` n’est pas adapté, le logiciel affiche « Defendr n’est pas encore configuré » et ne se connecte à aucune base. C’est voulu : une copie ne peut pas se brancher par erreur sur la base d’un autre club.

## 7. Mettre le logiciel en ligne

1. Dans votre copie sur GitHub : **Settings** → **Pages** (menu de gauche).
2. **Source** : **Deploy from a branch**. **Branch** : **main** et **/(root)**, puis **Save**.
3. Patientez 1 à 2 minutes et rechargez la page : l’adresse du logiciel s’affiche, `https://VOTRE-PSEUDO.github.io/defendr/`.

## 8. Premier lancement

1. Ouvrez `https://VOTRE-PSEUDO.github.io/defendr/`.
2. Cliquez sur **Créer un compte**. **Le premier compte créé devient président(e)** du club dans le logiciel : faites-le vous-même.
3. Confirmez votre adresse avec l’e-mail reçu, puis connectez-vous.

## 9. Configurer votre club

Tout se règle dans **Paramètres** :

1. **Club** : nom, cotisations, horaires, adresse, président, n° RNA ou SIRET, e-mail.
2. **Saisons** : **Nouvelle saison** (par exemple 2026/2027), à rendre active.
3. **Documents et paiement de l’inscription** : ajoutez votre règlement intérieur, le questionnaire QS-Sport, le questionnaire mineur, votre RIB et votre logo, puis saisissez titulaire, IBAN, BIC et banque. La fédération est déjà réglée sur « l’ADAC ».
4. **Catégories, salles et chapitres** : vos salles, types de recettes et de dépenses.
5. **ADAC National** : suivez les étapes « Installation de la liaison » pour envoyer vos licences dans le tableur de l’ADAC.
6. **Équipe** : les autres responsables créent leur compte depuis l’écran de connexion, puis vous leur donnez un rôle ici (trésorier, enseignant).

Pour que les gens s’inscrivent eux-mêmes : **Paramètres → Inscription en ligne → Partager sur WhatsApp**.

## 10. Installer l’appli sur un iPhone

Ouvrez l’adresse du logiciel dans **Safari**, touchez **Partager** puis **Sur l’écran d’accueil**.

---

## Recevoir les mises à jour

Les améliorations du logiciel ne s’installent pas toutes seules dans votre copie. Pour les récupérer :

1. Ouvrez `https://github.com/VOTRE-PSEUDO/defendr`.
2. Si GitHub indique que votre copie est en retard (« This branch is X commits behind »), cliquez sur **Sync fork** puis **Update branch**.
3. Regardez si un nouveau fichier `migration-N.sql` est apparu, avec un numéro **supérieur à 8**. Si oui, exécutez-le une fois dans Supabase, comme à l’étape 4 (avec le lien `…/main/migration-N.sql`).
4. Fermez puis rouvrez le logiciel, deux fois, pour charger la nouvelle version.

Votre fichier `config.js` est conservé lors des mises à jour.

## Sauvegarder vos données

Une fois par mois : **Paramètres → Sauvegarde → Télécharger les données**. Gardez ce fichier Excel en lieu sûr : il contient des données personnelles et médicales. Pour tout reconstruire un jour, voir `LISEZ-MOI-restauration.md`.

## Vos responsabilités

Votre club est seul responsable des données de ses adhérents (RGPD) : qui y a accès, combien de temps vous les gardez, et leur suppression sur demande. Le logiciel les protège par connexion et par des règles d’accès. La base est hébergée en Europe si vous avez choisi une région européenne à l’étape 3.
