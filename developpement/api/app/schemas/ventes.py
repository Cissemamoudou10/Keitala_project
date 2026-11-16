import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field

from app.models.enums import StatutDocument
from app.schemas.pieces import (
    LigneLecture,
    PrixFcfa,
    QuantiteSaisie,
    ReglementLecture,
    ReglementSaisie,
)

Texte150 = Annotated[str, Field(min_length=1, max_length=150)]


class LigneVenteCreation(BaseModel):
    article_id: uuid.UUID
    # Unité de saisie (sac…) ; absente = unité de base (US-REF-02)
    unite_id: int | None = None
    quantite: QuantiteSaisie
    # Prix par unité saisie ; pré-rempli par l'écran, modifiable (US-VTE-01)
    prix_unitaire: PrixFcfa


class VenteCreation(BaseModel):
    # Générée par le formulaire à son ouverture : un second envoi ne crée pas de doublon
    cle_idempotence: uuid.UUID
    client_id: uuid.UUID | None = None
    # Client de passage : nom facultatif (« Client comptoir » si vide)
    client_nom_libre: Annotated[str, Field(max_length=150)] | None = None
    date_vente: date | None = None
    notes: Annotated[str, Field(max_length=1000)] | None = None
    lignes: Annotated[list[LigneVenteCreation], Field(min_length=1)]
    # Aucun règlement, ou moins que le total : vente à crédit (client exigé)
    reglements: list[ReglementSaisie] = []


class LigneDonCreation(BaseModel):
    article_id: uuid.UUID
    unite_id: int | None = None
    quantite: QuantiteSaisie


class DonCreation(BaseModel):
    """Don, échantillon ou dégustation (US-VTE-04) : stock sorti, montant nul."""

    cle_idempotence: uuid.UUID
    beneficiaire: Texte150
    motif: Annotated[str, Field(min_length=3, max_length=255)]
    date_vente: date | None = None
    lignes: Annotated[list[LigneDonCreation], Field(min_length=1)]


class VenteResume(BaseModel):
    id: uuid.UUID
    # FAC-AAAA-NNNN, ou DON-AAAA-NNNN pour un don
    numero: str
    date_vente: date
    client_id: uuid.UUID | None
    # Client du répertoire, nom saisi, ou bénéficiaire du don ; None = client comptoir
    client: str | None
    est_don: bool
    montant_total: Decimal
    montant_regle: Decimal
    reste_a_payer: Decimal
    # Comptes des règlements valides (« Caisse », « Wave »…) : le mode de règlement
    comptes: list[str]
    statut: StatutDocument
    date_creation: datetime


class VenteDetail(VenteResume):
    client_telephone: str | None
    client_adresse: str | None
    motif_don: str | None
    notes: str | None
    auteur: str
    annule_le: datetime | None
    annule_par: str | None
    motif_annulation: str | None
    lignes: list[LigneLecture]
    reglements: list[ReglementLecture]
