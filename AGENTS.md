# AGENTS.md — ERP Keitala

Instructions communes à tous les agents de code : **Claude Code, Cursor, Antigravity**.
Ce fichier est la source unique ; `CLAUDE.md` ne fait que l'importer. Le garder **sous 10 000 caractères** : le détail vit dans les fichiers cités.

## 1. Le projet en bref

ERP web pour **Keitala** (Mali) : stockage et vente de semences, grains et intrants, transformation agroalimentaire (attiéké, gari, tapioka, café de soja, djouka...) et vente des produits finis.

- **Modules** : stocks, achats, production en deux étapes, ventes et dons, trésorerie et dépenses, tableaux de bord.
- **Utilisateurs** : 3 rôles. Le **Gestionnaire** fait toutes les saisies, seul, sur PC de bureau et tablette d'atelier. Le **Super Admin** paramètre et contrôle après coup. Le **Consultant** lit seulement.
- **Contexte** : interface en français, devise FCFA (sans décimales), application 100 % en ligne.
- **Remplace** un classeur Excel fragile (`ERP_Keitala.xlsx`).

## 2. Où est la vérité

| Sujet | Fichier |
| :--- | :--- |
| État d'avancement, prochaine tâche | `suivi/AVANCEMENT.md` |
| Décisions prises et leurs raisons | `suivi/DECISIONS.md` |
| Problèmes, questions ouvertes, risques | `suivi/PROBLEMES.md` |
| Journal des sessions de travail | `suivi/JOURNAL.md` |
| Modèle de données (24 tables) | `schema.sql` |
| Architecture, endpoints, sécurité | `conception_technique_erp_keitala.md` |
| User stories et critères d'acceptation | `product_backlog_erp_keitala.md` |
| Rôles, cas d'utilisation, classes | `conception_uml_erp_keitala.md` |
| Besoin métier, règles de gestion | `cahier_des_charges_erp_keitala.md` |
| Charte graphique et règles UX | `design/CHARTE_UX_UI.md` |
| Conventions backend / frontend | `developpement/api/README.md`, `developpement/app/README.md` |

**En cas de contradiction**, l'ordre de priorité est : `DECISIONS.md` (entrée la plus récente) > `schema.sql` > conception technique > backlog > UML > cahier des charges. Ne pas deviner : noter la contradiction dans `PROBLEMES.md` et demander à l'utilisateur.

**Ne jamais modifier** : `ERP_Keitala.xlsx`, `Note.txt`, `archive_v1.0/`.

## 3. Arborescence

```
Keitala_project/
├── AGENTS.md, CLAUDE.md          # instructions agents
├── *.md, schema.sql              # spécifications v1.1
├── suivi/                        # avancement, décisions, problèmes, journal
├── design/                       # charte UX/UI
├── archive_v1.0/                 # anciennes versions, lecture seule
└── developpement/
    ├── app/                      # frontend Next.js (+ proxy /api)
    └── api/                      # backend FastAPI
```

## 4. Stack imposée

- **app** : Next.js (App Router), TypeScript strict, Tailwind CSS, TanStack Query, React Hook Form + Zod, Lucide Icons, composants de base shadcn/ui restylés selon la charte. Gestionnaire de paquets : pnpm.
- **api** : Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0 async, Alembic, pytest. Gestionnaire de paquets : uv.
- **Base** : PostgreSQL 16 (Docker Compose en développement).
- **Hébergement cible** : Vercel (app) et VPS Linux Docker (api, base).

Prendre la dernière version stable de chaque outil au moment de l'initialisation et noter les versions retenues dans `DECISIONS.md`. Toute nouvelle dépendance importante se justifie dans `DECISIONS.md`.

## 5. Protocole de travail (obligatoire)

**Au début de chaque session**
1. Lire `suivi/AVANCEMENT.md` (sections « État actuel » et « Prochaine tâche »).
2. Lire les 3 dernières entrées de `suivi/JOURNAL.md` et les points ouverts de `suivi/PROBLEMES.md`.
3. Lire le README du dossier où l'on va travailler, et la charte si l'on touche à l'interface.

**Pendant**
- Une tâche = une user story ou une tâche technique de `AVANCEMENT.md`. Ne pas élargir le périmètre.
- Relire les critères d'acceptation de la story dans le backlog avant de coder.
- Petits commits. Ne pas réécrire ce qui marche sans raison notée.

**À la fin de chaque session** (même interrompue)
1. Mettre à jour les cases et l'« État actuel » de `AVANCEMENT.md`.
2. Ajouter une entrée dans `JOURNAL.md` (modèle en tête du fichier) : fait, non fait, à reprendre.
3. Toute décision nouvelle → `DECISIONS.md`. Tout blocage, doute ou bug non corrigé → `PROBLEMES.md`.

Un autre agent, sur un autre outil, doit pouvoir reprendre sans autre contexte que ces fichiers.

## 6. Règles métier non négociables

1. **Unité de base** : le stock, le seuil et le coût d'un article sont toujours en unité de base. Un sac de 50 kg est une unité de saisie (`article_unites`), jamais un article.
2. **Pas de stock négatif** : sortie refusée si le stock est insuffisant, sauf `autoriser_stock_negatif` sur l'article.
3. **Une opération = une transaction** : pièce, lignes, mouvements de stock, écritures de trésorerie et soldes sont écrits ensemble ou pas du tout, après `SELECT ... FOR UPDATE` sur les articles et comptes touchés.
4. **Journaux immuables** : `mouvements_stock` et `transactions_tresorerie` ne sont ni modifiés ni supprimés. Une erreur se corrige par une écriture inverse (`ANNULATION`).
5. **Rien n'est supprimé** : une pièce validée s'annule (statut `ANNULE`, motif, contre-passation). Aucun endpoint `DELETE` sur les pièces.
6. **Règlements** : tout mouvement d'argent passe par un compte de trésorerie et par la table `reglements` (ou `depenses`, `transferts_internes`). « À crédit » = vente ou achat sans règlement complet, avec tiers identifié.
7. **Mobile Money** : un compte par opérateur (Orange Money, Mobicash, Wave), saisie **manuelle** du montant. Aucune intégration d'API opérateur.
8. **Production en deux étapes** : transformation (matières → semi-fini en vrac), puis conditionnement (vrac + emballages → produit fini). Consommations réelles saisies à la clôture ; coût de revient réparti sur les quantités produites.
9. **Rôles** : le contrôle d'accès est fait dans l'API. Toute écriture d'un `CONSULTANT` renvoie 403. Le Super Admin ne valide rien en amont : il marque après coup (`controle_par`, `controle_le`).
10. **Argent et quantités** : `Decimal` côté Python, `numeric` côté base, jamais de `float`.
11. **Numérotation** : `PREFIXE-AAAA-NNNN` via `compteurs_documents`, attribuée dans la transaction.

**Hors périmètre** (ne pas développer) : suivi des champs et parcelles, mode hors connexion, intégration des API Mobile Money, multi-devise, multi-dépôt, comptabilité générale.

## 7. Conventions de code

- **Vocabulaire** : les noms de tables, colonnes, champs JSON et routes reprennent le français de `schema.sql` (`ventes`, `quantite_base`, `/api/v1/ventes`). Le code technique (utilitaires, hooks, config) peut être en anglais. Tout texte affiché est en français.
- **Schéma** : `schema.sql` v1.1 est figé. La première migration Alembic le reproduit à l'identique ; toute évolution passe par une nouvelle migration **et** une entrée dans `DECISIONS.md`.
- **Tests** : chaque règle de la section 6 a au moins un test côté API, exécuté sur un vrai PostgreSQL (les contraintes et déclencheurs comptent). Parcours critiques testés de bout en bout côté app : vente, achat, clôture d'OF.
- **Git** : branches `feat/US-VTE-01-saisie-vente`, `fix/...`, `chore/...`. Commits au format Conventional Commits, en français, avec l'identifiant de la story : `feat(ventes): saisie rapide comptoir (US-VTE-01)`.
- **Secrets** : jamais dans le dépôt. Fournir un `.env.example` à jour.

## 8. Expérience utilisateur : la priorité du projet

Le succès se mesure à la facilité d'usage par une personne seule, peu technique, qui saisit toute la journée. Lire `design/CHARTE_UX_UI.md` avant tout travail d'interface. L'essentiel :

- **Minimaliste, inspiré de Notion** : fond blanc, gris chauds, bordures fines, beaucoup d'espace, une seule couleur d'accent, aucune décoration.
- **Une action principale par écran** ; la tâche courante en trois gestes au plus.
- **Montrer la conséquence avant de valider** : conversion (« 3 sacs = 150 kg »), stock après, solde après, reste à payer.
- **Prévenir l'erreur** : montants formatés pendant la frappe (`2 030 000 FCFA`), confirmation en toutes lettres au-dessus du seuil, stock disponible affiché.
- **Ne jamais perdre une saisie** : formulaire conservé si le réseau tombe, bouton bloqué pendant l'envoi, message qui dit quoi faire.
- **Chaque écran a ses quatre états** : chargement, vide, erreur, données.
- **Tablette** : cibles tactiles de 44 px minimum, utilisable à partir de 768 px de large.

## 9. Définition de « terminé »

Une story est terminée quand :
- [ ] tous ses critères d'acceptation du backlog sont remplis ;
- [ ] les règles de la section 6 concernées sont testées, et les tests passent ;
- [ ] lint et vérification de types passent (app et api) ;
- [ ] l'écran respecte la charte et gère chargement, vide et erreur ;
- [ ] l'écran a été essayé en largeur tablette et avec le rôle Consultant ;
- [ ] `AVANCEMENT.md` et `JOURNAL.md` sont à jour.

## 10. Commandes

### Base de données (Docker)
`docker compose -f developpement/docker-compose.yml` suivi de `up -d db`, `ps` ou `down`. Port local : `5433`.

### Backend API (`developpement/api`)
Tout se lance **dans le conteneur** (le poste Windows bloque Python 3.12, voir P-012) : préfixer par `docker exec keitala_api uv run --frozen`.
- Démarrage : même commande Docker avec `up -d --build api` → http://localhost:8000/docs
- Migrations : `alembic upgrade head` ; nouvelle révision : `alembic revision --autogenerate -m "..."`, puis `alembic check` doit être muet
- Tests : `pytest` (base `keitala_test_db` recréée à chaque fois)
- Lint, format, types : `ruff check .`, `ruff format .`, `mypy .`
- Premier Super Admin : `python -m app.commandes.creer_super_admin --nom "..." --email ...` (avec `docker exec -it`) ; comptes de test e2e : `app.commandes.comptes_e2e`

### Frontend App (`developpement/app`)
`pnpm` (ou `corepack pnpm`) suivi de `install`, `dev`, `build`, `lint`, `format:check`, `typecheck`, `test`, `test:e2e`.
