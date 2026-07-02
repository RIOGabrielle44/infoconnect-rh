
# InfoConnect RH — version production Supabase

Cette version transforme le prototype en application de production avec :

- authentification email/mot de passe Supabase Auth ;
- rôles `employee` et `admin` ;
- base de données PostgreSQL ;
- stockage privé des fichiers via Supabase Storage ;
- règles de sécurité Row Level Security ;
- commentaires, réactions, vues et questionnaires ;
- PWA légère compatible Android/iPhone ;
- déploiement gratuit possible sur Vercel + Supabase Free.

## 1. Créer le projet Supabase

1. Créez un projet sur Supabase.
2. Ouvrez **SQL Editor**.
3. Exécutez dans l'ordre :
   - `supabase/01-schema.sql`
   - `supabase/02-rls-policies.sql`
4. Dans **Project Settings > API**, copiez :
   - Project URL
   - anon public key

## 2. Configurer l'application

Copiez `.env.example` vers `.env` :

```bash
cp .env.example .env
```

Renseignez :

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## 3. Lancer en local

```bash
npm install
npm run dev
```

## 4. Créer le premier administrateur

1. Ouvrez l'app en local.
2. Créez un compte avec votre email.
3. Dans `supabase/03-seed-admin-and-channels.sql`, remplacez :

```sql
admin@entreprise.fr
```

par votre email réel.
4. Exécutez le script dans Supabase SQL Editor.
5. Déconnectez-vous/reconnectez-vous : le bouton **Nouvelle publication** apparaît.

## 5. Déployer gratuitement sur Vercel

1. Poussez ce dossier sur GitHub.
2. Importez le repo dans Vercel.
3. Build command :

```bash
npm run build
```

4. Output directory :

```text
dist
```

5. Ajoutez les variables d'environnement dans Vercel :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## 6. Sécurité mise en place

- Les salariés authentifiés peuvent lire les canaux et publications.
- Les salariés peuvent commenter, réagir, répondre aux questionnaires et générer des vues.
- Seuls les admins peuvent créer, modifier et supprimer canaux/publications.
- Les fichiers sont stockés dans un bucket privé.
- Les salariés authentifiés peuvent lire les fichiers via URL signée temporaire.
- Seuls les admins peuvent uploader/modifier/supprimer les fichiers.

## 7. Points à décider avant usage réel en entreprise

- Activer ou non la confirmation email dans Supabase Auth.
- Définir la politique RGPD de conservation des commentaires et votes.
- Définir les administrateurs autorisés.
- Ajouter éventuellement Microsoft Entra ID/SSO si nécessaire.
- Définir les limites de taille vidéo/audio selon votre usage.

## 8. Améliorations possibles ensuite

- Ciblage par établissement, BU ou population.
- Groupes privés par canal.
- Notifications push avancées.
- Tableau de bord analytique RH.
- Modération des commentaires.
- Export CSV des réponses et interactions.
