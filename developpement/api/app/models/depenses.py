"""Dépenses, transferts entre comptes, clôtures de caisse et journal de trésorerie."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Computed,
    Date,
    DateTime,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.colonnes import (
    date_creation,
    fk_int,
    fk_uuid,
    horodatage_optionnel,
    pg_enum,
    uuid_pk,
)
from app.models.enums import StatutDocument, TypeFluxTresorerie


class Depense(Base):
    __tablename__ = "depenses"
    __table_args__ = (
        Index("idx_depenses_date", "date_depense"),
        Index("idx_depenses_categorie", "categorie_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    numero: Mapped[str] = mapped_column(String(50), unique=True)
    categorie_id: Mapped[int] = fk_int("categories_depense.id")
    compte_id: Mapped[int] = fk_int("comptes_tresorerie.id")
    date_depense: Mapped[date] = mapped_column(Date, server_default=text("CURRENT_DATE"))
    designation: Mapped[str] = mapped_column(String(255))
    montant: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    reference_paiement: Mapped[str | None] = mapped_column(String(100))
    piece_justificative: Mapped[str | None] = mapped_column(String(100))
    statut: Mapped[StatutDocument] = mapped_column(
        pg_enum(StatutDocument, "statut_document_enum"), server_default="VALIDE"
    )
    cree_par: Mapped[uuid.UUID] = fk_uuid("utilisateurs.id")
    date_creation: Mapped[datetime] = date_creation()
    annule_par: Mapped[uuid.UUID | None] = fk_uuid("utilisateurs.id", nullable=True)
    annule_le: Mapped[datetime | None] = horodatage_optionnel()
    motif_annulation: Mapped[str | None] = mapped_column(Text)
    controle_par: Mapped[uuid.UUID | None] = fk_uuid("utilisateurs.id", nullable=True)
    controle_le: Mapped[datetime | None] = horodatage_optionnel()
    # Clé d'idempotence du formulaire (migration 0004, P-009)
    cle_idempotence: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), unique=True)


class TransfertInterne(Base):
    __tablename__ = "transferts_internes"

    id: Mapped[uuid.UUID] = uuid_pk()
    numero: Mapped[str] = mapped_column(String(50), unique=True)
    compte_source_id: Mapped[int] = fk_int("comptes_tresorerie.id")
    compte_destination_id: Mapped[int] = fk_int("comptes_tresorerie.id")
    montant: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    date_transfert: Mapped[date] = mapped_column(Date, server_default=text("CURRENT_DATE"))
    libelle: Mapped[str | None] = mapped_column(String(255))
    reference_paiement: Mapped[str | None] = mapped_column(String(100))
    cree_par: Mapped[uuid.UUID] = fk_uuid("utilisateurs.id")
    date_creation: Mapped[datetime] = date_creation()
    # Annulation (migration 0006, D-034)
    statut: Mapped[StatutDocument] = mapped_column(
        pg_enum(StatutDocument, "statut_document_enum"), server_default="VALIDE"
    )
    annule_par: Mapped[uuid.UUID | None] = fk_uuid("utilisateurs.id", nullable=True)
    annule_le: Mapped[datetime | None] = horodatage_optionnel()
    motif_annulation: Mapped[str | None] = mapped_column(Text)
    controle_par: Mapped[uuid.UUID | None] = fk_uuid("utilisateurs.id", nullable=True)
    controle_le: Mapped[datetime | None] = horodatage_optionnel()
    # Clé d'idempotence du formulaire (migration 0004, P-009)
    cle_idempotence: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), unique=True)


class ClotureCaisse(Base):
    __tablename__ = "clotures_caisse"
    __table_args__ = (UniqueConstraint("compte_id", "date_cloture"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    compte_id: Mapped[int] = fk_int("comptes_tresorerie.id")
    date_cloture: Mapped[date] = mapped_column(Date)
    solde_ouverture: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    total_entrees: Mapped[Decimal] = mapped_column(Numeric(15, 2), server_default=text("0"))
    total_sorties: Mapped[Decimal] = mapped_column(Numeric(15, 2), server_default=text("0"))
    # Colonnes calculées par la base : jamais écrites par l'application
    solde_theorique: Mapped[Decimal] = mapped_column(
        Numeric(15, 2),
        Computed("solde_ouverture + total_entrees - total_sorties", persisted=True),
        nullable=True,
    )
    solde_physique: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    ecart: Mapped[Decimal] = mapped_column(
        Numeric(15, 2),
        Computed(
            "solde_physique - (solde_ouverture + total_entrees - total_sorties)", persisted=True
        ),
        nullable=True,
    )
    commentaire: Mapped[str | None] = mapped_column(Text)
    cree_par: Mapped[uuid.UUID] = fk_uuid("utilisateurs.id")
    date_creation: Mapped[datetime] = date_creation()
    controle_par: Mapped[uuid.UUID | None] = fk_uuid("utilisateurs.id", nullable=True)
    controle_le: Mapped[datetime | None] = horodatage_optionnel()


class TransactionTresorerie(Base):
    """Journal immuable (déclencheur en base). Sens CREDIT = entrée, DEBIT = sortie."""

    __tablename__ = "transactions_tresorerie"
    __table_args__ = (
        Index("idx_transactions_compte_date", "compte_id", "date_transaction"),
        Index(
            "idx_transactions_reglement",
            "reglement_id",
            postgresql_where=text("reglement_id IS NOT NULL"),
        ),
        Index(
            "idx_transactions_depense",
            "depense_id",
            postgresql_where=text("depense_id IS NOT NULL"),
        ),
        Index(
            "idx_transactions_transfert",
            "transfert_id",
            postgresql_where=text("transfert_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    compte_id: Mapped[int] = fk_int("comptes_tresorerie.id")
    type_flux: Mapped[TypeFluxTresorerie] = mapped_column(
        pg_enum(TypeFluxTresorerie, "type_flux_tresorerie_enum")
    )
    sens: Mapped[str] = mapped_column(String(10))
    montant: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    solde_avant: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    solde_apres: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    libelle: Mapped[str] = mapped_column(String(255))
    # Pièce d'origine (une au plus)
    reglement_id: Mapped[uuid.UUID | None] = fk_uuid("reglements.id", nullable=True)
    depense_id: Mapped[uuid.UUID | None] = fk_uuid("depenses.id", nullable=True)
    transfert_id: Mapped[uuid.UUID | None] = fk_uuid("transferts_internes.id", nullable=True)
    cloture_id: Mapped[uuid.UUID | None] = fk_uuid("clotures_caisse.id", nullable=True)
    utilisateur_id: Mapped[uuid.UUID] = fk_uuid("utilisateurs.id")
    date_transaction: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
