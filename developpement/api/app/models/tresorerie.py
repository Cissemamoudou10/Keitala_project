from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.colonnes import pg_enum
from app.models.enums import TypeCompteTresorerie


class CompteTresorerie(Base):
    """Caisse, banque ou compte Mobile Money (un par opérateur, saisie manuelle)."""

    __tablename__ = "comptes_tresorerie"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    nom: Mapped[str] = mapped_column(String(100), unique=True)
    type: Mapped[TypeCompteTresorerie] = mapped_column(
        pg_enum(TypeCompteTresorerie, "type_compte_tresorerie_enum")
    )
    operateur: Mapped[str | None] = mapped_column(String(50))
    solde_actuel: Mapped[Decimal] = mapped_column(Numeric(15, 2), server_default=text("0"))
    est_actif: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    date_mise_a_jour: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class CategorieDepense(Base):
    __tablename__ = "categories_depense"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nom: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
