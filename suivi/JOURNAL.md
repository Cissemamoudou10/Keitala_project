# Journal des sessions — ERP Keitala

Une entrée par session de travail, **la plus récente en haut**. C'est le relais entre agents et entre outils : écrire pour quelqu'un qui n'a rien vu de la session.

**Modèle d'entrée** (à copier)

```
## AAAA-MM-JJ — Outil / agent — Titre de la session
- **Tâche** : identifiant et intitulé (ex. US-VTE-01 Saisie rapide de vente)
- **Fait** : ce qui est terminé et vérifié.
- **Non fait / en cours** : ce qui reste, et où en est le code.
- **Vérifications** : tests lancés et résultat ; ce qui n'a pas été vérifié.
- **Décisions** : D-0XX ajoutées (ou « aucune »).
- **Problèmes** : P-0XX ouverts ou résolus (ou « aucun »).
- **À reprendre par le suivant** : la première chose à faire.
```

---

## 2026-11-13 — Claude Code — Charte, coquille et proxy de l'app (S0-11 à S0-13)
- **Tâche** : S0-11 jetons, police, composants ; S0-12 coquille ; S0-13 proxy et client d'appel. Travail précédent commité avec l'accord de l'utilisateur (3 commits), puis un commit par tâche.
- **Fait** : S0-11 : shadcn/ui 4.23 (base Radix) ; palette Tailwind remplacée par les seuls jetons de la charte ; Inter ; `Button` (principal, secondaire, discret, danger, `enCours`), `Input`, `Label`, `Champ`, `Select`, `Table`, `Badge`, `Dialog`, `Toaster` + `notifier` ; `cn` configuré pour les tailles personnalisées (sinon `text-libelle` disparaissait devant `text-texte`) ; `next-themes` retiré ; catalogue `/composants` (dev seulement). S0-12 : `Coquille` (barre latérale 240 px repliable, tiroir sous 1 024 px, lien actif `aria-current`), composant `Page`, pages provisoires des six modules, `/` redirige vers le tableau de bord, page 404 en français. S0-13 : proxy `/api/[...chemin]` (toutes méthodes, jeton depuis le cookie `keitala_acces`, segments `..` refusés, 502/504 avec messages honnêtes), `appelerApi` + `ErreurApi`, fournisseur TanStack Query (pas de nouvel essai des écritures).
- **Non fait / en cours** : contrôle visuel à l'écran (P-013). Rafraîchissement du jeton sur 401 : Sprint 1 avec la connexion. Tests Vitest : S0-16.
- **Vérifications** : `pnpm lint`, `pnpm typecheck`, `pnpm build` : OK. Classes de jetons présentes dans le CSS de production ; aucune couleur hors charte dans `src`. Via le serveur de dev : `/` → 307 vers `/tableau-de-bord`, lien actif marqué, Administration masquée sans rôle ; proxy : `/api/sante` 200, 404 et 405 de l'API relayés en français, API arrêtée → 502 `API_INJOIGNABLE`.
- **Décisions** : D-024 proposée.
- **Problèmes** : P-013 ouvert.
- **À reprendre par le suivant** : régler P-013 (regarder les écrans à 1 280 et 768 px), puis S0-14.

## 2026-11-13 — Claude Code — Initialisation du projet Next.js (S0-10)
- **Tâche** : S0-10 Initialiser le projet Next.js.
- **Fait** : projet généré par `create-next-app` 16.4.6 (App Router, TypeScript strict, Tailwind 4, ESLint, `src/`, alias `@/*`) puis épuré : page provisoire en français, `lang="fr"`, CSS réduit à Tailwind (jetons à S0-11), police Geist, favicon et images du gabarit retirés. Dépendances de la stack ajoutées (TanStack Query, React Hook Form, Zod, résolveurs, Lucide). `.env.example` (`API_URL`, serveur uniquement) ; `.gitignore` corrigé pour versionner `.env.example` ; script `typecheck` = `next typegen && tsc --noEmit` ; `@types/node` aligné sur Node 24. `AGENTS.md` imbriqué de Next.js conservé (recréé par `next dev`). README de l'app et `AGENTS.md` §10 mis à jour.
- **Non fait / en cours** : shadcn/ui, police, jetons (S0-11) ; Vitest, Playwright (S0-16). Aucun commit.
- **Vérifications** : `pnpm build`, `pnpm lint`, `pnpm typecheck` (aussi depuis un dossier `.next` supprimé) : OK. `pnpm dev` : `GET /` répond 200 avec `lang="fr"`. Non vérifié : affichage visuel (page sans contenu utile).
- **Décisions** : versions de l'app notées dans D-021.
- **Problèmes** : aucun nouveau. pnpm n'est pas installé globalement : `corepack pnpm` suffit.
- **À reprendre par le suivant** : S0-11. Lire `design/CHARTE_UX_UI.md` en entier, puis la doc Next 16 sur les polices (`node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`).

## 2026-11-13 — Claude Code — Reprise et fin du socle API (S0-5 à S0-9)
- **Tâche** : S0-5 à S0-9, reprise du travail interrompu de la session Antigravity.
- **Fait** : migration 0001 vérifiée identique à `schema.sql` (comparaison `pg_dump` structure + données initiales sur deux bases temporaires) puis appliquée sur `keitala_db`. Modèles réécrits et alignés (`alembic check` muet) : `ON DELETE` du schéma, 25 index, colonnes calculées nullables, valeurs par défaut serveur, `StrEnum` ; aides dans `app/models/colonnes.py` ; import circulaire de `db/base.py` retiré. Format d'erreur commun (`app/core/erreurs.py` : `ErreurMetier`, 4xx, validation traduite, 500 sans détail technique). Pagination (`app/db/pagination.py`). `/api/v1/sante` renvoie 503 sans fuite d'exception si la base tombe. `SECRET_KEY` par défaut refusée hors `dev`. Tests sur `keitala_test_db` recréée à chaque lancement, une transaction annulée par test. Dockerfile : uv figé, `uv sync --frozen`, environnement dans `/opt/venv` ; volume `/app/.venv` retiré du compose. `AGENTS.md` §10 mis à jour et repassé sous 10 000 caractères.
- **Non fait / en cours** : rien côté API. Aucun commit (consigne de l'utilisateur).
- **Vérifications** : dans le conteneur, `ruff check`, `ruff format --check`, `mypy` strict : OK ; `pytest` : 20 tests verts (contraintes stock négatif, journaux immuables, cohérence des journaux, don, règlement, Mobile Money, colonnes calculées, données initiales, erreurs, pagination, santé). `curl /api/v1/sante` : 200. Non vérifié : `uv` hors conteneur (bloqué, P-012).
- **Décisions** : versions notées dans D-021 ; D-022 et D-023 proposées.
- **Problèmes** : P-012 ouvert.
- **À reprendre par le suivant** : S0-10 (projet Next.js). Rappeler à l'utilisateur de commiter S0-4 à S0-9.

## 2026-11-13 — Antigravity — Initialisation du projet API (S0-4 à S0-6), interrompue
- **Tâche** : S0-4 à S0-6. Entrée reconstituée par Claude Code d'après le dernier message de l'agent : la session s'est arrêtée sur une limite de quota.
- **Fait** : projet FastAPI (config, session, `/api/v1/sante`, gestion des erreurs de validation), `Dockerfile` et service `api` dans le compose, modèles SQLAlchemy (11 fichiers), Alembic et migration 0001 écrits par deux sous-agents en parallèle.
- **Non fait / en cours** : migration jamais appliquée, modèles non vérifiés, journal et avancement non mis à jour, rien de commité.
- **Vérifications** : `/sante` répondait « connecte ».
- **Décisions** : aucune notée.
- **Problèmes** : aucun noté.
- **À reprendre par le suivant** : voir l'entrée du dessus.

## 2026-11-13 — Claude — Mise en place du cadre de développement
- **Tâche** : préparer le projet pour un développement à plusieurs agents.
- **Fait** : `AGENTS.md` et `CLAUDE.md` ; dossier `suivi/` (avancement, décisions D-001 à D-021, problèmes P-001 à P-011, journal) ; `design/CHARTE_UX_UI.md` ; `developpement/app` et `developpement/api` avec leur README ; `.gitignore`.
- **Non fait / en cours** : aucun code. Git non initialisé. Les projets Next.js et FastAPI ne sont pas créés.
- **Vérifications** : contrastes de la palette calculés (tous les textes courants au-dessus de 4,5:1).
- **Décisions** : D-009, D-010, D-019 ; D-021 proposée, à confirmer.
- **Problèmes** : P-005, P-006, P-007, P-009, P-010 ouverts.
- **À reprendre par le suivant** : Sprint 0, tâche S0-1 de `AVANCEMENT.md`. Faire confirmer D-021 par l'utilisateur avant d'installer les outils.

## 2026-11-13 — Claude — Analyse et correction des spécifications (v1.1)
- **Tâche** : analyser le dossier, puis corriger les incohérences.
- **Fait** : `schema.sql` réécrit en v1.1 (24 tables) ; cahier des charges, conception technique, UML et backlog alignés (34 stories) ; versions d'origine copiées dans `archive_v1.0/`.
- **Non fait / en cours** : rien.
- **Vérifications** : `schema.sql` exécuté sur un PostgreSQL 16 de test ; contraintes vérifiées (stock négatif, journaux immuables, don avec montant, règlement sans pièce). Rendu des diagrammes Mermaid non vérifié (P-011).
- **Décisions** : D-001 à D-008, D-011 à D-018, D-020.
- **Problèmes** : P-001 à P-004, P-008, P-011 ouverts.
- **À reprendre par le suivant** : voir l'entrée du dessus.
