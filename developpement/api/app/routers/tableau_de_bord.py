"""Tableau de bord, marges et exports Excel (US-DASH-01 à 03) : lecture, tous les rôles."""

from collections.abc import Awaitable, Callable, Sequence
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependances import ACCES_METIER
from app.core.excel import TYPES_MIME, Cellule, classeur
from app.db.session import get_db
from app.models.enums import FamilleArticle
from app.schemas.common import PaginationParams
from app.schemas.tableau_de_bord import Indicateurs, RapportMarges
from app.services import articles as service_articles
from app.services import journal as service_journal
from app.services import tableau_de_bord as service
from app.services import ventes as service_ventes
from app.services.pieces import aujourd_hui

router = APIRouter(tags=["Pilotage"], dependencies=ACCES_METIER)

Session = Annotated[AsyncSession, Depends(get_db)]

LIBELLES_FAMILLES = {
    FamilleArticle.SEMENCE: "Semences",
    FamilleArticle.INTRANT: "Intrants",
    FamilleArticle.MATIERE_PREMIERE: "Matières premières",
    FamilleArticle.SEMI_FINI: "Produits en vrac",
    FamilleArticle.EMBALLAGE: "Emballages",
    FamilleArticle.PRODUIT_FINI: "Produits finis",
}


@router.get("/tableau-de-bord/indicateurs", summary="Chiffres clés, ventes sur 30 jours, à traiter")
async def indicateurs(session: Session) -> Indicateurs:
    return await service.indicateurs(session)


@router.get("/tableau-de-bord/marges", summary="Marge brute par article vendu")
async def marges(session: Session, du: date | None = None, au: date | None = None) -> RapportMarges:
    return await service.marges(session, du, au)


# --- Exports Excel (US-DASH-03) ------------------------------------------------------


async def _tout[T](
    lire_page: Callable[[PaginationParams], Awaitable[tuple[list[T], int, int]]],
) -> list[T]:
    """Toutes les pages d'une liste (exports : 200 lignes par appel)."""
    elements: list[T] = []
    page = 1
    while True:
        lot, _total, pages = await lire_page(PaginationParams(page=page, taille=200))
        elements.extend(lot)
        if page >= pages:
            return elements
        page += 1


def _fichier(
    nom: str, feuille: str, entetes: Sequence[str], lignes: list[list[Cellule]]
) -> Response:
    return Response(
        content=classeur(feuille, entetes, lignes),
        media_type=TYPES_MIME,
        headers={
            "Content-Disposition": f'attachment; filename="{nom}-{aujourd_hui().isoformat()}.xlsx"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/exports/stocks.xlsx", summary="État des stocks valorisé (Excel)")
async def exporter_stocks(session: Session, famille: FamilleArticle | None = None) -> Response:
    articles = await _tout(lambda p: service_articles.lister_articles(session, p, famille=famille))
    return _fichier(
        "etat-des-stocks",
        "État des stocks",
        ["Code", "Article", "Famille", "Unité", "Stock", "Seuil", "Coût moyen", "Valeur FCFA"],
        [
            [
                a.code_sku,
                f"{a.designation} {a.contenance or ''}".strip(),
                LIBELLES_FAMILLES[a.famille],
                a.unite_base,
                a.stock_actuel,
                a.stock_minimum,
                a.cout_moyen,
                (a.stock_actuel * a.cout_moyen).quantize(1),
            ]
            for a in articles
        ],
    )


@router.get("/exports/journal.xlsx", summary="Journal de trésorerie (Excel)")
async def exporter_journal(
    session: Session, compte_id: int | None = None, du: date | None = None, au: date | None = None
) -> Response:
    ecritures = await _tout(
        lambda p: service_journal.lister_ecritures(session, p, compte_id=compte_id, du=du, au=au)
    )
    return _fichier(
        "journal-tresorerie",
        "Journal",
        [
            "Date",
            "Compte",
            "Opération",
            "Pièce",
            "Entrée FCFA",
            "Sortie FCFA",
            "Solde après",
            "Auteur",
        ],
        [
            [
                e.date_transaction,
                e.compte,
                e.libelle,
                e.piece,
                e.montant if e.sens == "CREDIT" else None,
                e.montant if e.sens == "DEBIT" else None,
                e.solde_apres,
                e.auteur,
            ]
            for e in ecritures
        ],
    )


@router.get("/exports/ventes.xlsx", summary="Historique des ventes et des dons (Excel)")
async def exporter_ventes(
    session: Session,
    type: Literal["ventes", "dons"] | None = None,  # noqa: A002 (nom du paramètre d'adresse)
    du: date | None = None,
    au: date | None = None,
) -> Response:
    ventes = await _tout(
        lambda p: service_ventes.lister_ventes(session, p, type_piece=type, du=du, au=au)
    )
    return _fichier(
        "ventes",
        "Ventes",
        ["Date", "N°", "Client", "Nature", "Montant FCFA", "Encaissé", "Reste", "Comptes", "État"],
        [
            [
                v.date_vente,
                v.numero,
                v.client or "Client comptoir",
                "Don" if v.est_don else "Vente",
                v.montant_total,
                v.montant_regle,
                v.reste_a_payer,
                ", ".join(v.comptes),
                "Annulée" if v.statut == "ANNULE" else "Validée",
            ]
            for v in ventes
        ],
    )


@router.get("/exports/marges.xlsx", summary="Marges par article (Excel)")
async def exporter_marges(
    session: Session, du: date | None = None, au: date | None = None
) -> Response:
    rapport = await service.marges(session, du, au)
    return _fichier(
        "marges",
        "Marges",
        [
            "Article",
            "Unité",
            "Quantité vendue",
            "CA FCFA",
            "Coût de revient",
            "Marge FCFA",
            "Marge %",
        ],
        [
            [
                f"{m.article.designation} {m.article.contenance or ''}".strip(),
                m.article.unite_base,
                m.quantite_vendue,
                m.chiffre_affaires,
                m.cout_de_revient,
                m.marge,
                m.taux_marge,
            ]
            for m in rapport.articles
        ],
    )
