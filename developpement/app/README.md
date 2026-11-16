# App — ERP Keitala (frontend)

Frontend Next.js et proxy vers l'API. Socle en place : projet (S0-10), charte et composants (S0-11), coquille (S0-12), proxy et client d'appel (S0-13), formats et champ de montant (S0-14), quatre états d'écran (S0-15). Reste S0-16 (outillage de tests) dans `suivi/AVANCEMENT.md`.

À lire avant de travailler ici : `AGENTS.md` (racine) et **`design/CHARTE_UX_UI.md` en entier**. L'expérience utilisateur est la priorité du projet.

## Stack

Next.js (App Router) · TypeScript strict · Tailwind CSS · TanStack Query · React Hook Form + Zod · Lucide Icons · composants de base shadcn/ui restylés selon la charte · Vitest · Playwright · gestionnaire de paquets `pnpm`.

## Structure visée

```
app/
├── package.json
├── .env.example                 # API_URL (variable serveur, jamais NEXT_PUBLIC_)
└── src/
    ├── app/
    │   ├── (auth)/connexion/            # écran de connexion
    │   ├── (erp)/                       # coquille : barre latérale + contenu
    │   │   ├── tableau-de-bord/
    │   │   ├── stocks/
    │   │   ├── achats/
    │   │   ├── ventes/
    │   │   ├── production/
    │   │   ├── tresorerie/
    │   │   └── administration/          # Super Admin
    │   ├── api/[...chemin]/route.ts     # PROXY vers FastAPI
    │   └── globals.css                  # jetons de la charte
    ├── components/
    │   ├── ui/                  # briques de base : bouton, champ, tableau, étiquette...
    │   ├── saisie/              # champ montant, champ quantité + unité, sélecteur d'article
    │   ├── etats/               # chargement, vide, erreur
    │   └── <domaine>/           # composants propres à un module
    └── lib/
        ├── api.ts               # client d'appel de /api, gestion des erreurs
        ├── formats.ts           # montant, quantité, date, téléphone
        ├── droits.ts            # ce que chaque rôle peut faire
        └── nombres-en-lettres.ts
```

## Règles

### Proxy et session

- Le navigateur n'appelle **que** `/api/...` sur le domaine de l'app. Le Route Handler relaie vers FastAPI (`API_URL`).
- Les jetons sont dans des cookies `HttpOnly`, `Secure`, `SameSite=Lax`, posés par le proxy. Aucun jeton dans le JavaScript de la page, ni dans `localStorage`.
- Sur un 401, le proxy tente un rafraîchissement puis rejoue la requête ; en cas d'échec, retour à la connexion en conservant la page demandée.

### Données

- Composants serveur par défaut ; composants client pour l'interaction.
- TanStack Query pour toute donnée côté client. Après une écriture, invalider les listes concernées (stocks, soldes, pièces).
- Tri, filtres et pagination dans l'adresse de la page.
- Les montants et quantités arrivent de l'API en chaînes décimales : ne pas les convertir en nombres flottants pour calculer. Les totaux qui font foi viennent de l'API ; ceux affichés en direct sont indicatifs.

### Interface

- Appliquer la charte sans exception : jetons de couleur uniquement, une action principale par écran, quatre états par écran, formats de la section 8.
- Construire d'abord les briques de `components/ui` et `components/saisie`, puis les écrans. Ne pas recréer un bouton ou un champ dans un écran.
- Formulaires : React Hook Form + Zod, une colonne, valeurs par défaut utiles, saisie conservée en cas d'échec, bouton bloqué pendant l'envoi.
- Droits : afficher ou masquer les actions avec `lib/droits.ts`. C'est un confort d'affichage ; la sécurité est dans l'API.
- Tout texte en français, selon le vocabulaire de la charte (section 12). Les messages d'erreur de l'API sont affichés tels quels.
- Tester chaque écran à 768 px de large et avec le rôle Consultant.

### Tests

- Vitest : `formats.ts`, `nombres-en-lettres.ts`, `droits.ts`, champs de saisie de montant et de quantité.
- Playwright, parcours de bout en bout : connexion, vente au comptoir avec règlement, achat en sacs, clôture d'un ordre de fabrication, refus d'action pour un Consultant.

## Ordre de construction conseillé

1. Jetons et police, briques `ui`.
2. Coquille : barre latérale, en-tête de page, version tablette.
3. Proxy, client d'appel, connexion.
4. Composants de saisie : montant, quantité et unité, sélecteur d'article avec stock disponible.
5. États d'écran réutilisables.
6. Les écrans, sprint par sprint.

## Commandes

Depuis `developpement/app`, avec `pnpm` ou, s'il n'est pas installé, `corepack pnpm` (version fixée par `packageManager` dans `package.json`) :

- `install` : dépendances ; copier `.env.example` en `.env.local`
- `dev` : http://localhost:3000 (l'API doit tourner, voir `AGENTS.md` §10)
- `build`, `lint`, `format` (Prettier, classes Tailwind triées), `format:check`
- `typecheck` : génère les types des routes (`next typegen`) puis lance `tsc`
- `test` : Vitest (fichiers `src/**/*.test.ts(x)`, jsdom) ; `test:watch` en continu
- `test:e2e` : Playwright (`e2e/`), profils bureau 1 280 px et tablette 768 px ; en local, utilise le Chrome du poste, lance `next dev` sur le port 3100 et parle à l'API des tests (`docker compose -f developpement/docker-compose.yml up -d api-e2e`, port 8001, base `keitala_e2e_db`) : la base de développement n'est jamais touchée

## Briques d'interface (S0-11)

- Jetons de la charte dans `src/app/globals.css` ; seules ces couleurs existent dans Tailwind (D-024). Catalogue visuel en développement : http://localhost:3000/composants.
- `components/ui` : `Button` (`principal`, `secondaire`, `discret`, `danger` ; `enCours` bloque et affiche « Enregistrement… »), `Input`, `Label`, `Champ` (libellé, « (facultatif) », aide, erreur reliés au contrôle), `Select`, `Table` (`numerique` aligne à droite), `Badge` (`succes`, `attention`, `danger`, `info`, `neutre`), `Dialog`, `Toaster`. Notifications : `notifier.succes(...)` / `notifier.erreur(...)` (`lib/notifications.ts`).
- Ajouter un composant : `corepack pnpm dlx shadcn@4.23.0 add <nom>`, puis remplacer ses classes par les jetons et importer `cn` depuis `@/lib/utils`.

## Coquille et appels à l'API (S0-12, S0-13)

- Écrans dans `src/app/(erp)/<module>/page.tsx`, enveloppés par `<Page titre description action largeur>` (`components/coquille/page.tsx`). Entrées de menu : `lib/navigation.ts` (le rôle sera branché au Sprint 1).
- Proxy : `src/app/api/[...chemin]/route.ts` → `lib/serveur/proxy-api.ts`, relaie vers `API_URL/api/v1/...`. En développement, `API_URL` vaut `http://localhost:8000` par défaut ; en production elle est obligatoire. Le jeton sera lu dans le cookie `keitala_acces` (Sprint 1).
- Navigateur : `appelerApi<T>(chemin, { methode, corps, parametres })` (`lib/api.ts`) lève une `ErreurApi` dont le `message` s'affiche tel quel. TanStack Query est posé dans `components/fournisseurs.tsx` : pas de nouvel essai automatique d'une écriture.

## Formats, saisie et états d'écran (S0-14, S0-15)

- `lib/formats.ts` : `formaterMontant`, `formaterMontantSeul`, `formaterQuantite(valeur, unite)`, `formaterConversion`, `formaterPourcentage`, `formaterDate`, `formaterDateRelative`, `formaterDateHeure`, `formaterTelephone`. Ils prennent les chaînes décimales de l'API telles quelles : ne jamais les convertir en `Number` pour calculer.
- `components/saisie/champ-montant.tsx` : `<ChampMontant value onChange />`, valeur en chiffres seuls (`"2030000"`) ; avec React Hook Form, passer par `Controller`.
- `components/etats/` : `EtatRequete` (chargement, erreur, vide, données à partir d'une requête TanStack Query), `EtatVide`, `EtatErreur`, squelettes `SqueletteTableau`, `SqueletteChiffresCles`, `SqueletteFormulaire`. Tout écran de données passe par `EtatRequete`.

## Session et droits (Sprint 1)

- Connexion : `src/app/connexion/` → `POST /api/auth/connexion`, qui pose les cookies `keitala_acces` et `keitala_rafraichissement` (HttpOnly). Déconnexion : `POST /api/auth/deconnexion`.
- Le proxy `/api/*` refuse `auth/login` et `auth/refresh` (ils renverraient les jetons au navigateur) et renouvelle la session tout seul (cookie d'accès expiré, ou 401 puis nouvel essai).
- `src/proxy.ts` (ex-middleware) : sans cookie de session, toute page renvoie à `/connexion?suite=…`. Une session refusée par l'API renvoie aussi à la connexion (`components/fournisseurs.tsx`).
- Côté écran : `useSession()`, `usePeut(action)` (`lib/session.ts`) et `peut(role, action)` (`lib/droits.ts`). Toute action d'écriture se cache derrière `usePeut("ecrire")` : le Consultant ne voit aucun bouton d'action.
- Panneau latéral (`components/ui/panneau.tsx`) et pagination (`components/ui/pagination.tsx`), page gardée dans l'adresse.
- Parcours e2e : sur la pile complète (API lancée, comptes créés par `python -m app.commandes.comptes_e2e`) ; `connecter(page, "CONSULTANT")` dans `e2e/outils.ts`.

## Référentiels (Sprint 2)

- Écrans : `/tresorerie` (cartes des comptes ; ajout, modification et solde d'ouverture pour le Super Admin), `/stocks` (catalogue par famille, fiche article et unités de saisie), `/tiers` (clients et fournisseurs, hors menu, liens depuis Ventes et Achats).
- Saisie : `ChampQuantite` (quantité + unité, conversion « 3 Sacs 50 kg = 150 kg », stock disponible et dépassement) et `quantiteEnBase()` ; branché sur les lignes d'achat (Sprint 4), à brancher sur les lignes de vente (Sprint 5).
- Calcul : `lib/decimal.ts` (`multiplierDecimaux`, `estInferieur`, `enSaisie`), jamais `Number()` sur un montant ou une quantité ; `lib/nombres-en-lettres.ts` (`montantEnLettres`) pour les confirmations.
- Listes : `useParametresAdresse()` (filtres, recherche et page dans l'adresse), `Onglets`, `ChampRecherche` (attente de 250 ms) ; erreurs de l'API sous le bon champ avec `appliquerErreurApi()`.
- Droits : `usePeut("parametrer")` pour ce que la matrice réserve au Super Admin (comptes, dérogations). La session n'est exposée qu'après l'hydratation (`lib/session.ts`) : sans cela, un bouton réservé apparaissait côté navigateur et pas dans le HTML du serveur.

## Stocks (Sprint 3)

- `/stocks` (état valorisé, filtre « Sous le seuil », fiche article avec perte), `/stocks/mouvements` (journal filtrable), `/stocks/inventaires` et `/stocks/inventaires/[id]` (comptage et validation). Sous-navigation : `SousNavigationStocks`.
- Droit `saisir_stock` (Gestionnaire seul : inventaires et pertes, matrice des droits).
- Calcul : `soustraireDecimaux` (écarts) et `lib/recherche.simplifier` (filtre local insensible aux accents).
- Page à adresse variable (`[id]`) : lire `params` dans un composant enfant sous `<Suspense>`, sinon le build échoue (Cache Components). La navigation de la coquille lit `usePathname()` sous `<Suspense>` pour la même raison.
- Parcours e2e en local : 4 en parallèle et 60 s par parcours (`playwright.config.ts`) ; au-delà, les premières compilations de `next dev` saturent. Ne pas lancer `next build` pendant que `next dev` tourne (dossier `.next` partagé).

## Achats (Sprint 4)

- `/achats` (onglets Tous / À payer, recherche, période ; fiche dans le panneau via `?achat=<id>`, avec paiement de la dette et annulation) et `/achats/nouveau` (`components/achats/formulaire-achat.tsx`). Modèle pour la saisie des ventes.
- `ChampChoix` (`components/ui/champ-choix.tsx`) : recherche avec suggestions (clavier, 250 ms), pour choisir un article ou un tiers. Changer sa `key` pour le remettre à vide.
- Pièce : clé `crypto.randomUUID()` créée à l'ouverture du formulaire et gardée dans le brouillon (`localStorage`, lu après l'hydratation) : un nouvel essai après une coupure ne crée pas de doublon (P-009). Confirmation en lettres au-delà de `SEUIL_CONFIRMATION_FCFA` (`lib/seuils.ts`).
- Droit `saisir_achat` (Gestionnaire seul). Calcul : `additionnerDecimaux`.
- `Button` est `type="button"` par défaut : le bouton d'envoi d'un formulaire déclare `type="submit"` (P-020). `ChampMontant` : `className` règle la largeur de l'ensemble.

## Ventes (Sprint 5)

- `/ventes` (onglets Toutes, À encaisser, Dons ; fiche via `?vente=<id>`), `/ventes/nouvelle` (vente ou don, case « Don / échantillon »), `/ventes/[id]/facture` (A4 imprimable, groupe `(impression)` sans coquille ; `print:hidden` pour les boutons).
- Blocs communs aux pièces dans `components/pieces/` : `LignesArticles` (`sortie` : stock disponible et prix catalogue ; `sansPrix` : don), `BlocPaiements` (`flux` : décaissement ou encaissement), `Recapitulatif`, `ConfirmationMontant`, `ReglementUlterieur`, `AnnulationPiece`, `saisie.ts` (brouillon, montants, `messageEchec`). Les écrans d'achat et de vente ne font que les assembler.
- Droit `saisir_vente` (Gestionnaire seul). En-tête des factures : `GET /api/entreprise`.

## Next.js 16 : à savoir

- Version récente : lire le guide utile dans `node_modules/next/dist/docs/` avant d'écrire du code (rappel dans `AGENTS.md` de ce dossier, recréé par `next dev`).
- **Cache Components** est activé (`next.config.ts`). Rien n'est mis en cache sans directive `use cache` : ne jamais en poser sur des données métier ou propres à un utilisateur sans décision notée dans `DECISIONS.md`.
- `LayoutProps` et `PageProps` sont des types globaux générés par Next.
