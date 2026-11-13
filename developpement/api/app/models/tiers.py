import uuid
from datetime import datetime

from sqlalchemy import Boolean, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.colonnes import date_creation, uuid_pk


class Tiers(Base):
    """Client et/ou fournisseur. Créances et dettes : vue v_tiers_soldes."""

    __tablename__ = "tiers"

    id: Mapped[uuid.UUID] = uuid_pk()
    code_tiers: Mapped[str | None] = mapped_column(String(50), unique=True)
    nom: Mapped[str] = mapped_column(String(150))
    telephone: Mapped[str | None] = mapped_column(String(50))
    adresse: Mapped[str | None] = mapped_column(Text)
    est_client: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    est_fournisseur: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    est_actif: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    date_creation: Mapped[datetime] = date_creation()
