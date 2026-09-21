# VOOMNET Presence 2026

## Innover. Connecter. Performer. — Solutions IT & Télécoms

Plateforme de supervision et de gestion des présences de **VOOMNET TECHNOLOGY**. L'application permet aux administrateurs de superviser les collaborateurs depuis un tableau centralisé et aux employés d'enregistrer leur arrivée et leur départ du lundi au vendredi.

> **⚠️ Statut : prototype de démonstration.** Le stockage est local (fichiers JSON dans `data/`) et l'authentification est simplifiée. Ne pas déployer en production sans appliquer la checklist de la section [Passage en production](#passage-en-production). Aucune donnée personnelle réelle ne doit être ajoutée à ce dépôt.

---

## Fonctionnalités

### Administrateur / Command Center

- Vue globale de l'organisation.
- Horloge et date réelles (fuseau Africa/Abidjan).
- Supervision centralisée — consolidation automatique des compteurs et du tableau.
- Recherche et filtres par statut.
- Compteurs : présents, absents, retards, départs en attente, journées terminées.
- Heure d'arrivée réelle, départ théorique (configurable) et départ réel.
- Compteur dynamique avant la fin théorique de journée.
- Panneau détaillé par employé avec historique sur 7 jours.
- Registre des codes individuels au format `3CX-{matricule}-{suffixe}` (ex. `3CX-1009-589`), à usage unique, avec copie en un clic, régénération (unitaire ou globale) et historique des codes invalidés.
- Notifications ciblées vers toute l'équipe ou un employé.
- Annuaire des employés avec photos de profil.
- Page Paramètres : heures d'arrivée/départ, tolérance, jours ouvrés.

### Employé

- Connexion par matricule 3CX et code personnel à usage unique.
- Accès limité à ses propres informations.
- Pointage réel de l'arrivée avec calcul automatique du retard après la tolérance configurée.
- Pointage réel du départ.
- Blocage du double pointage (409 en cas de tentative).
- Historique des pointages (arrivée, départ, statut).
- Compteur dynamique jusqu'à l'heure théorique de départ.
- Profil employé : renommage et ajout de photo depuis l'appareil (redimensionnée automatiquement).
- Réception et suppression des notifications personnelles.

---

## Prérequis

| Outil | Version minimale |
|---|---|
| Node.js | **18.17** pour l'app ; **20.6+** pour les scripts `db:*` (`--env-file-if-exists`) |
| npm | 9 |

```bash
node --version
```

## Lancer le projet en développement

Aucune configuration ni variable d'environnement n'est requise pour la démo : le dossier `data/` est créé et amorcé automatiquement au premier lancement (comptes admin, employés, codes, paramètres).

```bash
npm install
npm run dev
```

Ouvrir ensuite :

```text
http://localhost:3000
```

Vérifier le build de production :

```bash
npm run build
```

Pour travailler sur PostgreSQL sans installer Neon :

```bash
export DATABASE_URL=postgresql://postgres@127.0.0.1:5432/voomnet_presence
npm run db:migrate && npm run dev
```

## Comptes administrateur de démonstration

Les comptes sont créés automatiquement au premier lancement (mot de passe scrypt, fichier `data/admins.json`, hors dépôt Git). Les mots de passe de démonstration sont définis dans l'amorçage (`lib/store/defaults.js`, surchargeable par `VP_ADMIN_SUPER_PASSWORD` / `VP_ADMIN_IT_PASSWORD` en `.env.local`) — ne jamais y placer de mot de passe réel ; en production, utiliser des variables d'environnement et bcrypt.

| Rôle | Identifiant |
|---|---|
| Super Admin | `admin@voomnet.ci` |
| Admin IT | `it@voomnet.ci` |

## Codes employés

Les codes personnels à 6 chiffres sont générés au démarrage et affichés dans le registre du Command Center. Ils ne sont jamais écrits en dur dans la documentation.

Le workflow est :

1. L'administrateur consulte le code dans le registre (onglet « Registre des codes »).
2. Il communique le code à l'employé.
3. L'employé saisit son matricule 3CX et son code.
4. Le serveur vérifie la correspondance.
5. Le code est consommé (une réutilisation est rejetée).
6. Une session employé de 12 h est créée.
7. Un nouveau code est généré automatiquement.

## Collaborateurs enregistrés

Trois employés de démonstration sont configurés par défaut (noms fictifs à vocation illustrative, modifiables depuis l'espace employé) :

| Matricule 3CX | Nom | Département | Inscription |
|---|---|---|---|
| `1009` | Jean Kouassi | Support Technique | 15/01/2024 |
| `1000` | Marie N'Guessan | Service Commercial | 03/06/2024 |
| `1004` | Paul Yao | Informatique & Réseaux | 21/10/2024 |

> **🔒 Confidentialité :** ne publier ni noms réels ni matricules associés dans la documentation publique (protection des données personnelles — cf. loi ivoirienne n° 2013-450). Les données locales vivent dans `data/`, exclu de Git.

## Stack actuelle

- Next.js 14 (14.2.35, version patchée) — App Router
- React 18
- CSS design system « white enterprise » (`app/globals.css`), sans dépendance externe
- API Route Handlers Next.js
- Stockage serveur à double pilote : fichiers JSON (`data/`) ou **PostgreSQL / Neon** (`lib/store/`), choisi par `DATABASE_URL`
- `pg` 8 (pool de connexions), migrations SQL dans `db/migrations/`
- Sessions serveur à durée limitée (12 h) ; mots de passe admin hachés (scrypt)

## Structure du projet

```text
voomnet-presence/
├── app/
│   ├── page.jsx                     # Accueil : splash premium + horloge + portails
│   ├── layout.jsx                   # Layout racine (métadonnées, styles, favicon)
│   ├── globals.css                  # Design system white enterprise (base)
│   ├── cc.css                       # Extension Command Center (hero, KPI, splash, panels…)
│   ├── components/                  # Splash, PresenceRing, KpiCard, LiveFeed, Toasts,
│   │                                # EmployeePanel, CommandPalette, SupervisionMode,
│   │                                # PresenceFlow, DotGrid, SystemStatus, primitives…
│   ├── admin/
│   │   ├── page.jsx                 # Connexion administrateur
│   │   └── dashboard/page.jsx       # Command Center live (5 onglets)
│   ├── employee/
│   │   ├── page.jsx                 # Connexion employé (matricule + code)
│   │   └── espace/page.jsx          # Espace employé (pointage, profil, historique)
│   └── api/                         # Route Handlers (voir Routes API)
├── public/
│   ├── voomnet-logo.svg             # Logo VOOMNET TECHNOLOGY (vectoriel)
│   └── voomnet-mark.svg             # Marque (4 carrés marine/violet) + favicon
├── lib/
│   ├── db.js                        # Interface de stockage (JSON ou PostgreSQL), amorçage, sessions, hachage
│   ├── rules.js                     # Règles horaires, statuts, pauses, durées (Africa/Abidjan)
│   └── store/                       # Pilotes de persistance
│       ├── client.js                # Pool pg, transactions, état de connexion
│       ├── pgsql.js                 # Adaptateur PostgreSQL (readStore/writeStore en SQL)
│       ├── json.js                  # Adaptateur fichiers data/*.json
│       ├── seed.js                  # Amorçage de la base (admins, employés, codes, settings)
│       ├── codes.js                 # Génération des codes 3CX
│       ├── security.js              # scrypt, sel, comparaison temps constant
│       └── defaults.js              # Paramètres et fiches de démonstration
├── db/
│   └── migrations/                  # Migrations SQL (0001_init.sql)
├── scripts/
│   ├── migrate.mjs                  # npm run db:migrate
│   ├── db-import.mjs                # npm run db:import (data/*.json -> base)
│   └── db-status.mjs                # npm run db:status (diagnostic)
├── data/                            # Données locales de démo (exclu de Git)
├── package.json
└── .gitignore
```

## Routes API

```text
POST /api/auth/admin        # Connexion administrateur (route additionnelle du prototype)
POST /api/auth/employee     # Connexion employé : matricule + code à usage unique
GET  /api/attendance        # Tableau de bord complet (admin)
POST /api/attendance        # Pointage : arrival | departure
GET  /api/codes             # Registre des codes (admin)
POST /api/codes             # Régénération : { matricule } ou { all: true } (admin)
GET  /api/settings          # Règles horaires (lecture publique)
POST /api/settings          # Mise à jour des règles (admin)
GET  /api/employee          # Espace personnel : profil, journée, historique, notifications
POST /api/employee          # Profil (nom, photo) et suppression de notifications
GET  /api/notifications     # Historique des envois (admin)
POST /api/notifications     # Envoi : { target: "all" | matricule, message }
```

*Les routes `auth/admin`, `employee` et `notifications` sont des additions du prototype au périmètre documenté initial : elles sont nécessaires aux fonctionnalités décrites (connexion admin, profil employé, notifications).*

### Pointage

`POST /api/attendance` accepte une action :

```json
{
  "employeeId": "1009",
  "sessionToken": "TOKEN_SESSION",
  "action": "arrival"
}
```

Les actions disponibles sont :

```text
arrival
pause_start
pause_end
departure
```

Le système vérifie le jour ouvré, la session, l'existence de l'arrivée et le double pointage (erreurs 403 / 401 / 400 / 409).

## Paramètres de présence par défaut

```text
Heure d'arrivée : 08:00
Tolérance : 15 minutes
Retard : à partir de 08:16
Départ théorique : 17:00
Jours ouvrés : lundi à vendredi
Fuseau horaire : Africa/Abidjan
```

Ces règles sont modifiables dans le dashboard administrateur (onglet Paramètres) et sauvegardées via `POST /api/settings`.

## Données locales et sécurité

Les fichiers suivants sont exclus du dépôt Git (`.gitignore`) :

```text
.env
.next/
node_modules/
data/
```

Le dossier `data/` contient les données locales de démonstration :

- Pointages (`attendance.json`).
- Codes personnels (`codes.json`).
- Sessions (`sessions.json`).
- Paramètres (`settings.json`).
- Comptes administrateur hachés (`admins.json`).
- Notifications (`notifications.json`).

Supprimer le dossier `data/` réinitialise complètement la démonstration.

## Base de données (PostgreSQL / Neon)

Le stockage de démonstration (`data/*.json`) et le stockage PostgreSQL coexistent
derrière la même interface : **la base est activée dès que `DATABASE_URL` est défini**,
sinon l'application reste sur les fichiers. Aucune route n'a été modifiée.

### 1. Renseigner la chaîne de connexion

Copier `.env.example` en `.env.local` et y coller l'URL de la base Neon
(`Dashboard → Connection Details → Pooled connection`, qui traverse le pooler et
supporte mieux les connexions courtes) :

```ini
DATABASE_URL=postgresql://<user>:<password>@<endpoint>-pooler.<region>.aws.neon.tech/neondb?sslmode=require
```

`sslmode=require` est ajouté automatiquement pour un hôte `*.neon.tech` / `*.neon.run`;
`DB_SSL=disable` sert aux PostgreSQL locaux de développement.

### 2. Créer le schéma, puis importer les données existantes

```bash
npm run db:migrate          # applique db/migrations/*.sql (table vp_migrations)
npm run db:import           # recharge data/*.json dans les tables (option --dry-run)
npm run db:status           # connexion, volumétrie, écart base <> fichiers
```

### 3. Schéma

| Table | Rôle | Clés / index |
|---|---|---|
| `employees` | fiches employés | `matricule` PK, `department`, ordre `ord`, `data jsonb` |
| `attendance` | un pointage par (matricule, journée) | PK `(matricule, day)` — `day` est un vrai `date` |
| `access_codes` | code d'accès actif | `matricule` PK, `code` UNIQUE, TTL, usage unique |
| `code_events` | journal émissions / usages / révocations | `at DESC` par matricule |
| `sessions` | sessions 12 h | `token` PK, index sur `expires_at` |
| `notifications` | messages interne admin → équipe | index `(target, created_at DESC)` |
| `admins` | comptes administrateurs | `email` PK, sel + empreinte scrypt |
| `settings` | paramètres de présence | ligne unique (`CHECK (id = 1)`) |

Les colonnes utilisées par les requêtes sont relationnelles et indexées ; le reste de
la fiche est conservé en `jsonb` pour que les routes retrouvent exactement les mêmes
objets qu'en mode fichier. `attendance.matricule` et `access_codes.matricule` sont en
clé étrangère vers `employees` avec `ON DELETE CASCADE` : supprimer une fiche emporte
pointages et codes (en mode fichier, ils restaient orphelins).

### 4. Vérifier

```bash
npm run build && npm run dev
```

Les 9 routes API fonctionnent sur les deux pilotes ; `db:status` doit afficher des
compteurs identiques entre la base et `data/*.json` après un `db:import`.

## Passage en production

Avant mise en production :

1. ~~Configurer `DATABASE_URL` (fournir un `.env.example` documentant toutes les variables requises).~~ **fait**
2. ~~Remplacer le stockage JSON par PostgreSQL.~~ **fait** (pilote `pg` dans `lib/store/`, bascule automatique)
3. Ajouter un ORM et des migrations versionnées — migrations SQL manuelles en place (`db/migrations/`, `vp_migrations`), Drizzle reste optionnel.
4. Ajouter JWT access/refresh.
5. Hacher les mots de passe et secrets avec bcrypt, sortir les secrets du code source.
6. Ajouter une authentification serveur sur toutes les routes (y compris `/api/settings` et `/api/codes`).
7. Ajouter WebSocket ou SSE pour le temps réel multi-utilisateur (le prototype utilise un polling 5 s).
8. Configurer les sauvegardes et journaux d'audit.
9. Supprimer ou désactiver les comptes de démonstration.
10. Effectuer une revue de sécurité (secrets, CORS, en-têtes, rate limiting sur les routes d'authentification).

## Vérification du build

```bash
npm run build
```

## Contributions

Projet interne VOOMNET TECHNOLOGY. Pour toute modification, ouvrir une branche et soumettre une pull request ; les évolutions de périmètre métier sont décrites dans `CAHIER_DES_CHARGES.md`.

## Licence

Usage interne — VOOMNET TECHNOLOGY. Tous droits réservés.
MERCI
