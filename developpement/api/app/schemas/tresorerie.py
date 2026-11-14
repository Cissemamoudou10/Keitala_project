from datetime import datetime
from decimal import Decimal
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from app.models.enums import TypeCompteTresorerie

# FCFA sans décimales (AGENTS.md, section 1) ; 13 chiffres au plus (DECIMAL(15, 2))
MontantFcfa = Annotated[Decimal, Field(gt=0, max_digits=13, decimal_places=0)]
NomCompte = Annotated[str, Field(min_length=2, max_length=100)]


class CompteLecture(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    nom: str
    type: TypeCompteTresorerie
    operateur: str | None
    solde_actuel: Decimal
    est_actif: bool
    date_mise_a_jour: datetime
    # Le solde d'ouverture ne se saisit qu'une fois (US-REF-03)
    solde_ouverture_saisi: bool = False


class CompteCreation(BaseModel):
    nom: NomCompte
    type: TypeCompteTresorerie
    # Obligatoire pour un compte Mobile Money, interdit sinon (contrainte de la base)
    operateur: Annotated[str, Field(min_length=2, max_length=50)] | None = None

    @model_validator(mode="after")
    def _operateur_si_mobile_money(self) -> Self:
        mobile_money = self.type == TypeCompteTresorerie.MOBILE_MONEY
        if mobile_money and not self.operateur:
            raise PydanticCustomError(
                "operateur_requis", "Indiquez l'opérateur du compte Mobile Money."
            )
        if not mobile_money and self.operateur:
            raise PydanticCustomError(
                "operateur_interdit", "Seul un compte Mobile Money a un opérateur."
            )
        return self


class CompteModification(BaseModel):
    """Le type et l'opérateur ne changent pas : on crée un autre compte."""

    nom: NomCompte | None = None
    est_actif: bool | None = None


class SoldeOuverture(BaseModel):
    montant: MontantFcfa
