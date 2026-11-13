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

## C. Risques à surveiller

| Risque | Effet | Parade |
| :--- | :--- | :--- |
| Connexion instable à l'atelier | Saisies perdues ou doublées, rejet de l'outil | Règles de la charte (saisie conservée, bouton bloqué, message clair) ; voir P-009 |
| Un seul Gestionnaire fait tout | Erreurs de frappe non relevées | Récapitulatif avant validation, confirmation des gros montants, contrôle a posteriori |
| Recettes et rendements variables | Stocks de vrac faux | Consommations réelles saisies à la clôture, inventaires réguliers |
| Plusieurs agents, plusieurs outils | Code incohérent, travail refait | `AGENTS.md`, journal de session obligatoire, registre des décisions |
| Sauvegardes sur le seul VPS | Perte totale des données | Copie quotidienne hors serveur et essai de restauration (S9-1, S9-2) |
