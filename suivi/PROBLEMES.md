# Problèmes, questions ouvertes et risques — ERP Keitala

Tout ce qui bloque, inquiète ou reste à trancher. Un agent qui rencontre un doute l'écrit ici plutôt que de deviner.

**Statuts** : `Ouvert` · `En cours` · `Résolu` (garder l'entrée, ajouter la résolution et la date) · `Abandonné`
**Gravité** : `Bloquant` (empêche d'avancer) · `Majeur` · `Mineur`

**Modèle d'entrée**

```
## P-0XX — Titre court
- **Date** : JJ/MM/AAAA · **Statut** : Ouvert · **Gravité** : Majeur · **Signalé par** : nom
- **Constat** : ce qui ne va pas ou ce qu'on ne sait pas.
- **Impact** : ce que cela bloque (story, sprint).
- **Piste** : proposition ou question précise à poser.
- **Résolution** : (à remplir à la clôture, avec la date)
```

---

## A. Questions pour l'utilisateur ou le client

## P-001 — Seuils d'alerte des matières premières à confirmer
- **Date** : 13/11/2026 · **Statut** : Ouvert · **Gravité** : Mineur · **Signalé par** : Claude
- **Constat** : l'Excel donnait deux seuils par produit (ex. soja consommation : 50 kg et 5 sacs, soit 250 kg). Le schéma reprend le seuil « sac » converti en kg.
- **Impact** : alertes de stock (US-STK-03).
- **Piste** : faire confirmer le seuil de chaque matière par le client.

## P-002 — Catalogue incomplet
- **Date** : 13/11/2026 · **Statut** : Ouvert · **Gravité** : Majeur · **Signalé par** : Claude
- **Constat** : l'Excel ne liste ni les semi-finis en vrac, ni les emballages, ni certaines matières (fonio brut, arachide, bicarbonate, potasse). Les prix de vente des produits finis sont vides.
- **Impact** : Sprint 7 (production) et mise en service (S9-4). Ne bloque pas le développement.
- **Piste** : obtenir du client la liste des emballages par contenance, des produits en vrac et la grille de prix.

## P-003 — Recettes non documentées
- **Date** : 13/11/2026 · **Statut** : Ouvert · **Gravité** : Majeur · **Signalé par** : Claude
- **Constat** : les feuilles `Recettes_Conditionnement` et `Conditionnement` sont vides. Les quantités de la feuille `Production` sont irrégulières (« demi » potasse, « 5 » bicarbonate sans unité).
- **Impact** : US-PROD-01, mise en service.
- **Piste** : relever avec l'atelier une recette type par produit, avec unités.

## P-004 — Soldes d'ouverture et inventaire de départ
- **Date** : 13/11/2026 · **Statut** : Ouvert · **Gravité** : Majeur · **Signalé par** : Claude
- **Constat** : il faut, le jour du démarrage, un inventaire physique et le solde réel de chaque compte (caisse, banque, Orange Money, Mobicash, Wave), ainsi que les créances et dettes en cours.
- **Impact** : S9-5.
- **Piste** : prévoir la date de bascule avec le client ; décider comment saisir les créances et dettes antérieures.

## P-005 — Seuil de confirmation des montants élevés
- **Date** : 13/11/2026 · **Statut** : Ouvert · **Gravité** : Mineur · **Signalé par** : Claude
- **Constat** : le montant à partir duquel l'interface demande une confirmation en toutes lettres n'est pas fixé.
- **Impact** : US-TRES-02, saisie des achats et des règlements.
- **Piste** : proposer 1 000 000 FCFA par défaut, paramétrable ; à confirmer.

## P-006 — Contenu de la facture
- **Date** : 13/11/2026 · **Statut** : Ouvert · **Gravité** : Mineur · **Signalé par** : Claude
- **Constat** : logo, raison sociale, adresse, téléphone, numéros d'identification et mentions à faire figurer sur la facture ne sont pas fournis. Format d'impression non précisé (A4, ticket).
- **Impact** : US-VTE-03.
- **Piste** : demander un modèle de facture actuel au client.

## P-007 — Domaine et serveur
- **Date** : 13/11/2026 · **Statut** : Ouvert · **Gravité** : Mineur · **Signalé par** : Claude
- **Constat** : nom de domaine, fournisseur du VPS et emplacement des sauvegardes hors serveur non choisis.
- **Impact** : Sprint 9.

## P-008 — `Note.txt` n'est plus à jour
- **Date** : 13/11/2026 · **Statut** : Ouvert · **Gravité** : Mineur · **Signalé par** : Claude
- **Constat** : la note décrit encore le Mobile Money comme « un type qu'il saisit lui-même », remplacé par la décision D-005.
- **Piste** : l'utilisateur met la note à jour ou la supprime. Les agents ne la modifient pas.

## B. Points techniques à trancher

## P-009 — Protection contre le double enregistrement
- **Date** : 13/11/2026 · **Statut** : Ouvert · **Gravité** : Majeur · **Signalé par** : Claude
- **Constat** : avec une connexion instable, une vente peut être envoyée deux fois (réponse perdue, nouvel essai). Le schéma v1.1 ne prévoit pas de clé d'idempotence.
- **Impact** : toutes les créations de pièces, à partir du Sprint 4.
- **Piste** : identifiant de requête généré par le formulaire et stocké avec unicité sur la pièce (migration à ajouter), ou table dédiée. À décider au plus tard au début du Sprint 4, avec entrée dans `DECISIONS.md`.

## P-010 — Annulation d'un achat dont le stock a déjà bougé
- **Date** : 13/11/2026 · **Statut** : Ouvert · **Gravité** : Mineur · **Signalé par** : Claude
- **Constat** : annuler un achat ancien modifie le PUMP après coup. La règle de recalcul n'est pas écrite.
- **Impact** : US-ACH-04.
- **Piste** : contre-passer au coût d'entrée d'origine et recalculer le PUMP sur le stock restant ; refuser si le stock deviendrait négatif.

## P-011 — Diagrammes Mermaid non vérifiés à l'affichage
- **Date** : 13/11/2026 · **Statut** : Ouvert · **Gravité** : Mineur · **Signalé par** : Claude
- **Constat** : les diagrammes des documents v1.1 ont été modifiés sans contrôle de rendu.
- **Piste** : les ouvrir dans un visualiseur Markdown et corriger au besoin.

## P-012 — Python 3.12 bloqué sur le poste Windows
- **Date** : 13/11/2026 · **Statut** : Ouvert · **Gravité** : Mineur · **Signalé par** : Claude
- **Constat** : `uv sync` télécharge CPython 3.12, mais Windows refuse de l'exécuter (« Une stratégie de contrôle d'application a bloqué ce fichier », erreur 4551, vraisemblablement Smart App Control). Le Python installé sur le poste est en 3.14, hors de la stack.
- **Impact** : aucune commande `uv run` ne fonctionne hors conteneur ; l'éditeur ne trouve pas l'environnement pour l'autocomplétion.
- **Piste** : contournement en place (D-023, tout dans le conteneur). Pour travailler aussi en local : autoriser l'interpréteur dans la sécurité Windows, ou installer Python 3.12 depuis python.org puis `uv sync --frozen`.

## P-013 — Rendu de l'app non contrôlé à l'écran
- **Date** : 13/11/2026 · **Statut** : Résolu · **Gravité** : Mineur · **Signalé par** : Claude
- **Constat** : pendant S0-11 à S0-13, la capture d'écran par Chrome a échoué (onglet sans réponse, fenêtre peut-être réduite). Les composants, la coquille et le tiroir ne sont vérifiés que par le build, les classes générées et le HTML servi, pas à l'œil.
- **Impact** : défauts visuels possibles (espacements, tiroir sous 1 024 px, cibles de 44 px).
- **Piste** : ouvrir http://localhost:3000/composants et http://localhost:3000/stocks à 1 280 px puis à 768 px ; essayer le tiroir, la fenêtre, les notifications, le repli de la barre latérale et le clavier (Tab, Échap).
- **Résolution** (13/11/2026) : contrôlé dans Chrome. Bureau (1 456 px) : catalogue, coquille, fenêtre (Échap ferme), notification d'erreur. 768 px (via un cadre de 768 px, la fenêtre étant maximisée) : barre du haut « Menu », tiroir, cibles et champs de 44 px, texte 16 px. Conforme à la charte. Non vu : repli de la barre latérale sur bureau, parcours complet au clavier.

## P-014 — Intégration continue jamais exécutée sur GitHub
- **Date** : 13/11/2026 · **Statut** : Ouvert · **Gravité** : Mineur · **Signalé par** : Claude
- **Constat** : le dépôt n'a pas de dépôt distant. Le workflow `.github/workflows/ci.yml` a été validé (YAML lu, étapes rejouées à l'identique en local : API dans le conteneur sur une base vide, app sur le poste), mais jamais lancé sur GitHub Actions. Non vérifié en conditions réelles : installation de Python 3.12 par uv, service PostgreSQL, installation de Chromium par Playwright, versions des actions (`checkout@v4`, `setup-uv@v6`, `pnpm/action-setup@v4`, `setup-node@v4`, `upload-artifact@v4`). L'outil `actionlint` n'a pas pu être lancé (téléchargement de son image refusé).
- **Impact** : S0-17 non prouvé tant qu'aucun push n'a eu lieu.
- **Piste** : créer le dépôt GitHub (décision de l'utilisateur), pousser, lire le résultat du premier passage et corriger.

## P-015 — Pas de limitation des tentatives de connexion
- **Date** : 13/11/2026 · **Statut** : Ouvert · **Gravité** : Majeur · **Signalé par** : Claude
- **Constat** : `/api/v1/auth/login` accepte un nombre illimité d'essais, et les mots de passe ne demandent que 8 caractères.
- **Impact** : mot de passe devinable par essais répétés une fois l'application en ligne.
- **Piste** : limiter dans Nginx (`limit_req` sur `/api/v1/auth/login`) au Sprint 9 (S9-1), ou compteur d'échecs par email côté API (nouvelle migration). À trancher avant la mise en production.

## P-016 — Les parcours e2e laissent des comptes dans la base de développement
- **Date** : 13/11/2026 · **Statut** : Ouvert · **Gravité** : Majeur · **Signalé par** : Claude
- **Constat** : chaque passage de Playwright crée des comptes (`e2e-…@keitala.ml`, adresses uniques), et depuis le Sprint 3 des articles « Attiéké vrac … » avec leur stock et des inventaires validés, qu'on ne peut que désactiver. En CI la base est neuve ; en local, la liste des utilisateurs s'allonge.
- **Piste** : base dédiée aux parcours e2e (ex. `keitala_e2e_db`, API lancée dessus), à mettre en place avec les parcours métier.
- **Mise à jour 14/11/2026** : depuis le Sprint 2, les parcours ajoutent aussi des comptes de trésorerie (« Banque test … »), des articles (`E2E-…`) et des clients (« Boutique Diarra … ») à la base de développement. Gravité relevée à Majeur : la base de développement doit être nettoyée (ou recréée) avant toute démonstration au client.

## P-017 — Corriger un solde d'ouverture saisi par erreur
- **Date** : 14/11/2026 · **Statut** : Ouvert · **Gravité** : Mineur · **Signalé par** : Claude
- **Constat** : le solde d'ouverture se saisit une fois et le journal est immuable (règle 4). Une faute de frappe (malgré la confirmation en toutes lettres) ne peut pas être corrigée par l'écran.
- **Impact** : mise en service (S9-5).
- **Piste** : écriture de correction (`ANNULATION` puis nouveau `SOLDE_INITIAL`, ou `ECART_CLOTURE` à la première clôture de caisse, US-TRES-04), réservée au Super Admin. À décider avec le Sprint 6.

## P-018 — Abandonner un inventaire ouvert par erreur
- **Date** : 14/11/2026 · **Statut** : Ouvert · **Gravité** : Mineur · **Signalé par** : Claude
- **Constat** : un inventaire en cours ne peut que se valider (statuts `EN_COURS` et `VALIDE` seulement). Ouvert par erreur, il bloque l'ouverture d'un autre ; le valider sans écart ne change aucun stock mais laisse une pièce.
- **Piste** : accepter la validation sans écart comme « abandon » (aucun mouvement écrit), ou ajouter un statut `ANNULE` (migration). À décider avec l'utilisateur.

## C. Risques à surveiller

| Risque | Effet | Parade |
| :--- | :--- | :--- |
| Connexion instable à l'atelier | Saisies perdues ou doublées, rejet de l'outil | Règles de la charte (saisie conservée, bouton bloqué, message clair) ; voir P-009 |
| Un seul Gestionnaire fait tout | Erreurs de frappe non relevées | Récapitulatif avant validation, confirmation des gros montants, contrôle a posteriori |
| Recettes et rendements variables | Stocks de vrac faux | Consommations réelles saisies à la clôture, inventaires réguliers |
| Plusieurs agents, plusieurs outils | Code incohérent, travail refait | `AGENTS.md`, journal de session obligatoire, registre des décisions |
| Sauvegardes sur le seul VPS | Perte totale des données | Copie quotidienne hors serveur et essai de restauration (S9-1, S9-2) |
