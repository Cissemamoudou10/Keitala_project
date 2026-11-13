"""schema initial v1.1

Revision ID: 0001
Revises:
Create Date: 2026-11-13

"""

from __future__ import annotations

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # TYPES ÉNUMÉRÉS
    # =========================================================================

    op.execute("""
        CREATE TYPE role_utilisateur_enum AS ENUM (
            'SUPER_ADMIN',
            'GESTIONNAIRE',
            'CONSULTANT'
        )
    """)

    op.execute("""
        CREATE TYPE famille_article_enum AS ENUM (
            'SEMENCE',
            'INTRANT',
            'MATIERE_PREMIERE',
            'SEMI_FINI',
            'EMBALLAGE',
            'PRODUIT_FINI'
        )
    """)

    op.execute("""
        CREATE TYPE type_mouvement_stock_enum AS ENUM (
            'ENTREE_ACHAT',
            'SORTIE_VENTE',
            'SORTIE_DON',
            'CONSO_PRODUCTION',
            'ENTREE_PRODUCTION',
            'AJUSTEMENT_INVENTAIRE',
            'SORTIE_PERTE',
            'ANNULATION'
        )
    """)

    op.execute("""
        CREATE TYPE statut_document_enum AS ENUM ('VALIDE', 'ANNULE')
    """)

    op.execute("""
        CREATE TYPE type_of_enum AS ENUM (
            'TRANSFORMATION',
            'CONDITIONNEMENT'
        )
    """)

    op.execute("""
        CREATE TYPE statut_of_enum AS ENUM ('BROUILLON', 'EN_COURS', 'TERMINE', 'ANNULE')
    """)

    op.execute("""
        CREATE TYPE statut_inventaire_enum AS ENUM ('EN_COURS', 'VALIDE')
    """)

    op.execute("""
        CREATE TYPE motif_ecart_enum AS ENUM (
            'CASSE', 'AVARIE', 'DESSICCATION', 'ERREUR_COMPTAGE', 'AUTRE'
        )
    """)

    op.execute("""
        CREATE TYPE type_compte_tresorerie_enum AS ENUM ('CAISSE', 'BANQUE', 'MOBILE_MONEY')
    """)

    op.execute("""
        CREATE TYPE type_flux_tresorerie_enum AS ENUM (
            'SOLDE_INITIAL',
            'ENCAISSEMENT_VENTE',
            'DECAISSEMENT_ACHAT',
            'DEPENSE_EXPLOITATION',
            'TRANSFERT_INTERNE',
            'ECART_CLOTURE',
            'ANNULATION'
        )
    """)

    # =========================================================================
    # 1. UTILISATEURS & NUMÉROTATION
    # =========================================================================

    op.execute("""
        CREATE TABLE utilisateurs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nom_complet VARCHAR(150) NOT NULL,
            email VARCHAR(150) NOT NULL UNIQUE,
            mot_de_passe_hash VARCHAR(255) NOT NULL,
            role role_utilisateur_enum NOT NULL DEFAULT 'CONSULTANT',
            est_actif BOOLEAN NOT NULL DEFAULT TRUE,
            derniere_connexion TIMESTAMPTZ,
            date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE compteurs_documents (
            prefixe VARCHAR(10) NOT NULL,
            annee SMALLINT NOT NULL,
            dernier_numero INT NOT NULL DEFAULT 0 CHECK (dernier_numero >= 0),
            PRIMARY KEY (prefixe, annee)
        )
    """)

    # =========================================================================
    # 2. TIERS
    # =========================================================================

    op.execute("""
        CREATE TABLE tiers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code_tiers VARCHAR(50) UNIQUE,
            nom VARCHAR(150) NOT NULL,
            telephone VARCHAR(50),
            adresse TEXT,
            est_client BOOLEAN NOT NULL DEFAULT FALSE,
            est_fournisseur BOOLEAN NOT NULL DEFAULT FALSE,
            est_actif BOOLEAN NOT NULL DEFAULT TRUE,
            date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT chk_tiers_type CHECK (est_client OR est_fournisseur)
        )
    """)

    # =========================================================================
    # 3. ARTICLES & UNITÉS
    # =========================================================================

    op.execute("""
        CREATE TABLE articles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code_sku VARCHAR(50) NOT NULL UNIQUE,
            designation VARCHAR(200) NOT NULL,
            famille famille_article_enum NOT NULL,
            categorie_code VARCHAR(10),
            contenance VARCHAR(50),
            unite_base VARCHAR(20) NOT NULL,
            stock_actuel DECIMAL(15, 3) NOT NULL DEFAULT 0,
            stock_minimum DECIMAL(15, 3) NOT NULL DEFAULT 0,
            cout_moyen DECIMAL(15, 4) NOT NULL DEFAULT 0,
            prix_vente_standard DECIMAL(15, 2) NOT NULL DEFAULT 0,
            autoriser_stock_negatif BOOLEAN NOT NULL DEFAULT FALSE,
            est_actif BOOLEAN NOT NULL DEFAULT TRUE,
            date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT chk_stock_minimum CHECK (stock_minimum >= 0),
            CONSTRAINT chk_cout_moyen CHECK (cout_moyen >= 0),
            CONSTRAINT chk_prix_vente CHECK (prix_vente_standard >= 0),
            CONSTRAINT chk_stock_non_negatif CHECK (stock_actuel >= 0 OR autoriser_stock_negatif)
        )
    """)

    op.execute("CREATE INDEX idx_articles_famille ON articles(famille)")

    op.execute("""
        CREATE TABLE article_unites (
            id BIGSERIAL PRIMARY KEY,
            article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
            libelle VARCHAR(50) NOT NULL,
            facteur_vers_base DECIMAL(12, 4) NOT NULL CHECK (facteur_vers_base > 0),
            UNIQUE (article_id, libelle)
        )
    """)

    # =========================================================================
    # 4. COMPTES DE TRÉSORERIE
    # =========================================================================

    op.execute("""
        CREATE TABLE comptes_tresorerie (
            id SERIAL PRIMARY KEY,
            code VARCHAR(20) NOT NULL UNIQUE,
            nom VARCHAR(100) NOT NULL UNIQUE,
            type type_compte_tresorerie_enum NOT NULL,
            operateur VARCHAR(50),
            solde_actuel DECIMAL(15, 2) NOT NULL DEFAULT 0,
            est_actif BOOLEAN NOT NULL DEFAULT TRUE,
            date_mise_a_jour TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT chk_compte_operateur CHECK ((type = 'MOBILE_MONEY') = (operateur IS NOT NULL))
        )
    """)

    op.execute("""
        CREATE TABLE categories_depense (
            id SERIAL PRIMARY KEY,
            nom VARCHAR(100) NOT NULL UNIQUE,
            description TEXT
        )
    """)

    # =========================================================================
    # 5. ACHATS
    # =========================================================================

    op.execute("""
        CREATE TABLE achats (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            numero VARCHAR(50) NOT NULL UNIQUE,
            numero_facture_fournisseur VARCHAR(100),
            fournisseur_id UUID REFERENCES tiers(id),
            fournisseur_nom_libre VARCHAR(150),
            date_achat DATE NOT NULL DEFAULT CURRENT_DATE,
            montant_total DECIMAL(15, 2) NOT NULL DEFAULT 0 CHECK (montant_total >= 0),
            statut statut_document_enum NOT NULL DEFAULT 'VALIDE',
            notes TEXT,
            cree_par UUID NOT NULL REFERENCES utilisateurs(id),
            date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            annule_par UUID REFERENCES utilisateurs(id),
            annule_le TIMESTAMPTZ,
            motif_annulation TEXT,
            CONSTRAINT chk_achat_annulation CHECK ((statut = 'ANNULE') = (annule_le IS NOT NULL))
        )
    """)

    op.execute("CREATE INDEX idx_achats_date ON achats(date_achat)")
    op.execute("CREATE INDEX idx_achats_fournisseur ON achats(fournisseur_id)")

    op.execute("""
        CREATE TABLE lignes_achat (
            id BIGSERIAL PRIMARY KEY,
            achat_id UUID NOT NULL REFERENCES achats(id) ON DELETE RESTRICT,
            article_id UUID NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
            unite_id BIGINT REFERENCES article_unites(id),
            facteur_conversion DECIMAL(12, 4) NOT NULL DEFAULT 1 CHECK (facteur_conversion > 0),
            quantite DECIMAL(15, 3) NOT NULL CHECK (quantite > 0),
            prix_unitaire DECIMAL(15, 2) NOT NULL CHECK (prix_unitaire >= 0),
            quantite_base DECIMAL(15, 3) GENERATED ALWAYS AS (ROUND(quantite * facteur_conversion, 3)) STORED,
            montant_total DECIMAL(15, 2) GENERATED ALWAYS AS (ROUND(quantite * prix_unitaire, 2)) STORED
        )
    """)

    op.execute("CREATE INDEX idx_lignes_achat_achat ON lignes_achat(achat_id)")
    op.execute("CREATE INDEX idx_lignes_achat_article ON lignes_achat(article_id)")

    # =========================================================================
    # 6. VENTES & DONS
    # =========================================================================

    op.execute("""
        CREATE TABLE ventes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            numero_facture VARCHAR(50) NOT NULL UNIQUE,
            client_id UUID REFERENCES tiers(id),
            client_nom_libre VARCHAR(150),
            date_vente DATE NOT NULL DEFAULT CURRENT_DATE,
            montant_total DECIMAL(15, 2) NOT NULL DEFAULT 0 CHECK (montant_total >= 0),
            est_don BOOLEAN NOT NULL DEFAULT FALSE,
            beneficiaire_don VARCHAR(150),
            motif_don VARCHAR(255),
            statut statut_document_enum NOT NULL DEFAULT 'VALIDE',
            notes TEXT,
            cree_par UUID NOT NULL REFERENCES utilisateurs(id),
            date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            annule_par UUID REFERENCES utilisateurs(id),
            annule_le TIMESTAMPTZ,
            motif_annulation TEXT,
            CONSTRAINT chk_vente_don CHECK (
                NOT est_don OR (montant_total = 0 AND beneficiaire_don IS NOT NULL AND motif_don IS NOT NULL)
            ),
            CONSTRAINT chk_vente_annulation CHECK ((statut = 'ANNULE') = (annule_le IS NOT NULL))
        )
    """)

    op.execute("CREATE INDEX idx_ventes_date ON ventes(date_vente)")
    op.execute("CREATE INDEX idx_ventes_client ON ventes(client_id)")

    op.execute("""
        CREATE TABLE lignes_vente (
            id BIGSERIAL PRIMARY KEY,
            vente_id UUID NOT NULL REFERENCES ventes(id) ON DELETE RESTRICT,
            article_id UUID NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
            unite_id BIGINT REFERENCES article_unites(id),
            facteur_conversion DECIMAL(12, 4) NOT NULL DEFAULT 1 CHECK (facteur_conversion > 0),
            quantite DECIMAL(15, 3) NOT NULL CHECK (quantite > 0),
            prix_unitaire DECIMAL(15, 2) NOT NULL DEFAULT 0 CHECK (prix_unitaire >= 0),
            cout_unitaire_base DECIMAL(15, 4) NOT NULL DEFAULT 0,
            quantite_base DECIMAL(15, 3) GENERATED ALWAYS AS (ROUND(quantite * facteur_conversion, 3)) STORED,
            montant_total DECIMAL(15, 2) GENERATED ALWAYS AS (ROUND(quantite * prix_unitaire, 2)) STORED
        )
    """)

    op.execute("CREATE INDEX idx_lignes_vente_vente ON lignes_vente(vente_id)")
    op.execute("CREATE INDEX idx_lignes_vente_article ON lignes_vente(article_id)")

    # =========================================================================
    # 7. RÈGLEMENTS
    # =========================================================================

    op.execute("""
        CREATE TABLE reglements (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vente_id UUID REFERENCES ventes(id) ON DELETE RESTRICT,
            achat_id UUID REFERENCES achats(id) ON DELETE RESTRICT,
            compte_id INT NOT NULL REFERENCES comptes_tresorerie(id),
            montant DECIMAL(15, 2) NOT NULL CHECK (montant > 0),
            date_reglement DATE NOT NULL DEFAULT CURRENT_DATE,
            reference_paiement VARCHAR(100),
            statut statut_document_enum NOT NULL DEFAULT 'VALIDE',
            cree_par UUID NOT NULL REFERENCES utilisateurs(id),
            date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            annule_par UUID REFERENCES utilisateurs(id),
            annule_le TIMESTAMPTZ,
            CONSTRAINT chk_reglement_cible CHECK (num_nonnulls(vente_id, achat_id) = 1),
            CONSTRAINT chk_reglement_annulation CHECK ((statut = 'ANNULE') = (annule_le IS NOT NULL))
        )
    """)

    op.execute("CREATE INDEX idx_reglements_vente ON reglements(vente_id)")
    op.execute("CREATE INDEX idx_reglements_achat ON reglements(achat_id)")
    op.execute("CREATE INDEX idx_reglements_date ON reglements(date_reglement)")

    # =========================================================================
    # 8. PRODUCTION EN DEUX ÉTAPES
    # =========================================================================

    op.execute("""
        CREATE TABLE recettes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            type_of type_of_enum NOT NULL,
            article_produit_id UUID NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
            nom_recette VARCHAR(150) NOT NULL,
            quantite_base_produite DECIMAL(12, 3) NOT NULL DEFAULT 1 CHECK (quantite_base_produite > 0),
            notes_preparation TEXT,
            est_active BOOLEAN NOT NULL DEFAULT TRUE,
            date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE lignes_recette (
            id BIGSERIAL PRIMARY KEY,
            recette_id UUID NOT NULL REFERENCES recettes(id) ON DELETE CASCADE,
            article_composant_id UUID NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
            quantite_necessaire DECIMAL(15, 4) NOT NULL CHECK (quantite_necessaire > 0),
            UNIQUE (recette_id, article_composant_id)
        )
    """)

    op.execute("""
        CREATE TABLE ordres_fabrication (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            numero_of VARCHAR(50) NOT NULL UNIQUE,
            type_of type_of_enum NOT NULL,
            recette_id UUID NOT NULL REFERENCES recettes(id) ON DELETE RESTRICT,
            quantite_prevue DECIMAL(15, 3) NOT NULL CHECK (quantite_prevue > 0),
            quantite_pertes DECIMAL(15, 3) NOT NULL DEFAULT 0 CHECK (quantite_pertes >= 0),
            statut statut_of_enum NOT NULL DEFAULT 'BROUILLON',
            date_lancement TIMESTAMPTZ,
            date_cloture TIMESTAMPTZ,
            responsable_id UUID NOT NULL REFERENCES utilisateurs(id),
            observations TEXT,
            date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT chk_of_cloture CHECK ((statut = 'TERMINE') = (date_cloture IS NOT NULL))
        )
    """)

    op.execute("CREATE INDEX idx_of_statut ON ordres_fabrication(statut)")

    op.execute("""
        CREATE TABLE of_consommations (
            id BIGSERIAL PRIMARY KEY,
            ordre_fabrication_id UUID NOT NULL REFERENCES ordres_fabrication(id) ON DELETE RESTRICT,
            article_composant_id UUID NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
            quantite_prevue DECIMAL(15, 4) NOT NULL DEFAULT 0 CHECK (quantite_prevue >= 0),
            quantite_consommee DECIMAL(15, 4) NOT NULL DEFAULT 0 CHECK (quantite_consommee >= 0),
            cout_unitaire DECIMAL(15, 4) NOT NULL DEFAULT 0,
            UNIQUE (ordre_fabrication_id, article_composant_id)
        )
    """)

    op.execute("""
        CREATE TABLE of_productions (
            id BIGSERIAL PRIMARY KEY,
            ordre_fabrication_id UUID NOT NULL REFERENCES ordres_fabrication(id) ON DELETE RESTRICT,
            article_produit_id UUID NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
            date_production DATE NOT NULL DEFAULT CURRENT_DATE,
            quantite_produite DECIMAL(15, 3) NOT NULL CHECK (quantite_produite > 0),
            cout_unitaire DECIMAL(15, 4) NOT NULL DEFAULT 0
        )
    """)

    op.execute("CREATE INDEX idx_of_productions_of ON of_productions(ordre_fabrication_id)")

    # =========================================================================
    # 9. INVENTAIRES PHYSIQUES
    # =========================================================================

    op.execute("""
        CREATE TABLE inventaires (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            numero VARCHAR(50) NOT NULL UNIQUE,
            date_inventaire DATE NOT NULL DEFAULT CURRENT_DATE,
            famille famille_article_enum,
            statut statut_inventaire_enum NOT NULL DEFAULT 'EN_COURS',
            observations TEXT,
            cree_par UUID NOT NULL REFERENCES utilisateurs(id),
            date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            valide_le TIMESTAMPTZ,
            controle_par UUID REFERENCES utilisateurs(id),
            controle_le TIMESTAMPTZ,
            CONSTRAINT chk_inventaire_validation CHECK ((statut = 'VALIDE') = (valide_le IS NOT NULL))
        )
    """)

    op.execute("""
        CREATE TABLE lignes_inventaire (
            id BIGSERIAL PRIMARY KEY,
            inventaire_id UUID NOT NULL REFERENCES inventaires(id) ON DELETE RESTRICT,
            article_id UUID NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
            stock_theorique DECIMAL(15, 3) NOT NULL,
            stock_physique DECIMAL(15, 3) NOT NULL CHECK (stock_physique >= 0),
            ecart DECIMAL(15, 3) GENERATED ALWAYS AS (stock_physique - stock_theorique) STORED,
            motif motif_ecart_enum,
            commentaire TEXT,
            UNIQUE (inventaire_id, article_id),
            CONSTRAINT chk_ecart_motif CHECK (stock_physique = stock_theorique OR motif IS NOT NULL)
        )
    """)

    # =========================================================================
    # 10. JOURNAL DES MOUVEMENTS DE STOCK (immuable)
    # =========================================================================

    op.execute("""
        CREATE TABLE mouvements_stock (
            id BIGSERIAL PRIMARY KEY,
            article_id UUID NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
            type_mouvement type_mouvement_stock_enum NOT NULL,
            quantite DECIMAL(15, 3) NOT NULL CHECK (quantite <> 0),
            cout_unitaire DECIMAL(15, 4) NOT NULL DEFAULT 0,
            stock_avant DECIMAL(15, 3) NOT NULL,
            stock_apres DECIMAL(15, 3) NOT NULL,
            achat_id UUID REFERENCES achats(id),
            vente_id UUID REFERENCES ventes(id),
            ordre_fabrication_id UUID REFERENCES ordres_fabrication(id),
            inventaire_id UUID REFERENCES inventaires(id),
            reference_document VARCHAR(100),
            motif TEXT,
            utilisateur_id UUID NOT NULL REFERENCES utilisateurs(id),
            date_mouvement TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT chk_mouvement_coherent CHECK (stock_apres = stock_avant + quantite),
            CONSTRAINT chk_mouvement_origine CHECK (
                num_nonnulls(achat_id, vente_id, ordre_fabrication_id, inventaire_id) <= 1
            ),
            CONSTRAINT chk_mouvement_perte CHECK (type_mouvement <> 'SORTIE_PERTE' OR motif IS NOT NULL)
        )
    """)

    op.execute(
        "CREATE INDEX idx_mouvements_article_date ON mouvements_stock(article_id, date_mouvement)"
    )
    op.execute("CREATE INDEX idx_mouvements_date ON mouvements_stock(date_mouvement)")
    op.execute(
        "CREATE INDEX idx_mouvements_achat ON mouvements_stock(achat_id) WHERE achat_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_mouvements_vente ON mouvements_stock(vente_id) WHERE vente_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_mouvements_of ON mouvements_stock(ordre_fabrication_id) WHERE ordre_fabrication_id IS NOT NULL"
    )

    # =========================================================================
    # 11. DÉPENSES, TRANSFERTS & CLÔTURES DE CAISSE
    # =========================================================================

    op.execute("""
        CREATE TABLE depenses (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            numero VARCHAR(50) NOT NULL UNIQUE,
            categorie_id INT NOT NULL REFERENCES categories_depense(id),
            compte_id INT NOT NULL REFERENCES comptes_tresorerie(id),
            date_depense DATE NOT NULL DEFAULT CURRENT_DATE,
            designation VARCHAR(255) NOT NULL,
            montant DECIMAL(15, 2) NOT NULL CHECK (montant > 0),
            reference_paiement VARCHAR(100),
            piece_justificative VARCHAR(100),
            statut statut_document_enum NOT NULL DEFAULT 'VALIDE',
            cree_par UUID NOT NULL REFERENCES utilisateurs(id),
            date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            annule_par UUID REFERENCES utilisateurs(id),
            annule_le TIMESTAMPTZ,
            motif_annulation TEXT,
            controle_par UUID REFERENCES utilisateurs(id),
            controle_le TIMESTAMPTZ,
            CONSTRAINT chk_depense_annulation CHECK ((statut = 'ANNULE') = (annule_le IS NOT NULL))
        )
    """)

    op.execute("CREATE INDEX idx_depenses_date ON depenses(date_depense)")
    op.execute("CREATE INDEX idx_depenses_categorie ON depenses(categorie_id)")

    op.execute("""
        CREATE TABLE transferts_internes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            numero VARCHAR(50) NOT NULL UNIQUE,
            compte_source_id INT NOT NULL REFERENCES comptes_tresorerie(id),
            compte_destination_id INT NOT NULL REFERENCES comptes_tresorerie(id),
            montant DECIMAL(15, 2) NOT NULL CHECK (montant > 0),
            date_transfert DATE NOT NULL DEFAULT CURRENT_DATE,
            libelle VARCHAR(255),
            reference_paiement VARCHAR(100),
            cree_par UUID NOT NULL REFERENCES utilisateurs(id),
            date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            controle_par UUID REFERENCES utilisateurs(id),
            controle_le TIMESTAMPTZ,
            CONSTRAINT chk_transfert_comptes CHECK (compte_source_id <> compte_destination_id)
        )
    """)

    op.execute("""
        CREATE TABLE clotures_caisse (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            compte_id INT NOT NULL REFERENCES comptes_tresorerie(id),
            date_cloture DATE NOT NULL,
            solde_ouverture DECIMAL(15, 2) NOT NULL,
            total_entrees DECIMAL(15, 2) NOT NULL DEFAULT 0,
            total_sorties DECIMAL(15, 2) NOT NULL DEFAULT 0,
            solde_theorique DECIMAL(15, 2) GENERATED ALWAYS AS (solde_ouverture + total_entrees - total_sorties) STORED,
            solde_physique DECIMAL(15, 2) NOT NULL,
            ecart DECIMAL(15, 2) GENERATED ALWAYS AS (solde_physique - (solde_ouverture + total_entrees - total_sorties)) STORED,
            commentaire TEXT,
            cree_par UUID NOT NULL REFERENCES utilisateurs(id),
            date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            controle_par UUID REFERENCES utilisateurs(id),
            controle_le TIMESTAMPTZ,
            UNIQUE (compte_id, date_cloture)
        )
    """)

    # =========================================================================
    # 12. JOURNAL DE TRÉSORERIE (immuable)
    # =========================================================================

    op.execute("""
        CREATE TABLE transactions_tresorerie (
            id BIGSERIAL PRIMARY KEY,
            compte_id INT NOT NULL REFERENCES comptes_tresorerie(id),
            type_flux type_flux_tresorerie_enum NOT NULL,
            sens VARCHAR(10) NOT NULL CHECK (sens IN ('CREDIT', 'DEBIT')),
            montant DECIMAL(15, 2) NOT NULL CHECK (montant > 0),
            solde_avant DECIMAL(15, 2) NOT NULL,
            solde_apres DECIMAL(15, 2) NOT NULL,
            libelle VARCHAR(255) NOT NULL,
            reglement_id UUID REFERENCES reglements(id),
            depense_id UUID REFERENCES depenses(id),
            transfert_id UUID REFERENCES transferts_internes(id),
            cloture_id UUID REFERENCES clotures_caisse(id),
            utilisateur_id UUID NOT NULL REFERENCES utilisateurs(id),
            date_transaction TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT chk_transaction_coherente CHECK (
                solde_apres = solde_avant + CASE sens WHEN 'CREDIT' THEN montant ELSE -montant END
            ),
            CONSTRAINT chk_transaction_origine CHECK (
                num_nonnulls(reglement_id, depense_id, transfert_id, cloture_id) <= 1
            )
        )
    """)

    op.execute(
        "CREATE INDEX idx_transactions_compte_date ON transactions_tresorerie(compte_id, date_transaction)"
    )
    op.execute(
        "CREATE INDEX idx_transactions_reglement ON transactions_tresorerie(reglement_id) WHERE reglement_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_transactions_depense ON transactions_tresorerie(depense_id) WHERE depense_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_transactions_transfert ON transactions_tresorerie(transfert_id) WHERE transfert_id IS NOT NULL"
    )

    # =========================================================================
    # 13. IMMUABILITÉ DES JOURNAUX
    # =========================================================================

    op.execute("""
        CREATE FUNCTION interdire_modification_journal() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Journal immuable : % interdit sur %', TG_OP, TG_TABLE_NAME;
        END;
        $$
    """)

    op.execute("""
        CREATE TRIGGER trg_mouvements_stock_immuable
            BEFORE UPDATE OR DELETE ON mouvements_stock
            FOR EACH ROW EXECUTE FUNCTION interdire_modification_journal()
    """)

    op.execute("""
        CREATE TRIGGER trg_transactions_tresorerie_immuable
            BEFORE UPDATE OR DELETE ON transactions_tresorerie
            FOR EACH ROW EXECUTE FUNCTION interdire_modification_journal()
    """)

    # =========================================================================
    # 14. VUES DE CONSULTATION
    # =========================================================================

    op.execute("""
        CREATE VIEW v_ventes_soldes AS
        SELECT v.id AS vente_id,
               v.numero_facture,
               v.client_id,
               v.date_vente,
               v.montant_total,
               COALESCE(SUM(r.montant) FILTER (WHERE r.statut = 'VALIDE'), 0) AS montant_regle,
               v.montant_total - COALESCE(SUM(r.montant) FILTER (WHERE r.statut = 'VALIDE'), 0) AS reste_a_payer
        FROM ventes v
        LEFT JOIN reglements r ON r.vente_id = v.id
        WHERE v.statut = 'VALIDE' AND NOT v.est_don
        GROUP BY v.id
    """)

    op.execute("""
        CREATE VIEW v_achats_soldes AS
        SELECT a.id AS achat_id,
               a.numero,
               a.fournisseur_id,
               a.date_achat,
               a.montant_total,
               COALESCE(SUM(r.montant) FILTER (WHERE r.statut = 'VALIDE'), 0) AS montant_regle,
               a.montant_total - COALESCE(SUM(r.montant) FILTER (WHERE r.statut = 'VALIDE'), 0) AS reste_a_payer
        FROM achats a
        LEFT JOIN reglements r ON r.achat_id = a.id
        WHERE a.statut = 'VALIDE'
        GROUP BY a.id
    """)

    op.execute("""
        CREATE VIEW v_tiers_soldes AS
        SELECT t.id AS tiers_id,
               t.nom,
               COALESCE((SELECT SUM(s.reste_a_payer) FROM v_ventes_soldes s WHERE s.client_id = t.id), 0) AS solde_creance,
               COALESCE((SELECT SUM(s.reste_a_payer) FROM v_achats_soldes s WHERE s.fournisseur_id = t.id), 0) AS solde_dette
        FROM tiers t
    """)

    op.execute("""
        CREATE VIEW v_stock_valorise AS
        SELECT a.id AS article_id,
               a.code_sku,
               a.designation,
               a.famille,
               a.unite_base,
               a.stock_actuel,
               a.stock_minimum,
               a.cout_moyen,
               ROUND(a.stock_actuel * a.cout_moyen, 2) AS valeur_stock,
               (a.stock_actuel <= a.stock_minimum) AS en_alerte
        FROM articles a
        WHERE a.est_actif
    """)

    # =========================================================================
    # 15. DONNÉES INITIALES
    # =========================================================================

    op.execute("""
        INSERT INTO comptes_tresorerie (code, nom, type, operateur) VALUES
        ('CAISSE',       'Caisse Principale (Espèces)', 'CAISSE',       NULL),
        ('BANQUE',       'Compte Bancaire',             'BANQUE',       NULL),
        ('ORANGE_MONEY', 'Orange Money',                'MOBILE_MONEY', 'Orange Money'),
        ('MOBICASH',     'Mobicash',                    'MOBILE_MONEY', 'Mobicash'),
        ('WAVE',         'Wave',                        'MOBILE_MONEY', 'Wave')
    """)

    op.execute("""
        INSERT INTO categories_depense (nom, description) VALUES
        ('Main d''œuvre / Personnel',    'Journaliers, triage grains, manutention'),
        ('Entretien & Réparations',      'Entretien motos, maintenance machines et locaux'),
        ('Emballages & Conditionnement', 'Petits achats de consommables non suivis en stock'),
        ('Carburant / Transport',        'Carburant moto/véhicule, frais de transport livraison'),
        ('Retrait Personnel / Avance',   'Prélèvements gérance, avances promotrice'),
        ('Fournitures & Hygiène',        'Savons, produits de nettoyage, papeterie'),
        ('Divers',                       'Dépenses ne relevant d''aucune autre catégorie')
    """)

    op.execute("""
        INSERT INTO articles (code_sku, designation, famille, categorie_code, unite_base, stock_minimum, prix_vente_standard) VALUES
        ('MP-SOJ-SEM', 'Soja Semence',      'SEMENCE',          'SOJ', 'kg', 100, 1000),
        ('MP-SOJ-CON', 'Soja Consommation', 'MATIERE_PREMIERE', 'SOJ', 'kg', 250, 250),
        ('MP-MAI',     'Maïs',              'MATIERE_PREMIERE', 'MAI', 'kg', 250, 0),
        ('MP-MIL',     'Mil',               'MATIERE_PREMIERE', 'MIL', 'kg', 250, 0),
        ('MP-MAN',     'Pâte de Manioc',    'MATIERE_PREMIERE', 'MAN', 'kg', 100, 0)
    """)

    op.execute("""
        INSERT INTO article_unites (article_id, libelle, facteur_vers_base)
        SELECT id, 'Sac 50 kg', 50 FROM articles WHERE code_sku LIKE 'MP-%'
    """)

    op.execute("""
        INSERT INTO articles (code_sku, designation, famille, categorie_code, contenance, unite_base) VALUES
        ('KN-SOJ-CAF200', 'Café de soja',                  'PRODUIT_FINI', 'SOJ', '200 g',  'sachet'),
        ('KN-SOJ-SBL200', 'Soumbala graine de soja blanc', 'PRODUIT_FINI', 'SOJ', '200 g',  'sachet'),
        ('KN-SOJ-POU200', 'Poudre de soumbala soja',       'PRODUIT_FINI', 'SOJ', '200 g',  'sachet'),
        ('KN-SOJ-FAR200', 'Farine complément de soja',     'PRODUIT_FINI', 'SOJ', '200 g',  'sachet'),
        ('KN-SOJ-FAR400', 'Farine complément de soja',     'PRODUIT_FINI', 'SOJ', '400 g',  'sachet'),
        ('KN-SOJ-HUI1L',  'Huile de soja',                 'PRODUIT_FINI', 'SOJ', '1 L',    'bouteille'),
        ('KN-SOJ-HUI500', 'Huile de soja',                 'PRODUIT_FINI', 'SOJ', '500 ml', 'bouteille'),
        ('KN-SES-HUI500', 'Huile de sésame',               'PRODUIT_FINI', 'SES', '500 ml', 'bouteille'),
        ('KN-DAT-DAT200', 'Datou',                         'PRODUIT_FINI', 'DAT', '200 g',  'sachet'),
        ('KN-DAT-DAT1KG', 'Datou',                         'PRODUIT_FINI', 'DAT', '1 kg',   'sachet'),
        ('KN-MNG-SEC070', 'Mangue séchée',                 'PRODUIT_FINI', 'MNG', '70 g',   'sachet'),
        ('KN-MNK-MON200', 'Moni Kourou',                   'PRODUIT_FINI', 'MNK', '200 g',  'sachet'),
        ('KN-SAN-SAN200', 'SANI',                          'PRODUIT_FINI', 'SAN', '200 g',  'sachet'),
        ('KN-SAN-SAN500', 'SANI',                          'PRODUIT_FINI', 'SAN', '500 g',  'sachet'),
        ('KN-MAN-GAR200', 'Gari',                          'PRODUIT_FINI', 'MAN', '200 g',  'sachet'),
        ('KN-MAN-GAR500', 'Gari',                          'PRODUIT_FINI', 'MAN', '500 g',  'sachet'),
        ('KN-MAN-ATF200', 'Attiéké frais',                 'PRODUIT_FINI', 'MAN', '200 g',  'sachet'),
        ('KN-MAN-ATS200', 'Attiéké sec',                   'PRODUIT_FINI', 'MAN', '200 g',  'sachet'),
        ('KN-MAN-ATS400', 'Attiéké sec',                   'PRODUIT_FINI', 'MAN', '400 g',  'sachet'),
        ('KN-MAN-ATS500', 'Attiéké sec',                   'PRODUIT_FINI', 'MAN', '500 g',  'sachet'),
        ('KN-MAN-FAR200', 'Farine de manioc',              'PRODUIT_FINI', 'MAN', '200 g',  'sachet'),
        ('KN-TAP-TAP200', 'Tapioka',                       'PRODUIT_FINI', 'TAP', '200 g',  'sachet'),
        ('KN-DJU-DJU1KG', 'Djouka',                        'PRODUIT_FINI', 'DJU', '1 kg',   'sachet'),
        ('KN-FON-FON1KG', 'Fonio',                         'PRODUIT_FINI', 'FON', '1 kg',   'sachet')
    """)


def downgrade() -> None:
    # Supprimer dans l'ordre inverse des dépendances

    # Vues
    op.execute("DROP VIEW IF EXISTS v_stock_valorise CASCADE")
    op.execute("DROP VIEW IF EXISTS v_tiers_soldes CASCADE")
    op.execute("DROP VIEW IF EXISTS v_achats_soldes CASCADE")
    op.execute("DROP VIEW IF EXISTS v_ventes_soldes CASCADE")

    # Triggers & fonctions
    op.execute(
        "DROP TRIGGER IF EXISTS trg_transactions_tresorerie_immuable ON transactions_tresorerie"
    )
    op.execute("DROP TRIGGER IF EXISTS trg_mouvements_stock_immuable ON mouvements_stock")
    op.execute("DROP FUNCTION IF EXISTS interdire_modification_journal()")

    # Tables (ordre inverse des FK)
    op.execute("DROP TABLE IF EXISTS transactions_tresorerie CASCADE")
    op.execute("DROP TABLE IF EXISTS clotures_caisse CASCADE")
    op.execute("DROP TABLE IF EXISTS transferts_internes CASCADE")
    op.execute("DROP TABLE IF EXISTS depenses CASCADE")
    op.execute("DROP TABLE IF EXISTS mouvements_stock CASCADE")
    op.execute("DROP TABLE IF EXISTS lignes_inventaire CASCADE")
    op.execute("DROP TABLE IF EXISTS inventaires CASCADE")
    op.execute("DROP TABLE IF EXISTS of_productions CASCADE")
    op.execute("DROP TABLE IF EXISTS of_consommations CASCADE")
    op.execute("DROP TABLE IF EXISTS ordres_fabrication CASCADE")
    op.execute("DROP TABLE IF EXISTS lignes_recette CASCADE")
    op.execute("DROP TABLE IF EXISTS recettes CASCADE")
    op.execute("DROP TABLE IF EXISTS reglements CASCADE")
    op.execute("DROP TABLE IF EXISTS lignes_vente CASCADE")
    op.execute("DROP TABLE IF EXISTS ventes CASCADE")
    op.execute("DROP TABLE IF EXISTS lignes_achat CASCADE")
    op.execute("DROP TABLE IF EXISTS achats CASCADE")
    op.execute("DROP TABLE IF EXISTS categories_depense CASCADE")
    op.execute("DROP TABLE IF EXISTS comptes_tresorerie CASCADE")
    op.execute("DROP TABLE IF EXISTS article_unites CASCADE")
    op.execute("DROP TABLE IF EXISTS articles CASCADE")
    op.execute("DROP TABLE IF EXISTS tiers CASCADE")
    op.execute("DROP TABLE IF EXISTS compteurs_documents CASCADE")
    op.execute("DROP TABLE IF EXISTS utilisateurs CASCADE")

    # Types énumérés
    op.execute("DROP TYPE IF EXISTS type_flux_tresorerie_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS type_compte_tresorerie_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS motif_ecart_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS statut_inventaire_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS statut_of_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS type_of_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS statut_document_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS type_mouvement_stock_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS famille_article_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS role_utilisateur_enum CASCADE")
