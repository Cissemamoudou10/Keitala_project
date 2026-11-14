import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Self

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from app.models.enums import FamilleArticle


def _sku(valeur: str) -> str:
    sku = valeur.strip().upper()
    if not sku or not all(c.isascii() and (c.isalnum() or c == "-") for c in sku):
        raise PydanticCustomError(
            "sku_invalide",
            "Code article : lettres, chiffres et tirets seulement (ex. KN-SOJ-CAF200).",
        )
    return sku


def _texte_ou_rien(valeur: str | None) -> str | None:
    return valeur.strip() or None if valeur is not None else None


CodeSku = Annotated[str, Field(min_length=2, max_length=50), AfterValidator(_sku)]
Designation = Annotated[str, Field(min_length=2, max_length=200)]
UniteBase = Annotated[str, Field(min_length=1, max_length=20)]
CodeCategorie = Annotated[
    str, Field(max_length=10), AfterValidator(lambda v: v.strip().upper() or None)
]
Contenance = Annotated[str, Field(max_length=50), AfterValidator(_texte_ou_rien)]
# Seuil en unité de base, 3 décimales (DECIMAL(15, 3)) ; prix en FCFA sans centimes
Seuil = Annotated[Decimal, Field(ge=0, max_digits=15, decimal_places=3)]
PrixFcfa = Annotated[Decimal, Field(ge=0, max_digits=13, decimal_places=0)]
Facteur = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=4)]


class UniteLecture(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    libelle: str
    facteur_vers_base: Decimal


class ArticleLecture(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code_sku: str
    designation: str
    famille: FamilleArticle
    categorie_code: str | None
    contenance: str | None
    unite_base: str
    # Tenus par le système (mouvements de stock), jamais saisis
    stock_actuel: Decimal
    cout_moyen: Decimal
    stock_minimum: Decimal
    prix_vente_standard: Decimal
    autoriser_stock_negatif: bool
    est_actif: bool
    date_creation: datetime
    unites: list[UniteLecture]


class ArticleCreation(BaseModel):
    code_sku: CodeSku
    designation: Designation
    famille: FamilleArticle
    categorie_code: CodeCategorie | None = None
    contenance: Contenance | None = None
    unite_base: UniteBase
    stock_minimum: Seuil = Decimal(0)
    prix_vente_standard: PrixFcfa = Decimal(0)
    # Dérogation à la règle du stock négatif : Super Admin seulement (règle 2)
    autoriser_stock_negatif: bool = False


class ArticleModification(BaseModel):
    """Champs absents inchangés. Stock et coût moyen ne se modifient jamais ici."""

    code_sku: CodeSku | None = None
    designation: Designation | None = None
    famille: FamilleArticle | None = None
    categorie_code: CodeCategorie | None = None
    contenance: Contenance | None = None
    unite_base: UniteBase | None = None
    stock_minimum: Seuil | None = None
    prix_vente_standard: PrixFcfa | None = None
    autoriser_stock_negatif: bool | None = None
    est_actif: bool | None = None


class UniteSaisie(BaseModel):
    """Une unité de saisie ; `id` absent = nouvelle unité."""

    id: int | None = None
    libelle: Annotated[str, Field(min_length=1, max_length=50)]
    facteur_vers_base: Facteur


class UnitesArticle(BaseModel):
    """Liste complète des unités de saisie : celles qui n'y figurent plus sont retirées."""

    unites: list[UniteSaisie]

    @model_validator(mode="after")
    def _libelles_uniques(self) -> Self:
        vus: set[str] = set()
        for unite in self.unites:
            cle = unite.libelle.strip().lower()
            if cle in vus:
                raise PydanticCustomError(
                    "unite_en_double", f"L'unité « {unite.libelle.strip()} » figure deux fois."
                )
            vus.add(cle)
        return self
