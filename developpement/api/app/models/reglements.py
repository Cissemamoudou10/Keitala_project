import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, Index, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.colonnes import (
    RESTRICT,
    date_creation,
    fk_int,
    fk_uuid,
    horodatage_optionnel,
    pg_enum,
    uuid_pk,
)
from app.models.enums import StatutDocument


class Reglement(Base):
    """Une somme, un compte de trésorerie, et une vente OU un achat."""

    __tablename__ = "reglements"
    __table_args__ = (
        Index("idx_reglements_vente", "vente_id"),
        Index("idx_reglements_achat", "achat_id"),
        Index("idx_reglements_date", "date_reglement"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    vente_id: Mapped[uuid.UUID | None] = fk_uuid("ventes.id", nullable=True, ondelete=RESTRICT)
    achat_id: Mapped[uuid.UUID | None] = fk_uuid("achats.id", nullable=True, ondelete=RESTRICT)
    compte_id: Mapped[int] = fk_int("comptes_tresorerie.id")
    montant: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    date_reglement: Mapped[date] = mapped_column(Date, server_default=text("CURRENT_DATE"))
    reference_paiement: Mapped[str | None] = mapped_column(String(100))
    statut: Mapped[StatutDocument] = mapped_column(
        pg_enum(StatutDocument, "statut_document_enum"), server_default="VALIDE"
    )
    cree_par: Mapped[uuid.UUID] = fk_uuid("utilisateurs.id")
    date_creation: Mapped[datetime] = date_creation()
    annule_par: Mapped[uuid.UUID | None] = fk_uuid("utilisateurs.id", nullable=True)
    annule_le: Mapped[datetime | None] = horodatage_optionnel()
