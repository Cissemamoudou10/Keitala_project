import uuid
from datetime import date, datetime
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


class LigneAchatCreation(BaseModel):
    article_id: uuid.UUID
    # Unité de saisie (sac…) ; absente = unité de base (US-REF-02)
    unite_id: int | None = None
    quantite: QuantiteSaisie
    # Prix par unité saisie (le sac, ou le kg)
    prix_unitaire: PrixFcfa


class ReglementSaisie(BaseModel):
    compte_id: int
    montant: MontantFcfa
    # N° de transaction Mobile Money, de chèque… : saisi à la main, facultatif (règle 7)
    reference_paiement: Reference | None = None


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


class PaiementCreation(BaseModel):
    """Paiement ultérieur d'une dette fournisseur (US-ACH-03)."""

    cle_idempotence: uuid.UUID
    compte_id: int
    montant: MontantFcfa
    reference_paiement: Reference | None = None


class Annulation(BaseModel):
    motif: Annotated[str, Field(min_length=3, max_length=255)]


class LigneAchatLecture(BaseModel):
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
    lignes: list[LigneAchatLecture]
    reglements: list[ReglementLecture]
