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
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.colonnes import (
    RESTRICT,
    date_creation,
    fk_uuid,
    horodatage_optionnel,
    pg_enum,
    uuid_pk,
)
from app.models.enums import FamilleArticle, MotifEcart, StatutInventaire, TypeMouvementStock


class MouvementStock(Base):
    """Journal immuable (déclencheur en base). Quantité signée, en unité de base."""

    __tablename__ = "mouvements_stock"
    __table_args__ = (
        Index("idx_mouvements_article_date", "article_id", "date_mouvement"),
        Index("idx_mouvements_date", "date_mouvement"),
        Index("idx_mouvements_achat", "achat_id", postgresql_where=text("achat_id IS NOT NULL")),
        Index("idx_mouvements_vente", "vente_id", postgresql_where=text("vente_id IS NOT NULL")),
        Index(
            "idx_mouvements_of",
            "ordre_fabrication_id",
            postgresql_where=text("ordre_fabrication_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    article_id: Mapped[uuid.UUID] = fk_uuid("articles.id", ondelete=RESTRICT)
    type_mouvement: Mapped[TypeMouvementStock] = mapped_column(
        pg_enum(TypeMouvementStock, "type_mouvement_stock_enum")
    )
    quantite: Mapped[Decimal] = mapped_column(Numeric(15, 3))
    cout_unitaire: Mapped[Decimal] = mapped_column(Numeric(15, 4), server_default=text("0"))
    stock_avant: Mapped[Decimal] = mapped_column(Numeric(15, 3))
    stock_apres: Mapped[Decimal] = mapped_column(Numeric(15, 3))
    # Pièce d'origine (une au plus)
    achat_id: Mapped[uuid.UUID | None] = fk_uuid("achats.id", nullable=True)
    vente_id: Mapped[uuid.UUID | None] = fk_uuid("ventes.id", nullable=True)
    ordre_fabrication_id: Mapped[uuid.UUID | None] = fk_uuid("ordres_fabrication.id", nullable=True)
    inventaire_id: Mapped[uuid.UUID | None] = fk_uuid("inventaires.id", nullable=True)
    reference_document: Mapped[str | None] = mapped_column(String(100))
    motif: Mapped[str | None] = mapped_column(Text)
    utilisateur_id: Mapped[uuid.UUID] = fk_uuid("utilisateurs.id")
    date_mouvement: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class Inventaire(Base):
    __tablename__ = "inventaires"

    id: Mapped[uuid.UUID] = uuid_pk()
    numero: Mapped[str] = mapped_column(String(50), unique=True)
    date_inventaire: Mapped[date] = mapped_column(Date, server_default=text("CURRENT_DATE"))
    famille: Mapped[FamilleArticle | None] = mapped_column(
        pg_enum(FamilleArticle, "famille_article_enum")
    )
    statut: Mapped[StatutInventaire] = mapped_column(
        pg_enum(StatutInventaire, "statut_inventaire_enum"), server_default="EN_COURS"
    )
    observations: Mapped[str | None] = mapped_column(Text)
    cree_par: Mapped[uuid.UUID] = fk_uuid("utilisateurs.id")
    date_creation: Mapped[datetime] = date_creation()
    valide_le: Mapped[datetime | None] = horodatage_optionnel()
    controle_par: Mapped[uuid.UUID | None] = fk_uuid("utilisateurs.id", nullable=True)
    controle_le: Mapped[datetime | None] = horodatage_optionnel()


class LigneInventaire(Base):
    __tablename__ = "lignes_inventaire"
    __table_args__ = (UniqueConstraint("inventaire_id", "article_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    inventaire_id: Mapped[uuid.UUID] = fk_uuid("inventaires.id", ondelete=RESTRICT)
    article_id: Mapped[uuid.UUID] = fk_uuid("articles.id", ondelete=RESTRICT)
    stock_theorique: Mapped[Decimal] = mapped_column(Numeric(15, 3))
    stock_physique: Mapped[Decimal] = mapped_column(Numeric(15, 3))
    # Colonne calculée par la base : jamais écrite par l'application
    ecart: Mapped[Decimal] = mapped_column(
        Numeric(15, 3), Computed("stock_physique - stock_theorique", persisted=True), nullable=True
    )
    motif: Mapped[MotifEcart | None] = mapped_column(pg_enum(MotifEcart, "motif_ecart_enum"))
    commentaire: Mapped[str | None] = mapped_column(Text)
