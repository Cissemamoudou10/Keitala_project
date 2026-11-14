# Suivi d'avancement — ERP Keitala

Mis à jour par chaque agent en fin de session. Les identifiants `US-...` renvoient à `product_backlog_erp_keitala.md`.

**Légende** : `[ ]` à faire · `[~]` en cours · `[x]` terminé (définition dans `AGENTS.md`, section 9) · `[!]` bloqué (voir `PROBLEMES.md`)

---

## État actuel

| | |
| :--- | :--- |
| **Dernière mise à jour** | 14/11/2026 |
| **Phase** | Sprints 0 à 4 terminés (US-REF-02 : reste le choix de l'unité sur les lignes de vente, Sprint 5). Prochain : Sprint 5 (ventes). |
| **Sprint en cours** | Sprint 5 — Ventes (à démarrer) |
| **Code existant** | `api` : FastAPI, 24 modèles alignés sur la migration 0001 (= `schema.sql` v1.1), format d'erreur, pagination, `/api/v1/sante`, 20 tests verts. `app` : Next.js 16, jetons de la charte et composants de base (catalogue `/composants` en dev), coquille et pages provisoires des modules, proxy `/api/*` vers FastAPI, client d'appel et TanStack Query, formats et champ de montant, quatre états d'écran ; build, lint et types OK ; rendu vérifié à l'écran (bureau et 768 px) ; 44 tests Vitest, 7 parcours Playwright (bureau et tablette). CI GitHub Actions écrite (`.github/workflows/ci.yml`), rejouée en local, jamais exécutée sur GitHub (P-014). Sprint 1 : connexion par cookies HttpOnly, gestion des comptes, contrôle d'accès par rôle (API 53 tests, app 62 tests, 19 parcours e2e sur la pile complète). Sprint 2 : comptes de trésorerie et soldes d'ouverture, catalogue et unités de saisie, clients et fournisseurs (API 96 tests, app 110 tests, 29 parcours e2e). Sprint 3 : mouvements de stock (écriture unique, coût moyen pondéré), pertes, inventaires et stock de départ valorisé (migration 0002), journal, état valorisé et alertes (API 110 tests, app 116 tests, 36 parcours e2e). Puis abandon d'un inventaire (migration 0003) et base dédiée aux parcours e2e (API 112 tests, 37 parcours e2e). Sprint 4 : achats (saisie en sacs ou en kg, paiements sur plusieurs comptes ou à crédit, dettes, annulation avec contre-passation), clé d'idempotence (migration 0004), solde Caisse et Mobile Money jamais négatif (API 126 tests, app 119 tests, 45 parcours e2e). |
| **Points bloquants** | Aucun. Commandes de l'API à lancer dans le conteneur (P-012). Base de développement remise à neuf le 14/11/2026, avec le premier Super Admin de l'utilisateur (S1-T1). Parcours e2e : `up -d api-e2e` d'abord. |

## Prochaine tâche

**Sprint 5, US-VTE-01 : saisie rapide de vente** (comptoir et gros), puis US-VTE-02 à 06. Reprendre le modèle des achats : `services/achats.py` (clé d'idempotence, verrous pièce puis articles puis comptes, `ecrire_mouvement_stock`, `ecrire_mouvement_tresorerie`, contre-passation) et `components/achats/formulaire-achat.tsx` (lignes avec `ChampChoix` et `ChampQuantite`, ce qui finira US-REF-02 ; paiements ; brouillon). Faire trancher P-019 (montants au centime) avant les ventes. Relire avant : EPIC 6 du backlog, conception technique.

---

## Vue d'ensemble

| Sprint | Contenu | Stories | État |
| :--- | :--- | :---: | :--- |
| 0 | Fondations techniques et socle d'interface | — | Terminé |
| 1 | Authentification, rôles, utilisateurs | 3 | Terminé |
| 2 | Référentiels : tiers, articles, unités, comptes | 4 | Terminé (voir US-REF-02) |
| 3 | Stocks : état, alertes, journal, inventaire, pertes | 5 | Terminé |
| 4 | Achats et dettes fournisseurs | 4 | Terminé |
| 5 | Ventes, règlements, dons, factures | 6 | À faire |
| 6 | Trésorerie, dépenses, transferts, clôtures, contrôle | 5 | À faire |
| 7 | Production : recettes et ordres de fabrication | 4 | À faire |
| 8 | Tableaux de bord, marges, exports | 3 | À faire |
| 9 | Mise en production et démarrage | — | À faire |

L'ordre suit les dépendances : les comptes de trésorerie (Sprint 2) précèdent les règlements (Sprints 4 et 5) ; l'inventaire (Sprint 3) sert à saisir le stock de départ ; la production (Sprint 7) vient après les ventes parce que l'entreprise peut déjà vendre son stock existant.

---

## Sprint 0 — Fondations

**But** : un socle qui démarre, se teste et se déploie, avant toute fonctionnalité.

### Dépôt et outillage
- [x] S0-1 Initialiser Git à la racine, vérifier `.gitignore`, premier commit des spécifications
- [x] S0-2 `developpement/docker-compose.yml` : PostgreSQL 16 pour le développement
- [x] S0-3 Compléter la section « Commandes » de `AGENTS.md` avec les commandes réelles

### API (`developpement/api`)
- [x] S0-4 Initialiser le projet FastAPI selon `developpement/api/README.md` (structure, config, `.env.example`)
- [x] S0-5 Première migration Alembic reproduisant `schema.sql` v1.1 à l'identique (structure, déclencheurs, vues, données initiales)
- [x] S0-6 Modèles SQLAlchemy des 24 tables
- [x] S0-7 Socle de tests sur un vrai PostgreSQL ; tests des contraintes clés (stock négatif, journaux immuables)
- [x] S0-8 Format d'erreur commun, pagination, endpoint `/api/v1/sante`
- [x] S0-9 Lint, formatage, vérification de types

### App (`developpement/app`)
- [x] S0-10 Initialiser le projet Next.js selon `developpement/app/README.md`
- [x] S0-11 Jetons de la charte (`design/CHARTE_UX_UI.md`) dans Tailwind ; police ; composants de base (bouton, champ, sélecteur, tableau, étiquette, fenêtre, notification)
- [x] S0-12 Coquille de l'application : barre latérale, en-tête de page, navigation, version tablette
- [x] S0-13 Proxy `/api/[...path]` vers FastAPI et client d'appel côté app
- [x] S0-14 Utilitaires de format : montant FCFA, quantité, date ; champ de saisie de montant
- [x] S0-15 Les quatre états d'écran réutilisables : chargement, vide, erreur, données
- [x] S0-16 Lint, formatage, vérification de types, socle de tests

### Intégration continue
- [x] S0-17 Vérifications automatiques à chaque push : lint, types, tests (app et api)

---

## Sprint 1 — Authentification et rôles

- [x] US-AUTH-01 Connexion sécurisée (jetons en cookies `HttpOnly` posés par le proxy)
- [x] US-AUTH-02 Gestion des comptes utilisateurs par le Super Admin
- [x] US-AUTH-03 Cloisonnement des droits : 403 côté API, actions masquées côté app
- [x] S1-T1 Commande de création du premier Super Admin
- [x] S1-T2 Écran de connexion et page « accès refusé » conformes à la charte

## Sprint 2 — Référentiels

- [x] US-REF-01 Répertoire des tiers (clients et fournisseurs) avec créance et dette
- [~] US-REF-02 Unité de base et unités de saisie par article — fait : unités par article, conversion ; choix de l'unité sur les lignes d'achat (Sprint 4) ; reste les lignes de vente (Sprint 5)
- [x] US-REF-03 Comptes de trésorerie (Caisse, Banque, Orange Money, Mobicash, Wave) et soldes d'ouverture
- [x] US-STK-01 Catalogue des articles par famille (6 familles)

## Sprint 3 — Stocks

- [x] US-STK-02 État des stocks filtré et valorisé
- [x] US-STK-03 Alertes de réapprovisionnement
- [x] US-STK-05 Journal des mouvements de stock
- [x] US-STK-04 Inventaire physique et régularisation (sert aussi au stock de départ)
- [x] US-STK-06 Sortie pour perte ou avarie

## Sprint 4 — Achats

- [x] US-ACH-01 Enregistrement d'un achat (unités, PUMP, règlements ou crédit)
- [x] US-ACH-02 Historique des achats
- [x] US-ACH-03 Paiement d'une dette fournisseur
- [x] US-ACH-04 Annulation d'un achat

## Sprint 5 — Ventes

- [ ] US-VTE-01 Saisie rapide de vente (comptoir et gros)
- [ ] US-VTE-02 Règlements : caisse, banque, Mobile Money, crédit, paiement mixte
- [ ] US-VTE-03 Facture ou reçu en PDF (envoi WhatsApp : option, à faire en dernier)
- [ ] US-VTE-04 Dons et échantillons
- [ ] US-VTE-05 Encaissement d'une créance client
- [ ] US-VTE-06 Annulation d'une vente

## Sprint 6 — Trésorerie

- [ ] US-TRES-01 Soldes et journaux des comptes
- [ ] US-TRES-02 Dépenses catégorisées, avec confirmation des montants élevés
- [ ] US-TRES-03 Transferts entre comptes
- [ ] US-TRES-04 Clôture journalière de caisse
- [ ] US-TRES-05 Contrôle a posteriori par le Super Admin

## Sprint 7 — Production

- [ ] US-PROD-01 Recettes de transformation et de conditionnement
- [ ] US-PROD-02 Création et lancement d'un ordre de fabrication
- [ ] US-PROD-03 Déclaration des sorties de production
- [ ] US-PROD-04 Clôture d'OF : consommations réelles, pertes, coût de revient

## Sprint 8 — Pilotage

- [ ] US-DASH-01 Tableau de bord
- [ ] US-DASH-02 Rapport des marges par produit
- [ ] US-DASH-03 Exports Excel et PDF

## Sprint 9 — Mise en production

- [ ] S9-1 VPS : Docker Compose, Nginx, certificat, base, sauvegardes quotidiennes hors serveur
- [ ] S9-2 Essai de restauration d'une sauvegarde
- [ ] S9-3 Déploiement Vercel et variables d'environnement serveur
- [ ] S9-4 Catalogue complété avec le client : semi-finis, emballages, additifs, recettes
- [ ] S9-5 Inventaire physique de départ et soldes d'ouverture des comptes
- [ ] S9-6 Recette avec le Gestionnaire sur des cas réels ; corrections
- [ ] S9-7 Guide d'utilisation court et formation

---

## Historique des jalons

| Date | Jalon |
| :--- | :--- |
| 13/11/2026 | Analyse du dossier ; spécifications et schéma corrigés en v1.1 ; schéma validé sur PostgreSQL 16 |
| 13/11/2026 | Mise en place de `AGENTS.md`, des fichiers de suivi, de la charte et de `developpement/` |
| 14/11/2026 | **Sprint 4 terminé** : achats, dettes fournisseurs, annulation |
| 14/11/2026 | **Sprint 3 terminé** : stocks, inventaires, stock de départ valorisé |
| 14/11/2026 | **Sprint 2 terminé** : comptes de trésorerie, catalogue, unités, tiers |
| 13/11/2026 | **Sprint 1 terminé** : connexion, comptes, droits par rôle |
| 13/11/2026 | **Sprint 0 terminé** : outillage de tests de l'app (S0-16) et intégration continue (S0-17) |
| 13/11/2026 | App : formats, champ de montant, quatre états d'écran (S0-14, S0-15) |
| 13/11/2026 | App : charte, composants, coquille et proxy vers l'API (S0-11 à S0-13) |
| 13/11/2026 | Projet Next.js initialisé (S0-10) |
| 13/11/2026 | Socle API terminé (S0-1 à S0-9) : migration 0001 vérifiée identique à `schema.sql`, modèles alignés, tests sur PostgreSQL |
