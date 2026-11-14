import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field

from app.models.enums import FamilleArticle, MotifEcart, StatutInventaire, TypeMouvementStock
from app.schemas.articles import UniteLecture

# Quantités en unité de base : 3 décimales (DECIMAL(15, 3)) ; coûts : 4 décimales
QuantitePositive = Annotated[Decimal, Field(gt=0, max_digits=15, decimal_places=3)]
QuantiteComptee = Annotated[Decimal, Field(ge=0, max_digits=15, decimal_places=3)]
CoutUnitaire = Annotated[Decimal, Field(ge=0, max_digits=15, decimal_places=4)]
Commentaire = Annotated[str, Field(max_length=255)]


class ArticleResume(BaseModel):
    id: uuid.UUID
    code_sku: str
    designation: str
    contenance: str | None
    unite_base: str


# --- Pertes (US-STK-06) --------------------------------------------------------------


class PerteCreation(BaseModel):
    article_id: uuid.UUID
    # Dans l'unité de saisie choisie (unité de base si `unite_id` est absent)
    quantite: QuantitePositive
    unite_id: int | None = None
    motif: MotifEcart
    commentaire: Commentaire | None = None


# --- Journal (US-STK-05) -------------------------------------------------------------


class MouvementLecture(BaseModel):
    id: int
    date_mouvement: datetime
    article: ArticleResume
    type_mouvement: TypeMouvementStock
    quantite: Decimal
    cout_unitaire: Decimal
    stock_avant: Decimal
    stock_apres: Decimal
    reference_document: str | None
    motif: str | None
    auteur: str


# --- Synthèse (US-STK-02, US-STK-03) -------------------------------------------------


class SyntheseFamille(BaseModel):
    famille: FamilleArticle
    nombre_articles: int
    valeur: Decimal
    nombre_sous_seuil: int


class EtatGlobal(BaseModel):
    familles: list[SyntheseFamille]
    valeur_totale: Decimal
    nombre_sous_seuil: int


# --- Inventaires (US-STK-04) ---------------------------------------------------------


class InventaireOuverture(BaseModel):
    # Absent : toutes les familles
    famille: FamilleArticle | None = None
    observations: Annotated[str, Field(max_length=1000)] | None = None


class LigneComptage(BaseModel):
    article_id: uuid.UUID
    stock_physique: QuantiteComptee
    motif: MotifEcart | None = None
    commentaire: Commentaire | None = None
    # Coût de l'excédent, exigé pour un article encore sans coût moyen (stock de départ)
    cout_unitaire: CoutUnitaire | None = None


class Comptage(BaseModel):
    """Lignes comptées : seules celles envoyées sont modifiées."""

    lignes: list[LigneComptage] = []
    observations: Annotated[str, Field(max_length=1000)] | None = None


class Abandon(BaseModel):
    """Abandon d'un inventaire en cours (P-018) : aucun ajustement n'est écrit."""

    motif: Annotated[str, Field(min_length=3, max_length=255)]


class LigneInventaireLecture(BaseModel):
    id: int
    article: ArticleResume
    cout_moyen: Decimal
    unites: list[UniteLecture]
    stock_theorique: Decimal
    stock_physique: Decimal
    ecart: Decimal
    motif: MotifEcart | None
    commentaire: str | None
    cout_unitaire: Decimal | None


class InventaireResume(BaseModel):
    id: uuid.UUID
    numero: str
    date_inventaire: date
    famille: FamilleArticle | None
    statut: StatutInventaire
    observations: str | None
    auteur: str
    date_creation: datetime
    valide_le: datetime | None
    controle_le: datetime | None
    nombre_lignes: int
    nombre_ecarts: int


class InventaireDetail(InventaireResume):
    lignes: list[LigneInventaireLecture]
