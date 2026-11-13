# App — ERP Keitala (frontend)

Frontend Next.js et proxy vers l'API. Socle en place : projet (S0-10), charte et composants (S0-11), coquille (S0-12), proxy et client d'appel (S0-13). Restent S0-14 à S0-16 de `suivi/AVANCEMENT.md`.

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
- `build`, `lint`
- `typecheck` : génère les types des routes (`next typegen`) puis lance `tsc`

## Briques d'interface (S0-11)

- Jetons de la charte dans `src/app/globals.css` ; seules ces couleurs existent dans Tailwind (D-024). Catalogue visuel en développement : http://localhost:3000/composants.
- `components/ui` : `Button` (`principal`, `secondaire`, `discret`, `danger` ; `enCours` bloque et affiche « Enregistrement… »), `Input`, `Label`, `Champ` (libellé, « (facultatif) », aide, erreur reliés au contrôle), `Select`, `Table` (`numerique` aligne à droite), `Badge` (`succes`, `attention`, `danger`, `info`, `neutre`), `Dialog`, `Toaster`. Notifications : `notifier.succes(...)` / `notifier.erreur(...)` (`lib/notifications.ts`).
- Ajouter un composant : `corepack pnpm dlx shadcn@4.23.0 add <nom>`, puis remplacer ses classes par les jetons et importer `cn` depuis `@/lib/utils`.

## Coquille et appels à l'API (S0-12, S0-13)

- Écrans dans `src/app/(erp)/<module>/page.tsx`, enveloppés par `<Page titre description action largeur>` (`components/coquille/page.tsx`). Entrées de menu : `lib/navigation.ts` (le rôle sera branché au Sprint 1).
- Proxy : `src/app/api/[...chemin]/route.ts` → `lib/serveur/proxy-api.ts`, relaie vers `API_URL/api/v1/...`. En développement, `API_URL` vaut `http://localhost:8000` par défaut ; en production elle est obligatoire. Le jeton sera lu dans le cookie `keitala_acces` (Sprint 1).
- Navigateur : `appelerApi<T>(chemin, { methode, corps, parametres })` (`lib/api.ts`) lève une `ErreurApi` dont le `message` s'affiche tel quel. TanStack Query est posé dans `components/fournisseurs.tsx` : pas de nouvel essai automatique d'une écriture.

## Next.js 16 : à savoir

- Version récente : lire le guide utile dans `node_modules/next/dist/docs/` avant d'écrire du code (rappel dans `AGENTS.md` de ce dossier, recréé par `next dev`).
- **Cache Components** est activé (`next.config.ts`). Rien n'est mis en cache sans directive `use cache` : ne jamais en poser sur des données métier ou propres à un utilisateur sans décision notée dans `DECISIONS.md`.
- `LayoutProps` et `PageProps` sont des types globaux générés par Next.
