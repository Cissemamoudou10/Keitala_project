# API — ERP Keitala (backend)

Backend FastAPI. Socle en place (Sprint 0, tâches S0-4 à S0-9) ; les domaines métier arrivent à partir du Sprint 1.

À lire avant de travailler ici : `AGENTS.md` (racine), `schema.sql`, `conception_technique_erp_keitala.md` (sections 3 et 4).

## Stack

Python 3.12 · FastAPI · Pydantic v2 · SQLAlchemy 2.0 (async, pilote `asyncpg`) · Alembic · PostgreSQL 16 · pytest · gestionnaire de paquets `uv`.

## Structure visée

```
api/
├── pyproject.toml
├── .env.example
├── Dockerfile
├── alembic.ini
├── alembic/
│   └── versions/            # 0001 = schema.sql v1.1 à l'identique
├── app/
│   ├── main.py              # création de l'application, routes, gestion des erreurs
│   ├── core/                # configuration, sécurité (JWT, mots de passe), dépendances de rôle
│   ├── db/                  # moteur, session, base déclarative
│   ├── models/              # modèles SQLAlchemy, un fichier par domaine
│   ├── schemas/             # schémas Pydantic d'entrée et de sortie
│   ├── services/            # LOGIQUE MÉTIER et transactions
│   └── routers/             # routes fines : validation, appel du service, réponse
└── tests/
    ├── conftest.py          # base PostgreSQL de test, jeux de données
    ├── services/
    └── routers/
```

Domaines (même découpage pour `models`, `schemas`, `services`, `routers`) : `auth`, `utilisateurs`, `tiers`, `articles`, `stocks`, `achats`, `ventes`, `reglements`, `production`, `tresorerie`, `controles`, `dashboard`.

## Règles

### Métier et transactions
- Toute la logique métier est dans `services/`. Les routes ne contiennent ni calcul ni requête.
- **Une opération métier = une transaction.** Le service ouvre la transaction, verrouille, écrit tout, et valide. En cas d'erreur, rien n'est écrit.
- **Verrouillage** : `SELECT ... FOR UPDATE` sur les articles et comptes touchés, **toujours dans l'ordre croissant des identifiants**, pour éviter les interblocages.
- **Stock** : passer par une seule fonction de service qui écrit le mouvement (`mouvements_stock`) et met à jour `articles.stock_actuel` et `cout_moyen`. Ne jamais modifier `stock_actuel` ailleurs.
- **Trésorerie** : même principe, une seule fonction écrit dans `transactions_tresorerie` et met à jour `comptes_tresorerie.solde_actuel`.
- **Numérotation** : incrément de `compteurs_documents` dans la transaction (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`).
- **Annulation** : statut `ANNULE`, motif, et écritures inverses de type `ANNULATION`. Aucune route `DELETE` sur les pièces.
- **Nombres** : `Decimal` partout pour l'argent et les quantités. Jamais de `float`. Arrondis explicites.

### Accès
- Jeton JWT lu dans l'en-tête `Authorization: Bearer`, envoyé par le proxy Next.js.
- Dépendances de rôle sur chaque route. Toute route d'écriture refuse `CONSULTANT` (403). Les routes `/utilisateurs`, `/controles` et la création de comptes sont réservées à `SUPER_ADMIN`.
- Tester le refus d'accès pour chaque routeur.

### Forme de l'API
- Préfixe `/api/v1`. Noms de routes et de champs JSON en français, identiques aux colonnes de `schema.sql`.
- Erreurs au format unique, avec un message en français prêt à afficher :
  ```json
  { "code": "STOCK_INSUFFISANT", "message": "Stock insuffisant : il reste 12 sachets de Gari 200 g.", "details": { "article_id": "...", "disponible": "12" } }
  ```
- Listes paginées (`page`, `taille`, 50 par défaut) avec le total.
- Les montants et quantités sortent en chaînes décimales, pas en nombres flottants.

### Base de données
- `schema.sql` v1.1 est figé. La migration `0001` l'exécute tel quel. Toute évolution = nouvelle migration + entrée dans `suivi/DECISIONS.md`.
- Ne pas contourner les contraintes ni les déclencheurs de la base : ils sont le dernier rempart.

### Tests
- Les tests tournent sur un **vrai PostgreSQL** (conteneur), jamais sur SQLite : les contraintes, vues et déclencheurs font partie du comportement.
- Au minimum un test par règle de `AGENTS.md` section 6, et pour chaque service : le cas normal, le stock insuffisant, l'annulation, le refus d'accès.
- Vérifier après chaque opération que `stock_actuel` égale la somme des mouvements et que `solde_actuel` égale la somme des écritures.

## Points en attente

Voir `suivi/PROBLEMES.md` : P-009 (protection contre le double enregistrement, à trancher avant le Sprint 4) et P-010 (annulation d'un achat et PUMP).

## Commandes

Voir `AGENTS.md` section 10 : tout se lance dans le conteneur `keitala_api` (D-023).

## Repères du socle

- **Modèles** : reflet de la migration, jamais l'inverse (D-022). Après toute modification de `models/` ou `alembic/`, `alembic check` doit répondre « No new upgrade operations detected ».
- **Erreurs** : lever `ErreurMetier(code, message, status_code, details)` depuis un service (`app/core/erreurs.py`).
- **Listes** : `paginer(session, requete, PaginationParams)` dans `app/db/pagination.py`, avec un `ORDER BY` stable ; réponse `PageReponse[T]`.
- **Accès** : tout routeur métier se déclare avec `dependencies=ACCES_METIER` (`app/core/dependances.py`) : session exigée, écritures du Consultant refusées (403). Rôles particuliers : `Depends(exiger_roles(...))`. Utilisateur courant : paramètre `utilisateur: UtilisateurCourant`.
- **Session** : jeton d'accès (30 min) et de rafraîchissement (7 jours) ; l'utilisateur est relu à chaque requête, et les jetons portent une empreinte du mot de passe (une réinitialisation coupe les sessions ouvertes).
- **Tests** : fixtures `creer_compte(role)` et `entetes_pour(utilisateur)` (`tests/conftest.py`) ; fixture `db_session` (transaction annulée à la fin) ; tests de base dans `tests/db/`, avec les fixtures `gestionnaire`, `article` et `caisse`.
