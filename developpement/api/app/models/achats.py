import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Computed, Date, Index, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.colonnes import (
    RESTRICT,
    date_creation,
    fk_bigint,
    fk_uuid,
    horodatage_optionnel,
    pg_enum,
    uuid_pk,
)
from app.models.enums import StatutDocument


class Achat(Base):
    """Achat ACH-AAAA-NNNN. Sans règlement complet = achat à crédit."""

    __tablename__ = "achats"
    __table_args__ = (
        Index("idx_achats_date", "date_achat"),
        Index("idx_achats_fournisseur", "fournisseur_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    numero: Mapped[str] = mapped_column(String(50), unique=True)
    numero_facture_fournisseur: Mapped[str | None] = mapped_column(String(100))
    fournisseur_id: Mapped[uuid.UUID | None] = fk_uuid("tiers.id", nullable=True)
    fournisseur_nom_libre: Mapped[str | None] = mapped_column(String(150))
    date_achat: Mapped[date] = mapped_column(Date, server_default=text("CURRENT_DATE"))
    montant_total: Mapped[Decimal] = mapped_column(Numeric(15, 2), server_default=text("0"))
    statut: Mapped[StatutDocument] = mapped_column(
        pg_enum(StatutDocument, "statut_document_enum"), server_default="VALIDE"
    )
    notes: Mapped[str | None] = mapped_column(Text)
    cree_par: Mapped[uuid.UUID] = fk_uuid("utilisateurs.id")
    date_creation: Mapped[datetime] = date_creation()
    annule_par: Mapped[uuid.UUID | None] = fk_uuid("utilisateurs.id", nullable=True)
    annule_le: Mapped[datetime | None] = horodatage_optionnel()
    motif_annulation: Mapped[str | None] = mapped_column(Text)


class LigneAchat(Base):
    __tablename__ = "lignes_achat"
    __table_args__ = (
        Index("idx_lignes_achat_achat", "achat_id"),
        Index("idx_lignes_achat_article", "article_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    achat_id: Mapped[uuid.UUID] = fk_uuid("achats.id", ondelete=RESTRICT)
    article_id: Mapped[uuid.UUID] = fk_uuid("articles.id", ondelete=RESTRICT)
    unite_id: Mapped[int | None] = fk_bigint("article_unites.id", nullable=True)
    facteur_conversion: Mapped[Decimal] = mapped_column(Numeric(12, 4), server_default=text("1"))
    quantite: Mapped[Decimal] = mapped_column(Numeric(15, 3))
    prix_unitaire: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    # Colonnes calculées par la base : jamais écrites par l'application
    quantite_base: Mapped[Decimal] = mapped_column(
        Numeric(15, 3),
        Computed("round(quantite * facteur_conversion, 3)", persisted=True),
        nullable=True,
    )
    montant_total: Mapped[Decimal] = mapped_column(
        Numeric(15, 2),
        Computed("round(quantite * prix_unitaire, 2)", persisted=True),
        nullable=True,
    )
