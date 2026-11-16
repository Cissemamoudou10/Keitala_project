"""Schémas communs aux pièces commerciales (achats, ventes)."""

import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field

from app.models.enums import StatutDocument
from app.schemas.stocks import ArticleResume

QuantiteSaisie = Annotated[Decimal, Field(gt=0, max_digits=15, decimal_places=3)]
# FCFA sans centimes (AGENTS.md, section 1)
PrixFcfa = Annotated[Decimal, Field(ge=0, max_digits=13, decimal_places=0)]
MontantFcfa = Annotated[Decimal, Field(gt=0, max_digits=13, decimal_places=0)]
Reference = Annotated[str, Field(max_length=100)]


class ReglementSaisie(BaseModel):
    compte_id: int
    montant: MontantFcfa
    # N° de transaction Mobile Money, de chèque… : saisi à la main, facultatif (règle 7)
    reference_paiement: Reference | None = None


class PaiementCreation(BaseModel):
    """Règlement ultérieur d'une pièce : dette fournisseur ou créance client."""

    cle_idempotence: uuid.UUID
    compte_id: int
    montant: MontantFcfa
    reference_paiement: Reference | None = None


class Annulation(BaseModel):
    motif: Annotated[str, Field(min_length=3, max_length=255)]


class LigneLecture(BaseModel):
    id: int
    article: ArticleResume
    unite: str
    facteur_conversion: Decimal
    quantite: Decimal
    prix_unitaire: Decimal
    quantite_base: Decimal
    montant_total: Decimal


class ReglementLecture(BaseModel):
    id: uuid.UUID
    compte_id: int
    compte: str
    montant: Decimal
    date_reglement: date
    reference_paiement: str | None
    statut: StatutDocument
    auteur: str
