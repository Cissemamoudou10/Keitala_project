"""Opérations de trésorerie (Sprint 6) : dépenses, transferts, clôtures, journal, contrôle."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import BaseModel, Field, model_validator
from pydantic_core import PydanticCustomError

from app.models.enums import StatutDocument, TypeFluxTresorerie
from app.schemas.pieces import MontantFcfa, Reference

# Montant constaté d'une caisse : peut être nul (tiroir vide), jamais négatif
MontantCompte = Annotated[Decimal, Field(ge=0, max_digits=13, decimal_places=0)]


class CategorieLecture(BaseModel):
    id: int
    nom: str
    description: str | None


# --- Dépenses (US-TRES-02) -----------------------------------------------------------


class DepenseCreation(BaseModel):
    cle_idempotence: uuid.UUID
    categorie_id: int
    compte_id: int
    date_depense: date | None = None
    designation: Annotated[str, Field(min_length=2, max_length=255)]
    montant: MontantFcfa
    # N° de transaction Mobile Money ou de chèque, saisi à la main (règle 7)
    reference_paiement: Reference | None = None
    # N° du reçu, de la facture du prestataire…
    piece_justificative: Reference | None = None


class DepenseLecture(BaseModel):
    id: uuid.UUID
    numero: str
    date_depense: date
    categorie_id: int
    categorie: str
    compte_id: int
    compte: str
    designation: str
    montant: Decimal
    reference_paiement: str | None
    piece_justificative: str | None
    statut: StatutDocument
    auteur: str
    date_creation: datetime
    annule_le: datetime | None
    annule_par: str | None
    motif_annulation: str | None
    controle_le: datetime | None
    controle_par: str | None


# --- Transferts (US-TRES-03) ---------------------------------------------------------


class TransfertCreation(BaseModel):
    cle_idempotence: uuid.UUID
    compte_source_id: int
    compte_destination_id: int
    montant: MontantFcfa
    date_transfert: date | None = None
    libelle: Annotated[str, Field(max_length=255)] | None = None
    reference_paiement: Reference | None = None

    @model_validator(mode="after")
    def _comptes_differents(self) -> Self:
        if self.compte_source_id == self.compte_destination_id:
            raise PydanticCustomError("comptes_identiques", "Choisissez deux comptes différents.")
        return self


class TransfertLecture(BaseModel):
    id: uuid.UUID
    numero: str
    date_transfert: date
    compte_source_id: int
    compte_source: str
    compte_destination_id: int
    compte_destination: str
    montant: Decimal
    libelle: str | None
    reference_paiement: str | None
    auteur: str
    date_creation: datetime
    controle_le: datetime | None
    controle_par: str | None


# --- Clôtures (US-TRES-04) -----------------------------------------------------------


class PreparationCloture(BaseModel):
    """Récapitulatif du jour, calculé depuis le journal du compte."""

    compte_id: int
    compte: str
    date_cloture: date
    solde_ouverture: Decimal
    total_entrees: Decimal
    total_sorties: Decimal
    solde_theorique: Decimal
    # Déjà clôturé ce jour-là : une seule clôture par compte et par jour
    deja_cloturee: bool


class ClotureCreation(BaseModel):
    compte_id: int
    date_cloture: date | None = None
    solde_physique: MontantCompte
    # Obligatoire quand le compté diffère du théorique
    commentaire: Annotated[str, Field(max_length=1000)] | None = None


class ClotureLecture(BaseModel):
    id: uuid.UUID
    compte_id: int
    compte: str
    date_cloture: date
    solde_ouverture: Decimal
    total_entrees: Decimal
    total_sorties: Decimal
    solde_theorique: Decimal
    solde_physique: Decimal
    ecart: Decimal
    commentaire: str | None
    auteur: str
    date_creation: datetime
    controle_le: datetime | None
    controle_par: str | None


# --- Journal et synthèse (US-TRES-01) ------------------------------------------------


class EcritureLecture(BaseModel):
    id: int
    date_transaction: datetime
    compte_id: int
    compte: str
    type_flux: TypeFluxTresorerie
    sens: Literal["CREDIT", "DEBIT"]
    montant: Decimal
    solde_avant: Decimal
    solde_apres: Decimal
    libelle: str
    # Numéro de la pièce d'origine (FAC-…, ACH-…, DEP-…, TRF-…) ; None pour un solde
    # d'ouverture ou une clôture
    piece: str | None
    auteur: str


class SyntheseTresorerie(BaseModel):
    solde_global: Decimal
    total_creances: Decimal
    total_dettes: Decimal


# --- Contrôle a posteriori (US-TRES-05) ----------------------------------------------

TypeControle = Literal["depense", "transfert", "inventaire", "cloture"]


class PieceAControler(BaseModel):
    type: TypeControle
    id: uuid.UUID
    numero: str
    date: date
    resume: str
    montant: Decimal | None
    auteur: str
    date_creation: datetime


class NombreAControler(BaseModel):
    total: int
    par_type: dict[str, int]
