import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Self

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError


def _texte_ou_rien(valeur: str | None) -> str | None:
    return valeur.strip() or None if valeur is not None else None


NomTiers = Annotated[str, Field(min_length=2, max_length=150)]
Telephone = Annotated[str, Field(max_length=50), AfterValidator(_texte_ou_rien)]
Adresse = Annotated[str, Field(max_length=500), AfterValidator(_texte_ou_rien)]


class TypeTiers(StrEnum):
    CLIENT = "client"
    FOURNISSEUR = "fournisseur"


class TiersLecture(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code_tiers: str | None
    nom: str
    telephone: str | None
    adresse: str | None
    est_client: bool
    est_fournisseur: bool
    est_actif: bool
    date_creation: datetime
    # Vue v_tiers_soldes : dû par le client, dû au fournisseur (US-REF-01)
    solde_creance: Decimal = Decimal(0)
    solde_dette: Decimal = Decimal(0)


class TiersCreation(BaseModel):
    nom: NomTiers
    telephone: Telephone | None = None
    adresse: Adresse | None = None
    est_client: bool = False
    est_fournisseur: bool = False
    # Créer malgré un tiers semblable (même nom ou même téléphone) déjà présent
    confirmer_doublon: bool = False

    @model_validator(mode="after")
    def _client_ou_fournisseur(self) -> Self:
        if not (self.est_client or self.est_fournisseur):
            raise PydanticCustomError(
                "type_tiers", "Cochez « Client », « Fournisseur », ou les deux."
            )
        return self


class TiersModification(BaseModel):
    nom: NomTiers | None = None
    telephone: Telephone | None = None
    adresse: Adresse | None = None
    est_client: bool | None = None
    est_fournisseur: bool | None = None
    est_actif: bool | None = None
