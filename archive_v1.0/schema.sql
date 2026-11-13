-- =============================================================================
-- ERP KEITALA — Schéma Relationnel PostgreSQL (DDL)
-- Version : 1.0 (Production)
-- Base de données : PostgreSQL 15+
-- =============================================================================

-- Extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- ENUMS (Types énumérés pour la cohérence des données)
-- =============================================================================

CREATE TYPE famille_article_enum AS ENUM (
    'SEMENCE',             -- Semences agricoles certifiées (Soja semence, etc.)
    'INTRANT',             -- Produits de traitement, fertilisants, sacs de stockage vides
    'MATIERE_PREMIERE',    -- Grains et récoltes brutes (Soja conso, Maïs, Mil, Pâte de manioc, Fonio)
    'EMBALLAGE',           -- Sachets de conditionnement, bouteilles, étiquettes, cartons
    'PRODUIT_FINI'         -- Produits transformés prêts à la vente (Café de soja, Gari, Attiéké...)
);

CREATE TYPE type_mouvement_stock_enum AS ENUM (
    'ENTREE_ACHAT',
    'SORTIE_VENTE',
    'CONSO_PRODUCTION',
    'ENTREE_PRODUCTION',
    'AJUSTEMENT_INVENTAIRE',
    'SORTIE_DON_PERTE'
);

CREATE TYPE type_flux_tresorerie_enum AS ENUM (
    'ENCAISSEMENT_VENTE',
    'DECAISSEMENT_ACHAT',
    'DEPENSE_EXPLOITATION',
    'TRANSFERT_INTERNE'
);

CREATE TYPE mode_reglement_enum AS ENUM (
    'ESPECES_CAISSE',
    'BANQUE',
    'A_CREDIT',
    'MOBILE_MONEY'
);

CREATE TYPE statut_of_enum AS ENUM (
    'BROUILLON',
    'EN_COURS',
    'TERMINE',
    'ANNULE'
);

CREATE TYPE role_utilisateur_enum AS ENUM (
    'ADMINISTRATEUR',
    'MAGASINIER',
    'RESPONSABLE_PRODUCTION',
    'CAISSIER_VENDEUR'
);

-- =============================================================================
-- 1. UTILISATEURS & AUTHENTIFICATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS utilisateurs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nom_complet VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    mot_de_passe_hash VARCHAR(255) NOT NULL,
    role role_utilisateur_enum NOT NULL DEFAULT 'CAISSIER_VENDEUR',
    est_actif BOOLEAN NOT NULL DEFAULT TRUE,
    date_creation TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- 2. TIERS (Clients & Fournisseurs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code_tiers VARCHAR(50) UNIQUE,
    nom VARCHAR(150) NOT NULL,
    telephone VARCHAR(50),
    adresse TEXT,
    est_client BOOLEAN NOT NULL DEFAULT FALSE,
    est_fournisseur BOOLEAN NOT NULL DEFAULT FALSE,
    solde_creance DECIMAL(15, 2) NOT NULL DEFAULT 0.00, -- Montant dû par le client
    solde_dette DECIMAL(15, 2) NOT NULL DEFAULT 0.00,    -- Montant dû au fournisseur
    date_creation TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- 3. ARTICLES & GESTION DES STOCKS
-- =============================================================================

CREATE TABLE IF NOT EXISTS articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code_sku VARCHAR(50) UNIQUE NOT NULL, -- ex: KN-SOJ-CAF200, MP-SOJ-CON-KG
    designation VARCHAR(200) NOT NULL,
    famille famille_article_enum NOT NULL,
    categorie_code VARCHAR(10),           -- ex: SOJ, MAN, FON, DAT
    contenance VARCHAR(50),               -- ex: 200g, 500g, 1kg, 1L, Sac 50kg
    unite_mesure VARCHAR(20) NOT NULL,     -- kg, sac, sachet, bouteille, unite
    facteur_conversion_kg DECIMAL(10, 4) DEFAULT 1.0000, -- ex: 50.0 pour Sac 50kg
    stock_actuel DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
    stock_minimum DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
    prix_achat_moyen DECIMAL(15, 2) NOT NULL DEFAULT 0.00, -- PUMP
    prix_vente_standard DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    est_actif BOOLEAN NOT NULL DEFAULT TRUE,
    date_creation TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT chk_stock_minimum CHECK (stock_minimum >= 0)
);

CREATE TABLE IF NOT EXISTS mouvements_stock (
    id BIGSERIAL PRIMARY KEY,
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
    type_mouvement type_mouvement_stock_enum NOT NULL,
    quantite DECIMAL(15, 3) NOT NULL, -- Quantité nette mouvementée
    cout_unitaire DECIMAL(15, 2) DEFAULT 0.00,
    stock_avant DECIMAL(15, 3) NOT NULL,
    stock_apres DECIMAL(15, 3) NOT NULL,
    reference_document VARCHAR(100), -- N° Facture, N° OF, etc.
    motif TEXT,
    utilisateur_id UUID REFERENCES utilisateurs(id),
    date_mouvement TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_mouvements_article ON mouvements_stock(article_id);
CREATE INDEX idx_mouvements_date ON mouvements_stock(date_mouvement);

-- =============================================================================
-- 4. ACHATS & APPROVISIONNEMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS achats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_facture VARCHAR(50) UNIQUE NOT NULL,
    fournisseur_id UUID REFERENCES tiers(id),
    date_achat DATE NOT NULL DEFAULT CURRENT_DATE,
    montant_total DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    mode_reglement mode_reglement_enum NOT NULL DEFAULT 'ESPECES_CAISSE',
    operateur_mobile_money VARCHAR(50),         -- Saisi librement si mode = MOBILE_MONEY (ex: Wave, Orange Money)
    reference_paiement VARCHAR(100),            -- N° transaction / référence
    est_paye BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    cree_par UUID REFERENCES utilisateurs(id),
    date_creation TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lignes_achat (
    id BIGSERIAL PRIMARY KEY,
    achat_id UUID NOT NULL REFERENCES achats(id) ON DELETE CASCADE,
    article_id UUID NOT NULL REFERENCES articles(id),
    quantite DECIMAL(15, 3) NOT NULL CHECK (quantite > 0),
    prix_unitaire DECIMAL(15, 2) NOT NULL CHECK (prix_unitaire >= 0),
    montant_total DECIMAL(15, 2) NOT NULL
);

-- =============================================================================
-- 5. VENTES, FACTURATION & DONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS ventes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_facture VARCHAR(50) UNIQUE NOT NULL, -- Format N°AAAA-MM-XXXX
    client_id UUID REFERENCES tiers(id),
    client_nom_libre VARCHAR(150),              -- Pour clients de passage
    date_vente DATE NOT NULL DEFAULT CURRENT_DATE,
    montant_total DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    montant_regle DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    mode_reglement mode_reglement_enum NOT NULL DEFAULT 'ESPECES_CAISSE',
    operateur_mobile_money VARCHAR(50),         -- Saisi librement si mode = MOBILE_MONEY (ex: Wave, Orange Money)
    reference_paiement VARCHAR(100),            -- N° transaction / référence
    est_don BOOLEAN NOT NULL DEFAULT FALSE,     -- TRUE si sortie promotionnelle / don
    beneficiaire_don VARCHAR(150),
    notes TEXT,
    cree_par UUID REFERENCES utilisateurs(id),
    date_creation TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lignes_vente (
    id BIGSERIAL PRIMARY KEY,
    vente_id UUID NOT NULL REFERENCES ventes(id) ON DELETE CASCADE,
    article_id UUID NOT NULL REFERENCES articles(id),
    quantite DECIMAL(15, 3) NOT NULL CHECK (quantite > 0),
    prix_unitaire DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    montant_total DECIMAL(15, 2) NOT NULL DEFAULT 0.00
);

-- =============================================================================
-- 6. PRODUCTION & TRANSFORMATION (Atelier & Recettes BOM)
-- =============================================================================

CREATE TABLE IF NOT EXISTS recettes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_produit_fini_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    nom_recette VARCHAR(150) NOT NULL,
    quantite_base_produite DECIMAL(10, 2) NOT NULL DEFAULT 1.00, -- ex: pour 1 sachet ou 1 kg
    notes_preparation TEXT,
    date_creation TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lignes_recette (
    id BIGSERIAL PRIMARY KEY,
    recette_id UUID NOT NULL REFERENCES recettes(id) ON DELETE CASCADE,
    article_composant_id UUID NOT NULL REFERENCES articles(id), -- MP brute OU Emballage
    quantite_necessaire DECIMAL(15, 4) NOT NULL CHECK (quantite_necessaire > 0),
    est_emballage BOOLEAN NOT NULL DEFAULT FALSE -- TRUE si sachet/bouteille, FALSE si grain/matière
);

CREATE TABLE IF NOT EXISTS ordres_fabrication (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_of VARCHAR(50) UNIQUE NOT NULL, -- ex: OF-2026-0001
    recette_id UUID NOT NULL REFERENCES recettes(id),
    article_produit_fini_id UUID NOT NULL REFERENCES articles(id),
    quantite_prevue DECIMAL(15, 2) NOT NULL,
    quantite_reelle_obtenue DECIMAL(15, 2) DEFAULT 0.00,
    quantite_dechets DECIMAL(15, 2) DEFAULT 0.00,
    reste_vrac DECIMAL(15, 2) DEFAULT 0.00,
    statut statut_of_enum NOT NULL DEFAULT 'BROUILLON',
    date_lancement TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_cloture TIMESTAMP WITH TIME ZONE,
    responsable_id UUID REFERENCES utilisateurs(id),
    observations TEXT
);

CREATE TABLE IF NOT EXISTS of_consommations_reelles (
    id BIGSERIAL PRIMARY KEY,
    ordre_fabrication_id UUID NOT NULL REFERENCES ordres_fabrication(id) ON DELETE CASCADE,
    article_composant_id UUID NOT NULL REFERENCES articles(id),
    quantite_consommee DECIMAL(15, 4) NOT NULL CHECK (quantite_consommee > 0)
);

-- =============================================================================
-- 7. TRÉSORERIE, BANQUE & DÉPENSES D'EXPLOITATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS comptes_tresorerie (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL UNIQUE,     -- 'Caisse Principale (Espèces)', 'Compte Bancaire'
    code VARCHAR(20) NOT NULL UNIQUE,     -- 'CAISSE', 'BANQUE'
    solde_actuel DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    date_mise_a_jour TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories_depense (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS depenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    categorie_id INT REFERENCES categories_depense(id),
    compte_tresorerie_id INT NOT NULL REFERENCES comptes_tresorerie(id),
    date_depense DATE NOT NULL DEFAULT CURRENT_DATE,
    designation VARCHAR(255) NOT NULL,
    montant DECIMAL(15, 2) NOT NULL CHECK (montant > 0),
    piece_justificative VARCHAR(100),
    cree_par UUID REFERENCES utilisateurs(id),
    date_creation TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions_tresorerie (
    id BIGSERIAL PRIMARY KEY,
    compte_id INT NOT NULL REFERENCES comptes_tresorerie(id),
    type_flux type_flux_tresorerie_enum NOT NULL,
    montant DECIMAL(15, 2) NOT NULL CHECK (montant > 0),
    sens VARCHAR(10) NOT NULL CHECK (sens IN ('CREDIT', 'DEBIT')), -- DEBIT = Sortie, CREDIT = Entree
    libelle VARCHAR(255) NOT NULL,
    piece_reference VARCHAR(100),
    compte_destination_id INT REFERENCES comptes_tresorerie(id), -- Pour transferts internes
    utilisateur_id UUID REFERENCES utilisateurs(id),
    date_transaction TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- DONNÉES INITIALES (SEED DATA EXTRAIT DE ERP_Keitala.xlsx)
-- =============================================================================

-- Comptes de Trésorerie
INSERT INTO comptes_tresorerie (nom, code, solde_actuel) VALUES 
('Caisse Principale (Espèces)', 'CAISSE', 0.00),
('Compte Bancaire', 'BANQUE', 0.00)
ON CONFLICT (code) DO NOTHING;

-- Catégories de Dépenses observées
INSERT INTO categories_depense (nom, description) VALUES
('Main d''œuvre / Personnel', 'Journaliers, triage grains, manutention'),
('Entretien & Réparations', 'Entretien motos, maintenance machines et locaux'),
('Emballages & Conditionnement', 'Achat de sachets, packs et étiquettes'),
('Carburant / Transport', 'Carburant moto/véhicule, frais de transport livraison'),
('Retrait Personnel / Avance', 'Prélèvements gérance, avances promotrice'),
('Fournitures & Hygiène', 'Savons, produits de nettoyage, papeterie')
ON CONFLICT (nom) DO NOTHING;
