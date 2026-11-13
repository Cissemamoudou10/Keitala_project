import uuid
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import RoleUtilisateur


def _normaliser_email(email: str) -> str:
    # Un même email ne doit pas exister deux fois à la casse près
    return email.strip().lower()


Email = Annotated[EmailStr, AfterValidator(_normaliser_email)]
NomComplet = Annotated[str, Field(min_length=2, max_length=150)]
# 8 caractères au moins ; pas d'autre règle pour rester utilisable par tous (charte, §1)
MotDePasse = Annotated[str, Field(min_length=8, max_length=128)]


class UtilisateurLecture(BaseModel):
    """Profil d'un utilisateur. Le hash du mot de passe ne sort jamais de l'API."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nom_complet: str
    email: str
    role: RoleUtilisateur
    est_actif: bool
    derniere_connexion: datetime | None
    date_creation: datetime


class UtilisateurCreation(BaseModel):
    nom_complet: NomComplet
    email: Email
    # Le type énuméré interdit tout rôle autre que les trois rôles définis (US-AUTH-02)
    role: RoleUtilisateur
    mot_de_passe: MotDePasse


class UtilisateurModification(BaseModel):
    """Champs modifiables ; les champs absents restent inchangés."""

    nom_complet: NomComplet | None = None
    email: Email | None = None
    role: RoleUtilisateur | None = None
    est_actif: bool | None = None
    # Réinitialisation du mot de passe par le Super Admin
    mot_de_passe: MotDePasse | None = None
