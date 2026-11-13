"""Production en deux étapes : transformation puis conditionnement."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
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
    CASCADE,
    RESTRICT,
    date_creation,
    fk_uuid,
    horodatage_optionnel,
    pg_enum,
    uuid_pk,
)
from app.models.enums import StatutOf, TypeOf


class Recette(Base):
    __tablename__ = "recettes"

    id: Mapped[uuid.UUID] = uuid_pk()
    type_of: Mapped[TypeOf] = mapped_column(pg_enum(TypeOf, "type_of_enum"))
    article_produit_id: Mapped[uuid.UUID] = fk_uuid("articles.id", ondelete=RESTRICT)
    nom_recette: Mapped[str] = mapped_column(String(150))
    quantite_base_produite: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), server_default=text("1")
    )
    notes_preparation: Mapped[str | None] = mapped_column(Text)
    est_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    date_creation: Mapped[datetime] = date_creation()


class LigneRecette(Base):
    """Composant théorique, en unité de base du composant."""

    __tablename__ = "lignes_recette"
    __table_args__ = (UniqueConstraint("recette_id", "article_composant_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    recette_id: Mapped[uuid.UUID] = fk_uuid("recettes.id", ondelete=CASCADE)
    article_composant_id: Mapped[uuid.UUID] = fk_uuid("articles.id", ondelete=RESTRICT)
    quantite_necessaire: Mapped[Decimal] = mapped_column(Numeric(15, 4))


class OrdreFabrication(Base):
    __tablename__ = "ordres_fabrication"
    __table_args__ = (Index("idx_of_statut", "statut"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    numero_of: Mapped[str] = mapped_column(String(50), unique=True)
    type_of: Mapped[TypeOf] = mapped_column(pg_enum(TypeOf, "type_of_enum"))
    recette_id: Mapped[uuid.UUID] = fk_uuid("recettes.id", ondelete=RESTRICT)
    quantite_prevue: Mapped[Decimal] = mapped_column(Numeric(15, 3))
    quantite_pertes: Mapped[Decimal] = mapped_column(Numeric(15, 3), server_default=text("0"))
    statut: Mapped[StatutOf] = mapped_column(
        pg_enum(StatutOf, "statut_of_enum"), server_default="BROUILLON"
    )
    date_lancement: Mapped[datetime | None] = horodatage_optionnel()
    date_cloture: Mapped[datetime | None] = horodatage_optionnel()
    responsable_id: Mapped[uuid.UUID] = fk_uuid("utilisateurs.id")
    observations: Mapped[str | None] = mapped_column(Text)
    date_creation: Mapped[datetime] = date_creation()


class OfConsommation(Base):
    """Consommation d'un OF : prévue au lancement, réelle à la clôture."""

    __tablename__ = "of_consommations"
    __table_args__ = (UniqueConstraint("ordre_fabrication_id", "article_composant_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ordre_fabrication_id: Mapped[uuid.UUID] = fk_uuid("ordres_fabrication.id", ondelete=RESTRICT)
    article_composant_id: Mapped[uuid.UUID] = fk_uuid("articles.id", ondelete=RESTRICT)
    quantite_prevue: Mapped[Decimal] = mapped_column(Numeric(15, 4), server_default=text("0"))
    quantite_consommee: Mapped[Decimal] = mapped_column(Numeric(15, 4), server_default=text("0"))
    cout_unitaire: Mapped[Decimal] = mapped_column(Numeric(15, 4), server_default=text("0"))


class OfProduction(Base):
    """Sortie de production datée (produit principal ou co-produit)."""

    __tablename__ = "of_productions"
    __table_args__ = (Index("idx_of_productions_of", "ordre_fabrication_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ordre_fabrication_id: Mapped[uuid.UUID] = fk_uuid("ordres_fabrication.id", ondelete=RESTRICT)
    article_produit_id: Mapped[uuid.UUID] = fk_uuid("articles.id", ondelete=RESTRICT)
    date_production: Mapped[date] = mapped_column(Date, server_default=text("CURRENT_DATE"))
    quantite_produite: Mapped[Decimal] = mapped_column(Numeric(15, 3))
    cout_unitaire: Mapped[Decimal] = mapped_column(Numeric(15, 4), server_default=text("0"))
