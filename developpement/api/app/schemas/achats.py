import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field

from app.models.enums import StatutDocument
from app.schemas.pieces import (
    Annulation,
    LigneLecture,
    PaiementCreation,
    PrixFcfa,
    QuantiteSaisie,
    Reference,
    ReglementLecture,
    ReglementSaisie,
)

__all__ = ["Annulation", "PaiementCreation", "ReglementLecture", "ReglementSaisie"]


class LigneAchatCreation(BaseModel):
    article_id: uuid.UUID
    # Unité de saisie (sac…) ; absente = unité de base (US-REF-02)
    unite_id: int | None = None
    quantite: QuantiteSaisie
    # Prix par unité saisie (le sac, ou le kg)
    prix_unitaire: PrixFcfa


class AchatCreation(BaseModel):
    # Générée par le formulaire à son ouverture : un second envoi ne crée pas de doublon
    cle_idempotence: uuid.UUID
    fournisseur_id: uuid.UUID | None = None
    fournisseur_nom_libre: Annotated[str, Field(max_length=150)] | None = None
    numero_facture_fournisseur: Reference | None = None
    date_achat: date | None = None
    notes: Annotated[str, Field(max_length=1000)] | None = None
    lignes: Annotated[list[LigneAchatCreation], Field(min_length=1)]
    # Aucun règlement, ou moins que le total : achat à crédit (fournisseur exigé)
    reglements: list[ReglementSaisie] = []


LigneAchatLecture = LigneLecture


class AchatResume(BaseModel):
    id: uuid.UUID
    numero: str
    numero_facture_fournisseur: str | None
    date_achat: date
    fournisseur_id: uuid.UUID | None
    # Nom du fournisseur du répertoire, ou nom saisi librement
    fournisseur: str | None
    montant_total: Decimal
    montant_regle: Decimal
    reste_a_payer: Decimal
    # Comptes des règlements valides (« Caisse », « Wave »…) : le mode de règlement
    comptes: list[str]
    statut: StatutDocument
    date_creation: datetime


class AchatDetail(AchatResume):
    notes: str | None
    auteur: str
    annule_le: datetime | None
    annule_par: str | None
    motif_annulation: str | None
    lignes: list[LigneLecture]
    reglements: list[ReglementLecture]
