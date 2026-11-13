import uuid
from datetime import datetime

from sqlalchemy import Boolean, Integer, SmallInteger, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.colonnes import date_creation, horodatage_optionnel, pg_enum, uuid_pk
from app.models.enums import RoleUtilisateur


class Utilisateur(Base):
    __tablename__ = "utilisateurs"

    id: Mapped[uuid.UUID] = uuid_pk()
    nom_complet: Mapped[str] = mapped_column(String(150))
    email: Mapped[str] = mapped_column(String(150), unique=True)
    mot_de_passe_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[RoleUtilisateur] = mapped_column(
        pg_enum(RoleUtilisateur, "role_utilisateur_enum"), server_default="CONSULTANT"
    )
    est_actif: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    derniere_connexion: Mapped[datetime | None] = horodatage_optionnel()
    date_creation: Mapped[datetime] = date_creation()


class CompteurDocument(Base):
    """Compteur PREFIXE-AAAA-NNNN, incrémenté dans la transaction de la pièce."""

    __tablename__ = "compteurs_documents"

    prefixe: Mapped[str] = mapped_column(String(10), primary_key=True)
    annee: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    dernier_numero: Mapped[int] = mapped_column(Integer, server_default=text("0"))
