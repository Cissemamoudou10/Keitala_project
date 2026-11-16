"""Production en deux étapes (Sprint 7, règle 8) : recettes et ordres de fabrication."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Self

from pydantic import BaseModel, Field, model_validator
from pydantic_core import PydanticCustomError

from app.models.enums import StatutOf, TypeOf
from app.schemas.stocks import ArticleResume

QuantiteRecette = Annotated[Decimal, Field(gt=0, max_digits=15, decimal_places=4)]
QuantiteProduite = Annotated[Decimal, Field(gt=0, max_digits=15, decimal_places=3)]
QuantiteConsommee = Annotated[Decimal, Field(ge=0, max_digits=15, decimal_places=4)]
Pertes = Annotated[Decimal, Field(ge=0, max_digits=15, decimal_places=3)]
Texte = Annotated[str, Field(max_length=2000)]


# --- Recettes (US-PROD-01) -----------------------------------------------------------


class ComposantSaisie(BaseModel):
    article_id: uuid.UUID
    # En unité de base du composant, pour `quantite_base_produite` du produit
    quantite: QuantiteRecette


class RecetteSaisie(BaseModel):
    type_of: TypeOf
    article_produit_id: uuid.UUID
    nom_recette: Annotated[str, Field(min_length=2, max_length=150)]
    # Quantité de produit obtenue avec les quantités de composants : 100 kg de vrac, 1 sachet…
    quantite_base_produite: Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=3)]
    notes_preparation: Texte | None = None
    composants: Annotated[list[ComposantSaisie], Field(min_length=1)]

    @model_validator(mode="after")
    def _composants_distincts(self) -> Self:
        ids = [c.article_id for c in self.composants]
        if len(set(ids)) != len(ids):
            raise PydanticCustomError(
                "composant_en_double", "Un même composant figure deux fois : regroupez-le."
            )
        if self.article_produit_id in ids:
            raise PydanticCustomError(
                "produit_composant", "Le produit ne peut pas être son propre composant."
            )
        return self


class RecetteModification(RecetteSaisie):
    est_active: bool = True


class ComposantLecture(BaseModel):
    article: ArticleResume
    quantite: Decimal


class RecetteLecture(BaseModel):
    id: uuid.UUID
    type_of: TypeOf
    produit: ArticleResume
    nom_recette: str
    quantite_base_produite: Decimal
    notes_preparation: str | None
    est_active: bool
    composants: list[ComposantLecture]
    date_creation: datetime


# --- Ordres de fabrication (US-PROD-02 à 04) -----------------------------------------


class OrdreCreation(BaseModel):
    recette_id: uuid.UUID
    # Du produit principal, en son unité de base
    quantite_prevue: QuantiteProduite
    observations: Texte | None = None


class SortieCreation(BaseModel):
    """Sortie d'atelier déclarée au fil des jours (US-PROD-03)."""

    article_id: uuid.UUID
    quantite: QuantiteProduite
    date_production: date | None = None


class ConsommationReelle(BaseModel):
    article_id: uuid.UUID
    quantite: QuantiteConsommee


class Cloture(BaseModel):
    consommations: Annotated[list[ConsommationReelle], Field(min_length=1)]
    # Déchets, triage… en unité de base du produit principal
    pertes: Pertes = Decimal(0)
    observations: Texte | None = None


class AnnulationOrdre(BaseModel):
    motif: Annotated[str, Field(min_length=3, max_length=255)]


class ConsommationLecture(BaseModel):
    article: ArticleResume
    quantite_prevue: Decimal
    quantite_consommee: Decimal
    # Coût moyen au moment de la clôture ; 0 tant que l'ordre est en cours
    cout_unitaire: Decimal
    # Stock du moment et manque éventuel par rapport au prévu (alerte, US-PROD-02)
    stock_actuel: Decimal
    manque: Decimal


class SortieLecture(BaseModel):
    id: int
    article: ArticleResume
    date_production: date
    quantite: Decimal
    # Coût de revient calculé à la clôture ; 0 avant
    cout_unitaire: Decimal


class OrdreResume(BaseModel):
    id: uuid.UUID
    numero: str
    type_of: TypeOf
    recette_id: uuid.UUID
    recette: str
    produit: ArticleResume
    quantite_prevue: Decimal
    quantite_produite: Decimal
    statut: StatutOf
    date_lancement: datetime | None
    date_cloture: datetime | None
    responsable: str


class OrdreDetail(OrdreResume):
    quantite_pertes: Decimal
    observations: str | None
    consommations: list[ConsommationLecture]
    sorties: list[SortieLecture]
    # Clôturé : coût total des consommations et rendement (produit ÷ consommé)
    cout_total: Decimal | None
    rendement: Decimal | None
