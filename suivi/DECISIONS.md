# Registre des décisions — ERP Keitala

Chaque décision qui engage le projet est notée ici, avec sa raison. Une décision ne se modifie pas : on en ajoute une nouvelle qui la remplace, et on marque l'ancienne « Remplacée par D-0XX ».

**Statuts** : `Acceptée` (décidée ou validée par l'utilisateur) · `Proposée` (choix d'un agent, à confirmer par l'utilisateur) · `Remplacée`

**Modèle d'entrée**

```
## D-0XX — Titre court
- **Date** : JJ/MM/AAAA · **Statut** : Acceptée | Proposée · **Auteur** : utilisateur | nom de l'agent
- **Contexte** : le problème en une ou deux phrases.
- **Décision** : ce qui est retenu.
- **Conséquences** : ce que cela impose ou interdit.
```

---

## Cadrage

## D-001 — Périmètre fonctionnel
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : utilisateur
- **Contexte** : l'entreprise fait aussi de la production agricole.
- **Décision** : l'ERP ne suit ni les champs, ni les parcelles, ni les campagnes. Il commence à l'entrée en stock.
- **Conséquences** : six modules seulement : stocks, achats, production, ventes, trésorerie, tableaux de bord.

## D-002 — Application 100 % en ligne
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : utilisateur
- **Décision** : pas de mode hors connexion ni de synchronisation différée.
- **Conséquences** : l'interface doit bien gérer une connexion instable (saisie conservée, message clair, nouvel essai), sans stocker de données métier hors ligne.

## D-003 — Trois rôles
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : utilisateur
- **Décision** : `SUPER_ADMIN`, `GESTIONNAIRE`, `CONSULTANT`. Les quatre profils de la première version (magasinier, caissier...) sont abandonnés.
- **Conséquences** : le Gestionnaire fait toutes les saisies ; le Consultant est en lecture seule stricte, contrôlée par l'API.

## D-004 — Le Super Admin contrôle après coup
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : utilisateur
- **Contexte** : la première version prévoyait des validations par le Super Admin (inventaires, transferts, clôtures, dépenses élevées).
- **Décision** : aucune validation bloquante. Le Gestionnaire valide seul ; le Super Admin marque ensuite les pièces comme contrôlées.
- **Conséquences** : colonnes `controle_par` et `controle_le` sur dépenses, transferts, inventaires et clôtures ; écran « à contrôler ».

## D-005 — Mobile Money : un compte par opérateur, saisie manuelle
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : utilisateur
- **Contexte** : les documents se contredisaient (sans Mobile Money, compte, ou simple mode de règlement à texte libre).
- **Décision** : le Mobile Money désigne les transactions par Orange Money, Mobicash ou Wave. Chaque opérateur est un compte de trésorerie avec son solde. Rien n'est automatique : l'utilisateur choisit le compte et saisit le montant.
- **Conséquences** : pas d'intégration d'API opérateur ; numéro de transaction en champ libre facultatif ; le Super Admin peut ajouter un compte.

## Architecture

## D-006 — Stack technique
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : utilisateur
- **Décision** : Next.js (App Router, TypeScript, Tailwind) sur Vercel ; FastAPI, SQLAlchemy 2.0 async et Alembic sur VPS Docker ; PostgreSQL 16.
- **Conséquences** : NestJS, évoqué dans la première version, est écarté.

## D-007 — Proxy Next.js et cookies de session
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : utilisateur
- **Contexte** : le frontend (Vercel) et l'API (VPS) sont sur deux domaines ; des cookies `HttpOnly` entre domaines posent problème.
- **Décision** : le navigateur n'appelle que le frontend. Les Route Handlers Next.js relaient vers FastAPI et gardent les jetons JWT dans des cookies `HttpOnly`, `Secure`, `SameSite=Lax`.
- **Conséquences** : pas de CORS côté navigateur ; l'adresse de l'API est une variable serveur, jamais `NEXT_PUBLIC_` ; le contrôle des rôles reste dans FastAPI.

## D-008 — `schema.sql` v1.1 comme base, puis Alembic
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : Claude, validé par l'utilisateur
- **Décision** : `schema.sql` v1.1 est figé. La première migration Alembic le reproduit à l'identique ; toute évolution passe par une migration et une entrée dans ce registre.
- **Conséquences** : on ne modifie plus `schema.sql` à la main.

## D-009 — Structure du dépôt
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : utilisateur
- **Décision** : le code vit dans `developpement/app` (frontend) et `developpement/api` (backend). Les spécifications restent à la racine, le suivi dans `suivi/`, la charte dans `design/`.

## D-010 — `AGENTS.md` comme source unique pour les agents
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : utilisateur
- **Contexte** : le projet sera développé avec Claude Code, Cursor et Antigravity, en alternance.
- **Décision** : les consignes sont dans `AGENTS.md` à la racine. `CLAUDE.md` l'importe par `@AGENTS.md`. Pas de `GEMINI.md` ni de règles propres à un outil, pour éviter les divergences.
- **Conséquences** : la continuité entre agents repose sur `suivi/` ; chaque session se termine par une entrée de journal.

## Modèle de données et règles métier

## D-011 — Une unité de base par article
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : Claude, validé par l'utilisateur
- **Contexte** : l'Excel avait deux codes par produit (kg et sac), donc deux stocks pour la même marchandise.
- **Décision** : un article, une unité de base ; les autres unités sont des unités de saisie avec facteur (`article_unites`). Codes fusionnés : `MP-SOJ-CON` remplace `MP-SOJ-CON-KG` et `MP-SOJ-CON-SAC`.
- **Conséquences** : les lignes d'achat et de vente gardent l'unité saisie et la quantité convertie.

## D-012 — Les règlements remplacent le « mode de règlement »
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : Claude, validé par l'utilisateur
- **Contexte** : une colonne « mode de règlement » ne permet ni paiement partiel, ni paiement mixte, ni règlement ultérieur d'un crédit.
- **Décision** : table `reglements` (pièce, compte, montant). « À crédit » signifie vente ou achat non soldé.
- **Conséquences** : créances et dettes sont calculées par des vues ; une vente à crédit exige un client identifié.

## D-013 — Production en deux étapes et famille « semi-fini »
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : Claude, validé par l'utilisateur
- **Contexte** : dans l'atelier, une matière donne plusieurs produits, des lots durent plusieurs jours, et un produit intermédiaire peut être retransformé.
- **Décision** : OF de transformation (matières → vrac) puis OF de conditionnement (vrac + emballages → produit fini). Sixième famille `SEMI_FINI`. Sorties de production datées, co-produits possibles.
- **Conséquences** : le reste en vrac n'est pas une donnée à part, il reste en stock de semi-fini.

## D-014 — Valorisation au PUMP et coût de revient
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : Claude, validé par l'utilisateur
- **Décision** : PUMP recalculé à chaque achat. Le coût d'un OF (consommations au PUMP) est réparti sur les produits au prorata des quantités. Le PUMP est copié sur chaque ligne de vente pour la marge.
- **Conséquences** : les pertes de production sont absorbées par le coût de revient.

## D-015 — Annulation, jamais de suppression
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : Claude, validé par l'utilisateur
- **Décision** : une pièce validée s'annule avec motif et contre-passation. Les journaux de stock et de trésorerie sont immuables (déclencheurs en base).
- **Conséquences** : aucun endpoint `DELETE` sur les pièces ; types `ANNULATION` dans les deux journaux.

## D-016 — Stock négatif interdit par la base
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : Claude, validé par l'utilisateur
- **Décision** : contrainte en base ; dérogation possible article par article, posée par le Super Admin.

## D-017 — Numérotation unique des pièces
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : Claude, validé par l'utilisateur
- **Décision** : format `PREFIXE-AAAA-NNNN` avec `FAC`, `DON`, `ACH`, `OF`, `INV`, `DEP`, `TRF`, via la table `compteurs_documents`.

## D-018 — Stock de départ par inventaire physique
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : Claude, validé par l'utilisateur
- **Contexte** : les stocks de l'Excel se contredisent d'une feuille à l'autre.
- **Décision** : les quantités de l'Excel ne sont pas reprises. Le catalogue démarre à zéro et le stock initial est saisi par un inventaire.

## Interface

## D-019 — Design minimaliste inspiré de Notion, priorité à l'expérience utilisateur
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : utilisateur
- **Décision** : l'expérience utilisateur est la priorité du projet. Charte minimaliste inspirée de Notion, décrite dans `design/CHARTE_UX_UI.md`.
- **Conséquences** : tout écran respecte la charte ; thème clair uniquement pour la première version.

## D-020 — Envoi de facture par WhatsApp en option
- **Date** : 13/11/2026 · **Statut** : Acceptée · **Auteur** : utilisateur
- **Décision** : fonctionnalité « nice to have », par simple lien `wa.me` pré-rempli, à faire en dernier.

## D-021 — Outils de développement complémentaires
- **Date** : 13/11/2026 · **Statut** : Proposée · **Auteur** : Claude
- **Contexte** : la stack validée ne précisait ni les gestionnaires de paquets ni les bibliothèques d'interface et de formulaires.
- **Décision** : pnpm et uv ; Python 3.12 ; composants de base shadcn/ui restylés selon la charte ; React Hook Form + Zod ; police Inter ; pytest ; Vitest et Playwright.
- **Conséquences** : à confirmer ou ajuster par l'utilisateur avant le Sprint 0. Les versions exactes retenues seront notées ici à l'initialisation.
- **Versions retenues (api, figées par `uv.lock`, 13/11/2026)** : Python 3.12, uv 0.13.8, FastAPI 0.162.5, Pydantic 2.14.3, pydantic-settings 2.16.2, SQLAlchemy 2.1.8 (API 2.x), asyncpg 0.32.0, Alembic 1.20.1, Uvicorn 0.54.0, PyJWT 2.15.1, pwdlib 0.3.1 ; outils : pytest 9.2.0, pytest-asyncio 1.5.0, httpx 0.28.1, ruff 0.17.5, mypy 2.4.1.
- **Versions retenues (app, figées par `pnpm-lock.yaml`, 13/11/2026)** : Node 24.15, pnpm 12.18.0 (via corepack), Next.js 16.4.6, React 19.3.0, TypeScript 5.9.3, Tailwind CSS 4.3.3, ESLint 9.39.5 + eslint-config-next 16.4.6, TanStack Query 5.107.1, React Hook Form 7.92.0, Zod 4.6.7, @hookform/resolvers 7.0.6, lucide-react 1.72.0. Cache Components et Partial Prefetching laissés activés (réglages par défaut de `create-next-app`). shadcn/ui, police Inter, Vitest et Playwright : à installer aux tâches S0-11 et S0-16.

## D-022 — Les modèles SQLAlchemy reflètent la migration, sans la remplacer
- **Date** : 13/11/2026 · **Statut** : Proposée · **Auteur** : Claude
- **Contexte** : les premiers modèles divergeaient de la base (clés étrangères, index, colonnes calculées) ; un `--autogenerate` aurait produit une migration destructrice.
- **Décision** : la base est créée par les migrations seules. Les modèles reprennent ce qu'Alembic compare (types, nullabilité, clés étrangères avec leur `ON DELETE`, index, colonnes `Computed`) ; les CHECK, déclencheurs et vues restent dans les migrations. Aides communes dans `app/models/colonnes.py`.
- **Conséquences** : `alembic check` doit être muet avant chaque commit touchant `models/` ou `alembic/`. Les colonnes calculées (`quantite_base`, `montant_total` des lignes, `ecart`, `solde_theorique`) ne sont jamais écrites par l'application.

## D-023 — Environnement de développement de l'API dans Docker
- **Date** : 13/11/2026 · **Statut** : Proposée · **Auteur** : Claude
- **Contexte** : le poste Windows bloque l'interpréteur Python 3.12 téléchargé par uv (P-012) ; le montage `/app/.venv` laissait un squelette d'environnement Linux dans le dossier.
- **Décision** : l'API, ses tests et ses outils tournent dans le conteneur `keitala_api` (environnement virtuel dans `/opt/venv`, hors du dossier monté ; dépendances installées avec `uv sync --frozen`). Les tests utilisent une base distincte, `keitala_test_db`, supprimée et recréée par la migration à chaque lancement ; chaque test s'exécute dans une transaction annulée.
- **Conséquences** : commandes de l'API préfixées par `docker exec keitala_api uv run --frozen` (`AGENTS.md` §10). Après un changement de `pyproject.toml`, reconstruire l'image (`up -d --build api`).

## D-024 — Mise en œuvre de la charte dans le code de l'app
- **Date** : 13/11/2026 · **Statut** : Proposée · **Auteur** : Claude
- **Contexte** : la charte fixe les jetons mais pas leur branchement dans Tailwind et shadcn/ui, ni le voile derrière une fenêtre.
- **Décision** : palette Tailwind par défaut retirée (`--color-*: initial`) ; seuls les jetons existent, sous leurs noms français (`bg-fond`, `text-texte-2`, `bg-accent`, `text-blanc` pour le texte sur accent). Rayons `sm/md/lg` = 4/6/8 px, ombre unique `shadow-flottant`, tailles `text-titre-page`, `text-titre-section`, `text-libelle`, `text-chiffre-cle`. Voile des fenêtres : `rgba(15,15,15,0.2)`. Composants shadcn (base Radix) gardés sous leur nom anglais (`Button`, `Badge`…) pour rester compatibles avec la CLI, avec des variantes en français (`principal`, `secondaire`, `discret`, `danger` ; `succes`, `attention`…) ; animations réduites au fondu. Tailles tablette par défaut, bureau à partir de `lg:` (1 024 px). `cn` déclare les tailles personnalisées pour ne pas les confondre avec les couleurs.
- **Conséquences** : un composant ajouté par `shadcn add` arrive avec des classes inconnues (`bg-primary`…) qui ne produisent rien : il faut le restyler avec les jetons avant usage. `next-themes` retiré (thème clair seul).

## D-025 — Outillage qualité et tests de l'app
- **Date** : 13/11/2026 · **Statut** : Proposée · **Auteur** : Claude
- **Contexte** : S0-16 ; D-021 prévoyait Vitest et Playwright sans préciser le reste.
- **Décision** : Prettier 3.10.1 (largeur 100, comme l'API) avec `prettier-plugin-tailwindcss` 0.8.1 pour un ordre de classes stable. Vitest 5.1.0 + Testing Library (react 16.3.3, user-event 14.6.10, jest-dom 7.0.1) + jsdom 30.1.3, fuseau UTC forcé. Playwright 1.65.0 : en local, le Chrome du poste (`channel: "chrome"`, aucun navigateur téléchargé) et `next dev` ; en CI, son Chromium et `next start`. Profils bureau 1 280 px et tablette 768 px. La protection de pnpm 12 contre les versions trop récentes (`minimumReleaseAge`) est respectée : jsdom 31.0.1, publié le jour même, a été écarté plutôt que mis en exception.
- **Conséquences** : `format:check`, `lint`, `typecheck`, `test` et `test:e2e` doivent passer avant chaque commit touchant l'app. Ne pas ajouter d'exception à `minimumReleaseAge` sans décision.

