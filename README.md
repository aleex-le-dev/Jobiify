<p align="center">
  <img src="web/src/app/icon.svg" alt="Jobiify" width="72" height="72">
</p>

<h1 align="center">Jobiify</h1>

<p align="center">
  <strong>Toutes les offres d'emploi du Pas-de-Calais, triées par trajet et par profil.</strong><br>
  Une application locale qui fouille les sources d'emploi et d'intérim du 62 pour vous,<br>
  et ne vous montre que ce qui est à portée de route.
</p>

<p align="center">
  <img alt="Département 62" src="https://img.shields.io/badge/zone-Pas--de--Calais%20(62)-0f766e">
  <img alt="Node.js 22.13+" src="https://img.shields.io/badge/Node.js-22.13%2B-339933?logo=nodedotjs&logoColor=white">
  <img alt="Données locales" src="https://img.shields.io/badge/données-100%25%20locales-334155">
  <img alt="Licence MIT" src="https://img.shields.io/badge/licence-MIT-64748b">
</p>

---

## Le principe

Chercher du travail dans le 62, c'est ouvrir dix sites, retaper les mêmes mots-clés et trier à la main des annonces situées à Lyon ou à Paris. Jobiify fait ce tri à votre place.

1. **Vous déposez votre CV** (PDF, Word ou texte). Jobiify en tire un profil de recherche : les métiers visés et leurs synonymes (« préparateur de commandes », « cariste », « magasinier »…).
2. **Vous choisissez votre commune de départ** et un temps de trajet maximum.
3. **Jobiify interroge toutes les sources en même temps** et ne garde que les offres situées dans votre zone.

Un CV différent par piste (logistique, BTP, administratif…) donne un profil différent. On passe de l'un à l'autre en un clic.

## Ce que fait l'application

| | |
|---|---|
| 🧭 **Zone de trajet réelle** | Les communes sont reconnues par leur code INSEE, homonymes compris : un Fleury dans le 62 n'est pas celui du Calvados. |
| 👷 **Missions d'intérim** | Une page dédiée regroupe les missions de Randstad, Synergie et Manpower, et celles de toutes les agences via France Travail. |
| 🗂️ **Profils de recherche** | Un profil par CV, chacun avec ses métiers, ses synonymes et ses filtres. Les métiers sont créés automatiquement à l'import. |
| 📋 **Suivi des candidatures** | Chaque offre retenue rejoint « Mes candidatures », avec des rappels de relance au bon moment. |
| ⏰ **Recherches automatiques** | Programmez une recherche récurrente pour ne manquer aucune nouvelle offre. |
| ✨ **Assistant IA (optionnel)** | Lecture des CV PDF et Word, recherche en langage naturel, évaluation d'une offre, CV adapté et lettre de motivation. Le quota réel de votre compte s'affiche dans la barre latérale. |

## Les sources

| Source | Ce qu'elle apporte | Clé |
|---|---|---|
| **France Travail** | La source principale : ses offres et celles de ses partenaires (agences d'intérim, HelloWork, Indeed, Meteojob…) | gratuite, recommandée |
| **Agences d'intérim** | Randstad, Synergie, Manpower lus directement | aucune |
| **Employeurs régionaux** | Les sites carrière des entreprises du secteur listées dans `portals.yml` | aucune |
| **Choisir le Service Public** | Emplois des trois fonctions publiques | aucune |
| **Welcome to the Jungle** | Offres des entreprises présentes sur la plateforme | aucune |
| **Jooble · Adzuna · Careerjet** | Agrégateurs (PME, cabinets, job boards) | gratuite |
| **Grands groupes (Workday)** | Sites carrière des grands employeurs | aucune, désactivé par défaut |

> LinkedIn, leboncoin et Indeed interdisent la collecte automatique de leurs pages. Jobiify ne les aspire pas : créez plutôt une alerte e-mail sur ces sites. Une bonne partie de leurs offres arrive de toute façon par France Travail.

## Installation

**Prérequis** : [Node.js](https://nodejs.org) 22.13 ou plus récent, et [Git](https://git-scm.com).

```bash
# 1. Récupérer le projet
git clone https://github.com/aleex-le-dev/career-ops.git jobiify
cd jobiify

# 2. Installer les dépendances (moteur + application web)
npm install
npm --prefix web install

# 3. Préparer le fichier de configuration
cp .env.example .env

# 4. Lancer l'application
npm run dev
```

Ouvrez ensuite **http://localhost:3000**.

### Activer France Travail (5 minutes, fortement conseillé)

Sans cette clé, Jobiify fonctionne, mais il voit beaucoup moins d'offres.

1. Créez un compte sur [francetravail.io](https://francetravail.io), puis une application dans l'**Espace Développeurs**.
2. Abonnez-la à l'API **« Offres d'emploi v2 »**.
3. Copiez l'identifiant et la clé secrète dans `.env` :

```env
FRANCETRAVAIL_CLIENT_ID=PAR_xxxxxxxx
FRANCETRAVAIL_CLIENT_SECRET=xxxxxxxx
```

Les clés Jooble, Adzuna et Careerjet se renseignent de la même façon. Les liens d'inscription se trouvent dans `.env.example`. Vous pouvez aussi saisir toutes ces clés depuis l'application, page **Sources & clés API**.

### Activer l'assistant IA (optionnel)

Installez [Claude Code](https://claude.ai/code) et connectez-vous une fois. Jobiify le détecte tout seul, rien à configurer. Sans lui, tout fonctionne sauf la lecture des CV PDF et Word et les fonctions IA. Un CV peut toujours être collé en texte.

## Premiers pas

1. **Mes CV & profils** : importez votre CV, vérifiez les métiers proposés et choisissez votre commune de départ dans la liste (le code postal est affiché pour lever les homonymes).
2. **Rechercher des offres** : la recherche se lance sur le profil actif. Changez de profil dans « Affiner la recherche ».
3. **Missions d'intérim** : toutes les missions autour de chez vous, filtrables par métier et par agence.
4. **Mes candidatures** : ajoutez les offres qui vous intéressent et suivez leur avancement.

## Vos données restent chez vous

Tout est stocké en fichiers sur votre ordinateur : CV, profils, candidatures et clés d'API. Aucun compte et aucun serveur tiers. Les seules requêtes sortantes vont vers les sources d'offres, et vers Claude si vous utilisez l'assistant. Jobiify n'envoie jamais de candidature à votre place.

## Crédits

Jobiify est une adaptation régionale de [career-ops](https://github.com/santifer/career-ops), créé par [Santiago Fernández de Valderrama](https://github.com/santifer) et distribué sous licence [MIT](LICENSE).
