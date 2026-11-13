# ERP KEITALA — Dossier de Conception UML

Ce document présente la modélisation UML demandée pour l'ERP KEITALA, centrée sur les **3 acteurs définis** et les flux opérationnels de l'entreprise.

---

## 1. Rappel des Acteurs du Système

```mermaid
classDiagram
    class Acteur {
        <<abstract>>
    }
    class SuperAdmin {
        +Configuration système
        +Gestion des comptes
        +Audit global
        +Validation clôtures
    }
    class Gestionnaire {
        +Toutes les tâches opérationnelles
        +Achats et Réceptions
        +Stocks et Inventaires
        +Production et Recettes
        +Ventes et Encaissements
        +Dépenses et Caisse/Banque
    }
    class Consultant {
        +Lecture seule stricte
        +Consultation des stocks
        +Consultation trésorerie
        +Visualisation Dashboard
    }

    Acteur <|-- SuperAdmin
    Acteur <|-- Gestionnaire
    Acteur <|-- Consultant
```

* **Super Admin** : Responsable / Gérance disposant de l'intégralité des privilèges, de l'administration des utilisateurs et de la validation stratégique.
* **Gestionnaire** : L'acteur central au quotidien qui réalise **toutes les opérations de saisie et de traitement** (stocks, achats, fabrication, vente comptoir, dépenses, transferts).
* **Consultant** : Observateur (associé, auditeur, contrôleur) disposant d'un droit de consultation étendu mais d'**aucune action modificatrice**.

---

## 2. Diagramme des Cas d'Utilisation (Use Case Diagram)

```mermaid
flowchart LR
    %% Acteurs
    Admin["🧑‍💼 Super Admin"]
    Gest["👷 Gestionnaire<br/>(Opérateur principal)"]
    Cons["👁️ Consultant<br/>(Lecteur seul)"]

    subgraph ERP_KEITALA ["Système ERP KEITALA"]
        
        subgraph Securite ["1. Sécurité & Comptes"]
            UC_Auth(["S'authentifier (JWT)"])
            UC_UserMgmt(["Gérer les utilisateurs & rôles"])
        end

        subgraph Stocks ["2. Gestion des Stocks Multi-Familles"]
            UC_ArtView(["Consulter l'état des stocks & alertes"])
            UC_ArtCreate(["Créer / Modifier un article (5 familles)"])
            UC_Inventaire(["Réaliser un inventaire physique"])
            UC_AuditStock(["Consulter l'historique des mouvements"])
        end

        subgraph Achats ["3. Approvisionnements"]
            UC_AchatCreate(["Enregistrer un achat (MP, semences, intrants, emballages)"])
            UC_AchatView(["Consulter l'historique des achats"])
        end

        subgraph Production ["4. Atelier de Transformation"]
            UC_Recette(["Gérer les fiches recettes (BOM)"])
            UC_OF_Launch(["Lancer un Ordre de Fabrication (OF)"])
            UC_OF_Close(["Clôturer un OF (Double déstockage MP + Emballage)"])
        end

        subgraph Ventes ["5. Ventes & Facturation"]
            UC_VenteCreate(["Enregistrer une vente (PF, semences, grains)"])
            UC_Reglement(["Encaisser (Espèces, Banque, Crédit, Mobile Money)"])
            UC_Facture(["Générer / Imprimer Facture PDF"])
            UC_WhatsApp(["Envoyer la facture via WhatsApp"])
            UC_Dons(["Enregistrer un don / échantillon"])
        end

        subgraph Tresorerie ["6. Trésorerie & Dépenses"]
            UC_SoldeView(["Consulter les soldes Caisse & Banque"])
            UC_Depense(["Saisir une dépense catégorisée"])
            UC_Transfert(["Effectuer un virement Banque <-> Caisse"])
            UC_ClotureCaisse(["Effectuer la clôture journalière de caisse"])
        end

        subgraph Reporting ["7. Pilotage & Décision"]
            UC_Dashboard(["Consulter le Tableau de Bord Exécutif"])
            UC_Rapports(["Consulter les rapports de marge"])
        end

    end

    %% Relations Authentification
    Admin --> UC_Auth
    Gest --> UC_Auth
    Cons --> UC_Auth

    Admin --> UC_UserMgmt

    %% Relations Gestionnaire
    Gest --> UC_ArtCreate
    Gest --> UC_Inventaire
    Gest --> UC_AchatCreate
    Gest --> UC_Recette
    Gest --> UC_OF_Launch
    Gest --> UC_OF_Close
    Gest --> UC_VenteCreate
    Gest --> UC_Dons
    Gest --> UC_Depense
    Gest --> UC_Transfert
    Gest --> UC_ClotureCaisse

    %% Includes & Extends Ventes
    UC_VenteCreate -.->|<<include>>| UC_Reglement
    UC_VenteCreate -.->|<<include>>| UC_Facture
    UC_Facture -.->|<<extend>> Nice to have| UC_WhatsApp

    %% Relations Consultant (Lecture seule)
    Cons --> UC_ArtView
    Cons --> UC_AuditStock
    Cons --> UC_AchatView
    Cons --> UC_SoldeView
    Cons --> UC_Dashboard
    Cons --> UC_Rapports

    %% Super Admin a aussi les accès de consultation
    Admin --> UC_ArtView
    Admin --> UC_SoldeView
    Admin --> UC_Dashboard
    Admin --> UC_Rapports
    Admin --> UC_ClotureCaisse

    %% Le Gestionnaire consulte aussi
    Gest --> UC_ArtView
    Gest --> UC_SoldeView
    Gest --> UC_Dashboard
```

---

## 3. Matrice des Rôles et Cas d'Utilisation

| Module | Cas d'Utilisation | Super Admin | Gestionnaire | Consultant |
| :--- | :--- | :---: | :---: | :---: |
| **Sécurité** | S'authentifier | ✅ | ✅ | ✅ |
| | Gérer les utilisateurs et profils | ✅ | ❌ | ❌ |
| **Stocks** | Consulter les stocks & alertes | ✅ | ✅ | ✅ *(Lecture)* |
| | Créer / Modifier articles | ✅ | ✅ | ❌ |
| | Réaliser un inventaire / ajustement | ✅ *(Validation)* | ✅ *(Saisie)* | ❌ |
| | Consulter le journal d'audit des stocks | ✅ | ✅ | ✅ *(Lecture)* |
| **Achats** | Enregistrer un achat | ❌ | ✅ | ❌ |
| | Consulter l'historique des achats | ✅ | ✅ | ✅ *(Lecture)* |
| **Production** | Gérer les recettes (BOM) | ✅ | ✅ | ❌ |
| | Lancer un Ordre de Fabrication (OF) | ❌ | ✅ | ❌ |
| | Clôturer un OF (Double déstockage) | ❌ | ✅ | ❌ |
| **Ventes** | Enregistrer une vente & encaissement | ❌ | ✅ | ❌ |
| | Générer / Imprimer facture PDF | ✅ | ✅ | ✅ *(Lecture)* |
| | Envoyer facture via WhatsApp *(Nice to have)* | ✅ | ✅ | ❌ |
| | Enregistrer un don / échantillon | ❌ | ✅ | ❌ |
| **Trésorerie** | Consulter soldes Caisse & Banque | ✅ | ✅ | ✅ *(Lecture)* |
| | Saisir une dépense d'exploitation | ❌ | ✅ | ❌ |
| | Virement interne Banque $\leftrightarrow$ Caisse | ✅ *(Validation)* | ✅ *(Exécution)* | ❌ |
| | Clôture de caisse (billetage) | ✅ *(Validation)* | ✅ *(Saisie)* | ❌ |
| **Pilotage** | Dashboard exécutif & KPIs | ✅ | ✅ | ✅ *(Lecture)* |
| | Rapports de marges par produit | ✅ | ✅ | ✅ *(Lecture)* |

---

## 4. Diagramme de Classes (Class Diagram)

```mermaid
classDiagram
    direction TB

    %% ENUMS
    class FamilleArticleEnum {
        <<enumeration>>
        SEMENCE
        INTRANT
        MATIERE_PREMIERE
        EMBALLAGE
        PRODUIT_FINI
    }

    class TypeMouvementStockEnum {
        <<enumeration>>
        ENTREE_ACHAT
        SORTIE_VENTE
        CONSO_PRODUCTION
        ENTREE_PRODUCTION
        AJUSTEMENT_INVENTAIRE
        SORTIE_DON_PERTE
    }

    class ModeReglementEnum {
        <<enumeration>>
        ESPECES_CAISSE
        BANQUE
        A_CREDIT
        MOBILE_MONEY
    }

    class StatutOFEnum {
        <<enumeration>>
        BROUILLON
        EN_COURS
        TERMINE
        ANNULE
    }

    class RoleUtilisateurEnum {
        <<enumeration>>
        SUPER_ADMIN
        GESTIONNAIRE
        CONSULTANT
    }

    %% CLASSES METIER
    class Utilisateur {
        +UUID id
        +String nom_complet
        +String email
        +String mot_de_passe_hash
        +RoleUtilisateurEnum role
        +Boolean est_actif
        +DateTime date_creation
        +seConnecter(email, password) Boolean
        +changerMotDePasse(nouveau) void
    }

    class Tiers {
        +UUID id
        +String code_tiers
        +String nom
        +String telephone
        +String adresse
        +Boolean est_client
        +Boolean est_fournisseur
        +Decimal solde_creance
        +Decimal solde_dette
        +actualiserSolde(montant, sens) void
    }

    class Article {
        +UUID id
        +String code_sku
        +String designation
        +FamilleArticleEnum famille
        +String categorie_code
        +String contenance
        +String unite_mesure
        +Decimal facteur_conversion_kg
        +Decimal stock_actuel
        +Decimal stock_minimum
        +Decimal prix_achat_moyen
        +Decimal prix_vente_standard
        +Boolean est_actif
        +verifierDisponibilite(qte) Boolean
        +ajusterStock(qte, type, ref) void
        +estEnAlerteRupture() Boolean
        +calculerPUMP(nouvelleQte, nouveauPrix) void
    }

    class MouvementStock {
        +Long id
        +UUID article_id
        +TypeMouvementStockEnum type_mouvement
        +Decimal quantite
        +Decimal cout_unitaire
        +Decimal stock_avant
        +Decimal stock_apres
        +String reference_document
        +String motif
        +DateTime date_mouvement
    }

    class Recette {
        +UUID id
        +UUID article_pf_id
        +String nom_recette
        +Decimal quantite_base_produite
        +String notes_preparation
        +ajouterLigne(articleId, qte, estEmballage) void
        +supprimerLigne(ligneId) void
    }

    class LigneRecette {
        +Long id
        +UUID recette_id
        +UUID article_composant_id
        +Decimal quantite_necessaire
        +Boolean est_emballage
    }

    class OrdreFabrication {
        +UUID id
        +String numero_of
        +UUID recette_id
        +UUID article_pf_id
        +Decimal quantite_prevue
        +Decimal quantite_reelle_obtenue
        +Decimal quantite_dechets
        +Decimal reste_vrac
        +StatutOFEnum statut
        +DateTime date_lancement
        +DateTime date_cloture
        +String observations
        +lancer() void
        +cloturer(qteReelle, dechets, reste) void
        +annuler() void
    }

    class OFConsommationReelle {
        +Long id
        +UUID of_id
        +UUID article_composant_id
        +Decimal quantite_consommee
    }

    class Achat {
        +UUID id
        +String numero_facture
        +UUID fournisseur_id
        +Date date_achat
        +Decimal montant_total
        +ModeReglementEnum mode_reglement
        +String operateur_mobile_money
        +String reference_paiement
        +Boolean est_paye
        +validerAchat() void
    }

    class LigneAchat {
        +Long id
        +UUID achat_id
        +UUID article_id
        +Decimal quantite
        +Decimal prix_unitaire
        +Decimal montant_total
        +calculerTotal() Decimal
    }

    class Vente {
        +UUID id
        +String numero_facture
        +UUID client_id
        +String client_nom_libre
        +Date date_vente
        +Decimal montant_total
        +Decimal montant_regle
        +ModeReglementEnum mode_reglement
        +String operateur_mobile_money
        +String reference_paiement
        +Boolean est_don
        +String beneficiaire_don
        +validerVente() void
        +genererFacturePDF() Byte[]
        +genererLienWhatsApp() String
    }

    class LigneVente {
        +Long id
        +UUID vente_id
        +UUID article_id
        +Decimal quantite
        +Decimal prix_unitaire
        +Decimal montant_total
        +calculerTotal() Decimal
    }

    class CompteTresorerie {
        +Int id
        +String nom
        +String code
        +Decimal solde_actuel
        +crediter(montant) void
        +debiter(montant) void
    }

    class CategorieDepense {
        +Int id
        +String nom
        +String description
    }

    class Depense {
        +UUID id
        +Int categorie_id
        +Int compte_tresorerie_id
        +Date date_depense
        +String designation
        +Decimal montant
        +String piece_justificative
        +enregistrer() void
    }

    class TransactionTresorerie {
        +Long id
        +Int compte_id
        +String type_flux
        +Decimal montant
        +String sens
        +String libelle
        +String piece_reference
        +Int compte_destination_id
        +DateTime date_transaction
    }

    %% RELATIONS
    Utilisateur "1" -- "0..*" MouvementStock : enregistre
    Utilisateur "1" -- "0..*" OrdreFabrication : supervise
    Utilisateur "1" -- "0..*" Vente : saisit
    Utilisateur "1" -- "0..*" Achat : saisit
    Utilisateur "1" -- "0..*" Depense : engage

    Tiers "0..1" -- "0..*" Achat : livre
    Tiers "0..1" -- "0..*" Vente : achete

    Achat "1" *-- "1..*" LigneAchat : compose
    LigneAchat "1..*" -- "1" Article : concerne

    Vente "1" *-- "1..*" LigneVente : compose
    LigneVente "1..*" -- "1" Article : concerne

    Article "1" -- "0..*" MouvementStock : trace
    Article "1" -- "0..1" Recette : produit fini fabrique

    Recette "1" *-- "1..*" LigneRecette : contient
    LigneRecette "1..*" -- "1" Article : composant MP ou Emballage

    Recette "1" -- "0..*" OrdreFabrication : execute
    OrdreFabrication "1" *-- "1..*" OFConsommationReelle : destocke reel
    OFConsommationReelle "1..*" -- "1" Article : consomme
    OrdreFabrication "1" -- "1" Article : produit

    CompteTresorerie "1" -- "0..*" TransactionTresorerie : contient
    CompteTresorerie "1" -- "0..*" Depense : finance
    CategorieDepense "1" -- "0..*" Depense : classe

    Vente ..> TransactionTresorerie : genere encaissement
    Achat ..> TransactionTresorerie : genere decaissement
    Depense ..> TransactionTresorerie : genere debourse
```

---

## 5. Description Détaillée des Relations & Comportements Métier

### 5.1 Gestion des Stocks & Mouvements
* Tout mouvement physique sur un `Article` entraîne obligatoirement la création d'un enregistrement immuable dans `MouvementStock`.
* Les types de mouvements garantissent la traçabilité intégrale :
  * `ENTREE_ACHAT` : Lié à un `Achat` validé.
  * `SORTIE_VENTE` : Lié à une `Vente` validée.
  * `CONSO_PRODUCTION` : Déstockage automatique des matières premières et emballages lors de la validation d'un `OrdreFabrication`.
  * `ENTREE_PRODUCTION` : Entrée du lot de produits finis issu de l'OF.
  * `SORTIE_DON_PERTE` : Sortie sans contrepartie financière (dégustation, don ou avarie).
  * `AJUSTEMENT_INVENTAIRE` : Écart physique régularisé.

### 5.2 Recette et Double Déstockage (Production)
* Une `Recette` est une nomenclature (BOM) reliant un produit fini à ses composants via `LigneRecette`.
* L'indicateur `est_emballage` (Booléen) permet de différencier :
  * Les **Matières Premières agricoles** (ex: Graine de soja, fonio, arachide).
  * Les **Consommables de conditionnement** (ex: Sachet 200g, sachet 1kg, bouteille 1L).
* Lors de la clôture de l'`OrdreFabrication` :
  1. La méthode `cloturer()` déduit le stock des composants proportionnellement aux quantités produites.
  2. Elle incrémente le stock de l'`Article` produit fini.
  3. Elle enregistre les consommations réelles dans `OFConsommationReelle`.

### 5.3 Ventes, Règlements & Option WhatsApp
* Une `Vente` comporte plusieurs `LigneVente` associées à des `Article` (qui peuvent être des produits finis, des semences ou des grains bruts).
* Modes de règlement gérés :
  * `ESPECES_CAISSE` : Déclenche immédiatement un crédit sur le `CompteTresorerie` Caisse.
  * `BANQUE` : Déclenche un crédit sur le `CompteTresorerie` Banque.
  * `MOBILE_MONEY` : Enregistre le montant avec le libellé libre de l'opérateur (Wave, Orange Money...) et le N° de transaction.
  * `A_CREDIT` : Augmente le `solde_creance` du `Tiers` client sans flux de caisse immédiat.
* **Option WhatsApp** :
  * La méthode `genererLienWhatsApp()` concatène le numéro de téléphone du client et un message URL-encodé reprenant le numéro de facture, la liste des articles achetés, le montant total et un lien vers le reçu numérique, permettant un envoi direct en 1 clic.
