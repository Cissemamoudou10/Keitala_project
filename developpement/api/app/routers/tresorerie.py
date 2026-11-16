import uuid
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependances import ACCES_METIER, exiger_roles
from app.db.session import get_db
from app.models import Utilisateur
from app.models.enums import RoleUtilisateur, TypeFluxTresorerie
from app.schemas.common import PageReponse, PaginationParams
from app.schemas.depenses import (
    CategorieLecture,
    ClotureCreation,
    ClotureLecture,
    DepenseCreation,
    DepenseLecture,
    EcritureLecture,
    PreparationCloture,
    SyntheseTresorerie,
    TransfertCreation,
    TransfertLecture,
)
from app.schemas.pieces import Annulation
from app.schemas.tresorerie import (
    CompteCreation,
    CompteLecture,
    CompteModification,
    SoldeOuverture,
)
from app.services import clotures, depenses, journal, transferts
from app.services import tresorerie as service

# Comptes : consultés par tous, paramétrés par le Super Admin (matrice des droits)
router = APIRouter(prefix="/tresorerie", tags=["Trésorerie"], dependencies=ACCES_METIER)

Session = Annotated[AsyncSession, Depends(get_db)]
SuperAdmin = Annotated[Utilisateur, Depends(exiger_roles(RoleUtilisateur.SUPER_ADMIN))]


@router.get("/comptes", summary="Comptes et soldes")
async def lister_comptes(session: Session) -> list[CompteLecture]:
    return await service.lister_comptes(session)


@router.post(
    "/comptes", status_code=status.HTTP_201_CREATED, summary="Ajout d'un compte (Super Admin)"
)
async def creer_compte(
    donnees: CompteCreation, session: Session, _admin: SuperAdmin
) -> CompteLecture:
    return await service.creer_compte(session, donnees)


@router.put("/comptes/{compte_id}", summary="Renommer, activer ou désactiver (Super Admin)")
async def modifier_compte(
    compte_id: int, donnees: CompteModification, session: Session, _admin: SuperAdmin
) -> CompteLecture:
    return await service.modifier_compte(session, compte_id, donnees)


@router.post(
    "/comptes/{compte_id}/solde-ouverture",
    summary="Solde d'ouverture, saisi une seule fois (Super Admin)",
)
async def saisir_solde_ouverture(
    compte_id: int, donnees: SoldeOuverture, session: Session, admin: SuperAdmin
) -> CompteLecture:
    return await service.saisir_solde_ouverture(session, compte_id, donnees.montant, admin.id)


# --- Opérations (Sprint 6) : saisies du Gestionnaire, consultées par tous ------------

Gestionnaire = Annotated[Utilisateur, Depends(exiger_roles(RoleUtilisateur.GESTIONNAIRE))]
Pagination = Annotated[PaginationParams, Depends()]
DEJA_ENREGISTRE: dict[int | str, dict[str, Any]] = {
    200: {"description": "Déjà enregistré avec cette clé (nouvel envoi)"}
}


def _page[T](
    elements: list[T], total: int, pages: int, pagination: PaginationParams
) -> PageReponse[T]:
    return PageReponse(
        items=elements,
        total=total,
        page=pagination.page,
        taille=pagination.taille,
        pages_total=pages,
    )


@router.get("/synthese", summary="Solde global, créances clients et dettes fournisseurs")
async def synthese(session: Session) -> SyntheseTresorerie:
    return await journal.synthese(session)


@router.get("/journal", summary="Journal des écritures, avec la pièce d'origine")
async def lister_journal(
    session: Session,
    pagination: Pagination,
    compte_id: int | None = None,
    type_flux: TypeFluxTresorerie | None = None,
    du: date | None = None,
    au: date | None = None,
) -> PageReponse[EcritureLecture]:
    ecritures, total, pages = await journal.lister_ecritures(
        session, pagination, compte_id=compte_id, type_flux=type_flux, du=du, au=au
    )
    return _page(ecritures, total, pages, pagination)


@router.get("/categories-depense", summary="Catégories de dépenses")
async def lister_categories(session: Session) -> list[CategorieLecture]:
    return await depenses.lister_categories(session)


@router.get("/depenses", summary="Dépenses, filtrées par catégorie, compte et période")
async def lister_depenses(
    session: Session,
    pagination: Pagination,
    categorie_id: int | None = None,
    compte_id: int | None = None,
    du: date | None = None,
    au: date | None = None,
    recherche: Annotated[str | None, Query(max_length=100)] = None,
) -> PageReponse[DepenseLecture]:
    elements, total, pages = await depenses.lister_depenses(
        session,
        pagination,
        categorie_id=categorie_id,
        compte_id=compte_id,
        du=du,
        au=au,
        recherche=recherche,
    )
    return _page(elements, total, pages, pagination)


@router.post(
    "/depenses",
    status_code=status.HTTP_201_CREATED,
    summary="Dépense (débit du compte payeur)",
    responses=DEJA_ENREGISTRE,
)
async def creer_depense(
    donnees: DepenseCreation, session: Session, auteur: Gestionnaire, response: Response
) -> DepenseLecture:
    depense, creee = await depenses.creer_depense(session, donnees, auteur)
    if not creee:
        response.status_code = status.HTTP_200_OK
    return depense


@router.get("/depenses/{depense_id}", summary="Détail d'une dépense")
async def lire_depense(depense_id: uuid.UUID, session: Session) -> DepenseLecture:
    return await depenses.lire_depense(session, depense_id)


@router.post("/depenses/{depense_id}/annuler", summary="Annulation avec contre-passation")
async def annuler_depense(
    depense_id: uuid.UUID, donnees: Annulation, session: Session, auteur: Gestionnaire
) -> DepenseLecture:
    return await depenses.annuler_depense(session, depense_id, donnees.motif, auteur)


@router.get("/transferts", summary="Transferts entre comptes")
async def lister_transferts(
    session: Session,
    pagination: Pagination,
    compte_id: int | None = None,
    du: date | None = None,
    au: date | None = None,
) -> PageReponse[TransfertLecture]:
    elements, total, pages = await transferts.lister_transferts(
        session, pagination, compte_id=compte_id, du=du, au=au
    )
    return _page(elements, total, pages, pagination)


@router.post(
    "/transferts",
    status_code=status.HTTP_201_CREATED,
    summary="Transfert entre deux comptes (débit et crédit ensemble)",
    responses=DEJA_ENREGISTRE,
)
async def creer_transfert(
    donnees: TransfertCreation, session: Session, auteur: Gestionnaire, response: Response
) -> TransfertLecture:
    transfert, cree = await transferts.creer_transfert(session, donnees, auteur)
    if not cree:
        response.status_code = status.HTTP_200_OK
    return transfert


@router.get("/clotures", summary="Clôtures journalières")
async def lister_clotures(
    session: Session,
    pagination: Pagination,
    compte_id: int | None = None,
    du: date | None = None,
    au: date | None = None,
) -> PageReponse[ClotureLecture]:
    elements, total, pages = await clotures.lister_clotures(
        session, pagination, compte_id=compte_id, du=du, au=au
    )
    return _page(elements, total, pages, pagination)


@router.get("/clotures/preparation", summary="Récapitulatif du jour avant la clôture")
async def preparer_cloture(
    session: Session, compte_id: int, date_cloture: date | None = None
) -> PreparationCloture:
    return await clotures.preparer_cloture(session, compte_id, date_cloture)


@router.post(
    "/clotures", status_code=status.HTTP_201_CREATED, summary="Clôture journalière d'un compte"
)
async def cloturer(
    donnees: ClotureCreation, session: Session, auteur: Gestionnaire
) -> ClotureLecture:
    return await clotures.cloturer(session, donnees, auteur)
