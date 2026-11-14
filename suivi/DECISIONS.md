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

## D-026 — Mise en œuvre de l'authentification et des droits
- **Date** : 13/11/2026 · **Statut** : Proposée · **Auteur** : Claude
- **Contexte** : Sprint 1 ; la conception fixe les cookies HttpOnly et le contrôle dans l'API, pas les durées ni la révocation, et le schéma n'a pas de table de sessions.
- **Décision** : jeton d'accès 30 min, de rafraîchissement 7 jours (configurables). L'utilisateur est relu en base à chaque requête (désactivation et changement de rôle immédiats). Les jetons portent une empreinte courte du hash du mot de passe : une réinitialisation invalide les sessions ouvertes, sans table de révocation ni migration. Règle 9 appliquée par `ACCES_METIER` sur chaque routeur métier. Un Super Admin ne peut ni se désactiver ni se retirer ses droits, et il reste toujours au moins un Super Admin actif (lignes verrouillées pendant la vérification). Email normalisé en minuscules ; même message pour un email inconnu et un mauvais mot de passe, temps de réponse égalisé. Mot de passe : 8 caractères au moins, sans autre règle (charte, §1). Dépendance ajoutée : `pydantic[email]` (email-validator 2.3.0) pour valider les adresses. App : `src/proxy.ts` pour la redirection rapide, renouvellement automatique par le proxy `/api`, rechargement complet à la déconnexion (mémoire vidée sur poste partagé). Comptes de test e2e `e2e-*@keitala.test`, créés par une commande refusée hors `ENV=dev`, mot de passe de test dans `developpement/app/.env.example`.
- **Conséquences** : pas de déconnexion « partout » sans changer le mot de passe ; pas de limitation des essais de connexion (P-015). Tout nouveau routeur métier doit porter `ACCES_METIER`.

## D-027 — Référentiels : règles de saisie et emplacement des écrans
- **Date** : 14/11/2026 · **Statut** : Proposée · **Auteur** : Claude
- **Contexte** : Sprint 2 ; plusieurs points non tranchés par les spécifications.
- **Décision** :
  - Comptes de trésorerie : code technique déduit du nom (`BANQUE_BDM`), unique ; nom unique à la casse près ; type et opérateur non modifiables (on crée un autre compte). Solde d'ouverture : une seule fois par compte, montant strictement positif en FCFA entiers, écrit par `ecrire_mouvement_tresorerie` (écriture `SOLDE_INITIAL`), après confirmation en chiffres et en toutes lettres. Un solde nul ne se saisit pas.
  - Articles : code (SKU) en majuscules, lettres, chiffres et tirets ; unité de base libre (suggestions kg, L, sachet, bouteille, pot, unité) ; unité de base et famille figées dès le premier mouvement de stock ; prix de vente en FCFA entiers ; stock et coût moyen jamais saisis. Unités de saisie : la liste envoyée remplace l'ancienne ; une unité déjà utilisée sur une ligne d'achat ou de vente ne peut pas être retirée ; changer un facteur ne touche pas le passé (chaque ligne garde le sien).
  - Tiers : à la création, l'API signale un tiers de même nom (accents et casse ignorés) ou de même téléphone (8 derniers chiffres) ; l'utilisateur ouvre la fiche existante ou confirme. Pas de blocage : les homonymes existent.
  - Écrans : le menu garde six entrées (charte §6) ; les tiers ont leur page `/tiers`, ouverte depuis Ventes et Achats ; les comptes de trésorerie sont gérés sur la page Trésorerie (cartes de la charte §11).
  - Recherche insensible aux accents par `translate()` SQL, sans extension `unaccent` (pas de migration).
  - `nombres-en-lettres.ts` écrit dès ce sprint pour la confirmation du solde d'ouverture (prévu pour US-TRES-02).
- **Conséquences** : une erreur de solde d'ouverture ne se corrige pas par l'écran (P-017). Les écrans de vente et d'achat devront utiliser `ChampQuantite` pour finir US-REF-02.

## D-028 — Stock de départ valorisé et règles des inventaires
- **Date** : 14/11/2026 · **Statut** : Acceptée (coût saisi, et inventaires et pertes réservés au Gestionnaire, confirmés par l'utilisateur) ; reste Proposée · **Auteur** : utilisateur et Claude
- **Contexte** : le stock de départ est saisi par inventaire (D-018) alors que tous les coûts moyens sont à 0 ; sans valeur, il diluerait le coût moyen au premier achat et fausserait les marges.
- **Décision (acceptée)** : migration `0002` : colonne facultative `lignes_inventaire.cout_unitaire` (≥ 0). À la validation, un excédent sur un article sans coût moyen exige ce coût ; l'entrée est valorisée à ce coût et le coût moyen recalculé (pondéré). Les autres ajustements se font au coût moyen du moment, inchangé.
- **Décisions (proposées)** :
  - Un seul inventaire en cours à la fois. Comptage prérempli avec le stock théorique figé (seuls les écarts sont à saisir). L'écart (compté − théorique figé) s'applique au stock du moment à la validation : une vente faite pendant le comptage reste comptée. Un inventaire en cours peut être abandonné (D-029).
  - (Acceptée le 14/11/2026) Matrice des droits appliquée telle quelle : inventaires et pertes sont saisis et validés par le **Gestionnaire** seul ; le Super Admin ne fait pas l'inventaire, il le contrôle après coup (Sprint 6) ; le Consultant consulte.
  - Pertes : motifs Casse, Avarie, Dessiccation, Autre (« Erreur de comptage » réservé aux inventaires) ; valorisées au coût moyen, sans trésorerie.
  - État des stocks : l'indicateur suit la charte (on n'affiche que l'exception, « Stock bas » en rouge) plutôt que le vert/rouge du backlog (US-STK-02). « Sous le seuil » = stock ≤ seuil, comme la vue `v_stock_valorise` : un article à 0 avec un seuil à 0 est donc signalé (rupture).
  - Écriture unique des stocks (`ecrire_mouvement_stock`), articles verrouillés dans l'ordre croissant des identifiants ; coût moyen arrondi à 4 décimales.
- **Conséquences** : tant que les seuils des produits finis restent à 0 (P-001), tout produit fini sans stock apparaît « Stock bas ».

## D-029 — Abandon d'un inventaire, seuils et base dédiée aux parcours e2e
- **Date** : 14/11/2026 · **Statut** : Acceptée · **Auteur** : utilisateur, mis en œuvre par Claude
- **Contexte** : réponses de l'utilisateur aux points ouverts du Sprint 3 (P-001, P-016, P-018).
- **Décision** :
  - Seuils d'alerte : le Super Admin les paramètre lui-même dans l'application (fiche article, « Seuil d'alerte »). Pas de liste de seuils à attendre du client avant de développer.
  - Abandon d'un inventaire (recommandation retenue) : statut `ANNULE` (migration `0003`), réservé au Gestionnaire, motif obligatoire ajouté aux observations (« Abandonné par … : … »), aucun mouvement de stock, numéro conservé. Rien n'est supprimé (règle 5) et la numérotation reste continue.
  - Parcours de bout en bout sur une base à part : service Docker `api-e2e` (port 8001, base `keitala_e2e_db`, préparée par `preparer_base_e2e`). La base de développement, remise à neuf le 14/11/2026, n'est plus touchée par les tests.
- **Conséquences** : lancer `up -d api-e2e` avant `pnpm test:e2e` en local. La base de développement remise à neuf n'a plus de compte : créer le premier Super Admin (S1-T1).

## D-030 — Achats : idempotence, annulation et soldes de trésorerie
- **Date** : 14/11/2026 · **Statut** : Acceptée (idempotence et annulation, validées par l'utilisateur au lancement du Sprint 4) ; reste Proposée · **Auteur** : utilisateur et Claude
- **Contexte** : Sprint 4 (US-ACH-01 à 04). P-009 (double envoi sur réseau instable) et P-010 (annulation d'un achat après coup) devaient être tranchés avant de saisir les premières pièces.
- **Décisions (acceptées)** :
  - Idempotence (P-009) : migration `0004`, colonne `cle_idempotence UUID` unique et facultative sur `achats`, `ventes`, `reglements`, `depenses` et `transferts_internes`. Le formulaire génère la clé à son ouverture et la garde dans son brouillon ; un second envoi avec la même clé renvoie la pièce déjà créée (200 au lieu de 201) sans rien écrire.
  - Annulation d'un achat (P-010) : le stock est repris au coût d'entrée d'origine (prix ÷ facteur), avec recalcul inverse du coût moyen sur le stock restant (`cout_retrait`) ; refus (`ANNULATION_IMPOSSIBLE`) si le stock deviendrait négatif, sauf dérogation ; les règlements valides passent à `ANNULE` et sont contre-passés sur leur compte (écriture `ANNULATION`).
- **Décisions (proposées)** :
  - Un compte Caisse ou Mobile Money ne descend jamais sous zéro (`SOLDE_INSUFFISANT`, contrôlé dans `ecrire_mouvement_tresorerie`) ; un compte Banque peut être à découvert.
  - Droits : achats saisis, réglés et annulés par le Gestionnaire seul (matrice) ; Super Admin et Consultant consultent.
  - Achat à crédit (reste > 0) : fournisseur du répertoire obligatoire ; un nom saisi librement suffit pour un achat payé comptant.
  - Paiement ultérieur d'une dette : date du jour, montant plafonné au reste à payer.
  - Formulaire : brouillon gardé dans le navigateur, premier paiement pré-rempli au total sur la Caisse, confirmation en lettres à partir de 1 000 000 FCFA (valeur de P-005, en attendant son paramétrage).
  - Bouton de l'app : `type="button"` par défaut ; seul le bouton d'envoi déclare `type="submit"` (un bouton d'appoint envoyait le formulaire).
- **Conséquences** : les ventes, dépenses et transferts des sprints suivants réutilisent la même clé et le même contrôle de solde.

