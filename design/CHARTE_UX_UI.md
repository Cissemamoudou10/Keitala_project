# Charte UX / UI — ERP Keitala

Design **minimaliste, inspiré de Notion** : une page blanche calme, des gris chauds, des bordures fines, beaucoup d'espace et une seule couleur d'accent. L'interface s'efface devant le contenu.

Cette charte s'impose à tout écran. Si un besoin n'y est pas couvert, choisir la solution la plus sobre et la noter dans `suivi/DECISIONS.md`.

---

## 1. Pour qui l'on conçoit

| Utilisateur | Situation | Ce qu'il lui faut |
| :--- | :--- | :--- |
| **Gestionnaire** | Seul à tout saisir, toute la journée : ventes au comptoir, réceptions, production, dépenses. PC au bureau, tablette au magasin ou à l'atelier, mains parfois occupées, client qui attend. Peu technique. | Aller vite, ne pas se tromper, ne jamais perdre une saisie. |
| **Super Admin** | La directrice. Regarde les chiffres, contrôle après coup, souvent sur téléphone. | Comprendre en un coup d'œil ; repérer l'anomalie. |
| **Consultant** | Associé ou auditeur, vient rarement. | Trouver une information sans rien pouvoir casser. |

L'outil remplace un classeur Excel. Il doit être **plus simple qu'Excel**, pas plus riche.

---

## 2. Les dix principes

1. **Trois gestes pour la tâche courante.** Vendre au comptoir : chercher l'article, saisir la quantité, encaisser. Tout ce qui est rare passe au second plan.
2. **Une action principale par écran.** Un seul bouton plein. Les autres actions sont discrètes ou rangées dans un menu « ··· ».
3. **Montrer la conséquence avant de valider.** Conversion (« 3 sacs = 150 kg »), stock après l'opération, solde du compte après, reste à payer. L'utilisateur valide ce qu'il voit, pas ce qu'il croit.
4. **Prévenir l'erreur plutôt que la signaler.** Montant formaté pendant la frappe, stock disponible affiché à côté de la quantité, choix impossibles désactivés avec leur raison.
5. **Ne jamais perdre une saisie.** Si l'envoi échoue, le formulaire reste rempli. Un formulaire long en cours survit à un rechargement de la page.
6. **Répondre tout de suite.** Chaque clic produit un retour visible en moins d'un dixième de seconde : état pressé, indicateur d'envoi, squelette de chargement.
7. **Parler comme l'atelier.** « Sortie de production », « Reste à payer », « Sac de 50 kg ». Jamais de terme technique, de code d'erreur ou d'anglais.
8. **N'afficher que l'exception.** Pas de pastille verte « OK » sur chaque ligne. La couleur signale ce qui demande une attention : stock bas, impayé, écart de caisse.
9. **Même interface pour tous les rôles.** Le Consultant voit les mêmes écrans, sans les boutons d'action. Aucun bouton grisé sans explication.
10. **Rien de décoratif.** Pas d'ombre, de dégradé, d'illustration ni d'animation qui ne serve pas la compréhension.

---

## 3. Couleurs

Thème clair uniquement pour la première version.

### Neutres

| Jeton | Valeur | Usage |
| :--- | :--- | :--- |
| `--fond` | `#FFFFFF` | Fond de page et des cartes |
| `--fond-doux` | `#F7F7F5` | Barre latérale, en-tête de tableau, zones secondaires |
| `--fond-survol` | `#F1F1EF` | Survol d'une ligne, d'un élément de menu |
| `--fond-actif` | `#E9E9E7` | Élément sélectionné, bouton pressé |
| `--bordure` | `#E9E9E7` | Séparateurs, contours de cartes et de tableaux |
| `--bordure-forte` | `#D3D2CE` | Contours des champs de saisie |
| `--texte` | `#37352F` | Texte principal |
| `--texte-2` | `#6B6A66` | Libellés, texte secondaire |
| `--texte-3` | `#8E8D89` | Texte indicatif dans un champ vide, élément désactivé. Jamais pour une information à lire. |

### Accent

| Jeton | Valeur | Usage |
| :--- | :--- | :--- |
| `--accent` | `#2076CC` | Bouton principal, liens, contour de focus, élément actif |
| `--accent-survol` | `#1A63AD` | Survol du bouton principal |
| `--accent-doux` | `#E7F3F8` | Fond d'une sélection, d'une information |

Une seule couleur d'accent. Elle ne sert ni à décorer ni à signaler un état.

### États (étiquettes et messages)

Chaque état associe un texte foncé à un fond pastel. Tous les couples dépassent un contraste de 4,5:1.

| État | Texte | Fond | Usage |
| :--- | :--- | :--- | :--- |
| Succès | `#2F6B4F` | `#EDF3EC` | Payé, Terminé, Contrôlé |
| Attention | `#8A5A00` | `#FBF3DB` | Paiement partiel, stock proche du seuil, à contrôler |
| Danger | `#B3261E` | `#FDEBEC` | Stock bas, impayé, écart de caisse, erreur |
| Information | `#1F5F85` | `#E7F3F8` | En cours |
| Neutre | `#5F5E5B` | `#F1F1EF` | Brouillon, Annulé, Don |

Bouton d'action irréversible (annuler une pièce) : fond `#C4372F`, texte blanc.

La couleur ne porte jamais seule une information : elle accompagne toujours un mot ou une icône.

---

## 4. Typographie

- **Police** : Inter, avec repli `system-ui, -apple-system, "Segoe UI", sans-serif`.
- **Chiffres** : `font-variant-numeric: tabular-nums` partout où des nombres s'alignent (tableaux, montants, quantités).

| Rôle | Taille / interligne | Graisse |
| :--- | :--- | :--- |
| Titre de page | 28 px / 36 px | 600 |
| Titre de section | 18 px / 26 px | 600 |
| Titre de carte, libellé fort | 14 px / 20 px | 600 |
| Texte courant, tableaux | 14 px / 20 px | 400 |
| Libellé de champ, légende | 13 px / 18 px | 500 |
| Petite mention | 12 px / 16 px | 400 |
| Chiffre clé (tableau de bord) | 24 px / 32 px | 600 |

- Texte des champs de saisie : **16 px** sur tablette et téléphone (évite le zoom automatique).
- Pas de capitales pour les titres ni les boutons. Pas d'italique. Le gras est réservé aux titres et aux chiffres clés.

---

## 5. Espace, formes, mouvement

- **Grille de 4 px.** Espacements : 4, 8, 12, 16, 24, 32, 48.
- **Respiration** : 24 px entre deux blocs, 32 à 48 px autour du contenu de la page. En cas de doute, ajouter de l'espace plutôt qu'un trait.
- **Rayons** : 4 px (boutons, champs, étiquettes), 6 px (cartes, menus), 8 px (fenêtres).
- **Bordures** : 1 px `--bordure`. Les cartes n'ont pas d'ombre.
- **Ombre** : une seule, pour ce qui flotte (menus, fenêtres, notifications) : `0 0 0 1px rgba(15,15,15,0.04), 0 4px 12px rgba(15,15,15,0.10)`.
- **Icônes** : Lucide, 16 px dans le texte et 18 px dans la navigation, trait de 1,5 px, couleur `--texte-2`. Jamais d'icône seule sans libellé ni infobulle.
- **Mouvement** : 120 à 150 ms, `ease-out`, pour les survols, menus et fenêtres. Aucune animation décorative. Respecter `prefers-reduced-motion`.

---

## 6. Mise en page

```
┌────────────┬───────────────────────────────────────────────┐
│ Keitala    │  Ventes                    [ Nouvelle vente ] │  ← titre + 1 action
│            │  ───────────────────────────────────────────  │
│ Tableau    │  Filtres discrets · Recherche                 │
│ Stocks     │                                               │
│ Achats     │  Tableau ou formulaire                        │
│ Ventes     │                                               │
│ Production │                                               │
│ Trésorerie │                                               │
│            │                                               │
│ ⌕ Chercher │                                               │
│ Compte     │                                               │
└────────────┴───────────────────────────────────────────────┘
```

- **Barre latérale** : 240 px, fond `--fond-doux`, repliable. Six entrées au plus, plus « Administration » pour le Super Admin. Élément actif : fond `--fond-actif`, texte `--texte`.
- **Contenu** : largeur maximale de 1 200 px pour les tableaux, 720 px pour les formulaires, aligné à gauche.
- **En-tête de page** : titre, puis une ligne de description facultative, et l'action principale à droite.
- **Détail d'une pièce** : s'ouvre dans un **panneau latéral à droite** (560 px) sans quitter la liste ; un lien permet de l'ouvrir en pleine page.
- **Recherche globale** : `Ctrl + K` ouvre une palette pour trouver un article, un client, une facture, ou lancer une action (« Nouvelle vente »).

### Tailles d'écran

| Largeur | Comportement |
| :--- | :--- |
| ≥ 1 024 px (bureau) | Barre latérale visible, tableaux complets |
| 768 à 1 023 px (tablette) | Barre latérale en tiroir, tableaux allégés (colonnes secondaires masquées), cibles tactiles de 44 px |
| < 768 px (téléphone) | Consultation en priorité : tableau de bord, stocks, soldes. Les listes deviennent des cartes empilées. |

---

## 7. Composants

### Boutons
- **Principal** : fond `--accent`, texte blanc. Un seul par écran.
- **Secondaire** : fond blanc, bordure `--bordure-forte`, texte `--texte`.
- **Discret** : sans fond ni bordure, fond `--fond-survol` au survol. Pour les actions de ligne et de barre d'outils.
- **Danger** : uniquement dans la fenêtre de confirmation d'une annulation.
- Hauteur 32 px sur bureau, 44 px sur tablette. Libellé : un verbe et son objet (« Enregistrer la vente », pas « OK » ni « Valider »).
- Pendant l'envoi : bouton désactivé, libellé « Enregistrement… ».

### Champs
- Libellé toujours visible au-dessus du champ. Le texte indicatif ne remplace jamais le libellé.
- Hauteur 36 px sur bureau, 44 px sur tablette. Bordure `--bordure-forte` ; au focus, contour de 2 px `--accent`.
- Erreur : message sous le champ, en `Danger`, qui dit comment corriger.
- Champs obligatoires par défaut ; on marque « (facultatif) » ceux qui ne le sont pas.
- Clavier numérique sur tablette pour les quantités et les montants (`inputmode="decimal"` ou `"numeric"`).

### Sélecteur avec recherche
- Pour les articles, clients, fournisseurs. Recherche sur le nom **et** le code, tolérante aux accents.
- Chaque ligne d'article montre : nom, contenance, **stock disponible** et unité.
- Les éléments récents ou fréquents apparaissent avant toute frappe.

### Tableaux
- Pas de zébrage, pas de bordures verticales. Séparateur horizontal `--bordure`. Survol `--fond-survol`.
- En-tête : 13 px, `--texte-2`, fond `--fond-doux`, fixe au défilement.
- Lignes de 40 px sur bureau, 52 px sur tablette. Nombres alignés à droite, texte à gauche.
- Toute la ligne est cliquable et ouvre le détail. Actions de ligne dans un menu « ··· ».
- 50 lignes par page, pagination côté serveur. Tri et filtres conservés dans l'adresse de la page.

### Étiquettes d'état
- Petite pastille : texte 12 px, graisse 500, rayon 4 px, couleurs de la section 3.

| Objet | États affichés |
| :--- | :--- |
| Vente, achat | Payé (succès) · Partiel (attention) · À crédit (danger) · Annulé (neutre, numéro barré) · Don (neutre) |
| Ordre de fabrication | Brouillon (neutre) · En cours (information) · Terminé (succès) · Annulé (neutre) |
| Stock | Rien si le stock est normal · Stock bas (danger) |
| Contrôle | À contrôler (attention) · Contrôlé (succès) |

### Fenêtres, panneaux, notifications
- **Fenêtre de confirmation** : seulement pour l'irréversible (annulation) et les montants élevés. Jamais pour un enregistrement ordinaire.
- **Notification** : en bas à droite, 4 secondes, une phrase (« Vente FAC-2026-0042 enregistrée »), avec un lien vers la pièce. Les erreurs restent affichées jusqu'à fermeture.
- **Bandeau** en haut de page pour un état global : « Connexion perdue. Vos saisies sont conservées. »

### Les quatre états d'un écran
Tout écran de données en prévoit quatre, dès sa première version :
1. **Chargement** : squelette de la forme du contenu, jamais de page blanche ni de roue seule au centre.
2. **Vide** : une phrase qui explique et un bouton pour commencer (« Aucune vente aujourd'hui. Nouvelle vente »).
3. **Erreur** : ce qui s'est passé, en clair, et un bouton « Réessayer ».
4. **Données**.

---

## 8. Formats

| Donnée | Format | Exemple |
| :--- | :--- | :--- |
| Montant | Séparateur de milliers par espace insécable, sans décimales, suffixe FCFA | `2 030 000 FCFA` |
| Quantité | Virgule décimale, 3 décimales au plus, zéros inutiles supprimés, unité accolée | `48,26 kg` · `96 sachets` |
| Conversion | Unité saisie puis équivalent en unité de base | `3 sacs = 150 kg` |
| Date | Jour/mois/année | `13/11/2026` |
| Date récente | Relative dans les listes, exacte en infobulle | `Aujourd'hui, 14:32` · `Hier` |
| Téléphone | Indicatif et groupes de deux chiffres | `+223 76 12 34 56` |
| Numéro de pièce | Tel quel, police à chiffres alignés | `FAC-2026-0042` |
| Pourcentage | Une décimale au plus | `74,5 %` |

Les montants négatifs s'écrivent avec le signe moins, pas entre parenthèses. Un écart ou une sortie d'argent s'accompagne d'un mot (« Sortie », « Manque ») et pas seulement d'une couleur.

---

## 9. Saisie de l'argent et des quantités

C'est le cœur du risque : dans l'Excel, 20 030 000 a été saisi à la place de 2 030 000.

- **Formatage pendant la frappe** : `2030000` devient `2 030 000` au fil de la saisie. Le suffixe `FCFA` est affiché dans le champ.
- **Confirmation des montants élevés** : au-dessus du seuil paramétré, une fenêtre affiche le montant **en chiffres et en toutes lettres** (« Deux millions trente mille francs CFA ») avant l'enregistrement.
- **Cohérence visible** : sur une ligne d'achat ou de vente, quantité × prix = total est affiché et se met à jour en direct.
- **Quantité et stock** : à côté du champ, « Disponible : 150 kg ». Si la quantité dépasse, le champ passe en erreur et l'enregistrement est bloqué, avec la quantité maximale indiquée.
- **Choix de l'unité** : bouton à deux positions à côté de la quantité (`kg | Sac 50 kg`), avec la conversion affichée dessous.
- **Règlement** : choix du compte par boutons larges (Caisse, Banque, Orange Money, Mobicash, Wave), montant pré-rempli avec le total, « Reste à payer » mis à jour en direct. Laisser à crédit est un choix explicite, qui exige un client.

---

## 10. Formulaires et parcours

- **Une colonne**, de haut en bas, dans l'ordre où l'on pense. Pas de formulaire sur deux colonnes.
- **Valeurs par défaut utiles** : date du jour, client de passage, compte Caisse, unité habituelle de l'article, prix standard.
- **Clavier** sur bureau : `Tab` suit l'ordre logique, `Entrée` ajoute une ligne, `Ctrl + Entrée` enregistre, `Échap` ferme. Le curseur arrive dans le premier champ utile à l'ouverture.
- **Récapitulatif fixe** en bas ou à droite du formulaire : total, réglé, reste, et le bouton principal toujours visible.
- **Validation** : à la sortie du champ pour le format, à l'enregistrement pour le reste. Le premier champ en erreur reçoit le focus.
- **Après l'enregistrement** : notification, puis retour à un formulaire vierge pour la vente au comptoir (on enchaîne), ou à la liste pour les autres.
- **Quitter un formulaire modifié** demande confirmation.
- **Annuler une pièce** : fenêtre qui rappelle les effets (« Le stock sera remis, le règlement de 45 000 FCFA sera retiré de la Caisse ») et exige un motif.

### Connexion instable
- L'échec d'un envoi garde le formulaire intact et propose « Réessayer ».
- Le bouton d'enregistrement est bloqué pendant l'envoi pour éviter les doublons.
- Si la réponse n'arrive pas, le message est honnête : « Nous ne savons pas si la vente a été enregistrée. Vérifiez la liste des ventes avant de recommencer. »
- Un bandeau signale la perte de connexion et sa reprise.

---

## 11. Écrans clés

- **Tableau de bord** : quatre à six chiffres clés au plus (ventes du jour, soldes par compte, créances, articles sous le seuil, OF en cours), puis les listes courtes « À traiter » : stocks bas, impayés anciens. Un graphique, pas plus : les ventes sur 30 jours, en un seul ton.
- **Vente au comptoir** : recherche d'article en tête avec le curseur dedans, lignes dessous, récapitulatif et règlement à droite (dessous sur tablette). Utilisable entièrement au clavier.
- **Stocks** : onglets par famille, recherche, et un filtre « Sous le seuil ». Colonnes : article, stock, unité, seuil, valeur.
- **Clôture d'un OF** : consommations prévues pré-remplies et modifiables, quantités produites, pertes ; le rendement et le coût de revient s'affichent avant validation.
- **Trésorerie** : une carte par compte avec son solde, puis le journal du compte choisi.
- **À contrôler** (Super Admin) : liste unique des pièces récentes, cochables une à une.

---

## 12. Rédaction

- **Vouvoiement**, phrases courtes, présent. Pas de point d'exclamation, pas de jargon.
- **Boutons** : verbe + objet. « Enregistrer l'achat », « Clôturer l'ordre », « Annuler la vente ».
- **Messages d'erreur** : ce qui s'est passé, puis quoi faire.
  - Bon : « Stock insuffisant : il reste 12 sachets de Gari 200 g. Réduisez la quantité. »
  - Mauvais : « Erreur 409 : contrainte chk_stock_non_negatif ».
- **Vocabulaire fixe** :

| Dire | Ne pas dire |
| :--- | :--- |
| Vente, Achat, Dépense | Transaction, Document, Pièce |
| Règlement, Reste à payer | Paiement partiel non soldé |
| À crédit | Impayé (sauf dans les alertes) |
| Ordre de fabrication | OF (sauf dans un numéro) |
| Sortie de production | Entrée de produit fini |
| Produit en vrac | Semi-fini |
| Annuler | Supprimer |
| Coût moyen | PUMP |

---

## 13. Accessibilité et performance

- Contraste de 4,5:1 au moins pour tout texte à lire.
- Focus toujours visible : contour de 2 px `--accent`, décalé de 2 px.
- Tout est utilisable au clavier ; les fenêtres retiennent le focus et le rendent à la fermeture.
- Champs reliés à leur libellé et à leur message d'erreur ; boutons à icône seule munis d'un nom accessible.
- Cibles tactiles de 44 × 44 px sur tablette et téléphone.
- Premier affichage utile en moins de 2 secondes sur une connexion mobile moyenne ; recherche avec attente de 250 ms après la frappe ; listes paginées.

---

## 14. Jetons pour le code

À placer dans la feuille de styles globale de `developpement/app`, puis à relier au thème Tailwind. Les composants n'utilisent que ces jetons, jamais de couleur écrite en dur.

```css
:root {
  /* Neutres */
  --fond: #FFFFFF;
  --fond-doux: #F7F7F5;
  --fond-survol: #F1F1EF;
  --fond-actif: #E9E9E7;
  --bordure: #E9E9E7;
  --bordure-forte: #D3D2CE;
  --texte: #37352F;
  --texte-2: #6B6A66;
  --texte-3: #8E8D89;

  /* Accent */
  --accent: #2076CC;
  --accent-survol: #1A63AD;
  --accent-doux: #E7F3F8;

  /* États : texte / fond */
  --succes: #2F6B4F;      --succes-fond: #EDF3EC;
  --attention: #8A5A00;   --attention-fond: #FBF3DB;
  --danger: #B3261E;      --danger-fond: #FDEBEC;
  --info: #1F5F85;        --info-fond: #E7F3F8;
  --neutre: #5F5E5B;      --neutre-fond: #F1F1EF;
  --danger-plein: #C4372F;

  /* Formes */
  --rayon-s: 4px;
  --rayon-m: 6px;
  --rayon-l: 8px;
  --ombre-flottant: 0 0 0 1px rgba(15, 15, 15, 0.04), 0 4px 12px rgba(15, 15, 15, 0.10);

  /* Typographie */
  --police: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;

  /* Mouvement */
  --duree: 140ms;
}
```

---

## 15. Liste de contrôle d'un écran

Avant de déclarer un écran terminé :

- [ ] Une seule action principale, libellée par un verbe et son objet
- [ ] Chargement, vide et erreur traités
- [ ] Montants, quantités et dates aux formats de la section 8
- [ ] Conséquence affichée avant validation (conversion, stock, solde, reste)
- [ ] Saisie conservée en cas d'échec ; bouton bloqué pendant l'envoi
- [ ] Parcours complet possible au clavier ; focus visible
- [ ] Essayé à 768 px de large, cibles de 44 px
- [ ] Essayé avec le rôle Consultant : aucune action visible
- [ ] Aucun mot technique ou anglais à l'écran
- [ ] Aucune couleur hors jetons, aucune ombre sur les cartes
