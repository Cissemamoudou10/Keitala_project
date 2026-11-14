"""Mouvements de stock : écriture unique, pertes, journal, synthèse valorisée.

Règles d'AGENTS.md : 1 (unité de base), 2 (pas de stock négatif sauf dérogation),
3 (une opération = une transaction, articles verrouillés), 4 (journal immuable).
Toute variation de `stock_actuel` et de `cout_moyen` passe par `ecrire_mouvement_stock`.
"""

import uuid
from collections.abc import Iterable
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from fastapi import status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.erreurs import ErreurMetier
from app.db.pagination import paginer
from app.models import Article, ArticleUnite, MouvementStock, Utilisateur
from app.models.enums import FamilleArticle, MotifEcart, TypeMouvementStock
from app.schemas.common import PaginationParams

# Le Mali vit à l'heure UTC toute l'année ; les filtres de dates sont des jours maliens
FUSEAU = ZoneInfo("Africa/Bamako")
QUANTITE = Decimal("0.001")
COUT = Decimal("0.0001")

LIBELLES_MOTIFS = {
    MotifEcart.CASSE: "Casse",
    MotifEcart.AVARIE: "Avarie",
    MotifEcart.DESSICCATION: "Dessiccation",
    MotifEcart.ERREUR_COMPTAGE: "Erreur de comptage",
    MotifEcart.AUTRE: "Autre",
}


def formater_quantite(quantite: Decimal, unite: str) -> str:
    """« 12.000 », « sachet » → « 12 sachet(s) » pour les messages d'erreur."""
    texte = format(quantite.normalize(), "f").replace(".", ",")
    return f"{texte} {unite}"


async def verrouiller_articles(
    session: AsyncSession, ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, Article]:
    """SELECT … FOR UPDATE, toujours dans l'ordre croissant des identifiants : deux
    opérations qui touchent les mêmes articles ne peuvent pas s'interbloquer."""
    tries = sorted(set(ids))
    if not tries:
        return {}
    articles = (
        await session.execute(
            select(Article).where(Article.id.in_(tries)).order_by(Article.id).with_for_update()
        )
    ).scalars()
    trouves = {article.id: article for article in articles}
    if len(trouves) != len(tries):
        raise ErreurMetier(
            "ARTICLE_INTROUVABLE", "Un des articles n'existe pas.", status.HTTP_404_NOT_FOUND
        )
    return trouves


def nouveau_cout_moyen(
    stock: Decimal, cout_moyen: Decimal, quantite: Decimal, cout_entree: Decimal
) -> Decimal:
    """PUMP (conception technique, 3.3) : (stock × PUMP + q × coût) / (stock + q)."""
    if stock <= 0:
        # Pas de stock valorisé à pondérer (stock nul, ou négatif par dérogation)
        return cout_entree.quantize(COUT, ROUND_HALF_UP)
    total = stock + quantite
    return ((stock * cout_moyen + quantite * cout_entree) / total).quantize(COUT, ROUND_HALF_UP)


async def ecrire_mouvement_stock(
    session: AsyncSession,
    article: Article,
    *,
    type_mouvement: TypeMouvementStock,
    quantite: Decimal,
    utilisateur_id: uuid.UUID,
    cout_entree: Decimal | None = None,
    achat_id: uuid.UUID | None = None,
    vente_id: uuid.UUID | None = None,
    ordre_fabrication_id: uuid.UUID | None = None,
    inventaire_id: uuid.UUID | None = None,
    reference_document: str | None = None,
    motif: str | None = None,
) -> MouvementStock:
    """Seule fonction qui modifie un stock. L'article doit avoir été verrouillé.

    `quantite` est signée, en unité de base. `cout_entree` (entrée seulement) valorise
    l'entrée et recalcule le coût moyen ; sinon le mouvement est valorisé au coût moyen
    du moment, qui ne change pas. N'effectue pas le commit.
    """
    quantite = quantite.quantize(QUANTITE, ROUND_HALF_UP)
    if quantite == 0:
        raise ValueError("Un mouvement de stock ne peut pas être nul.")
    stock_avant = article.stock_actuel
    stock_apres = stock_avant + quantite
    if stock_apres < 0 and not article.autoriser_stock_negatif:
        nom = f"{article.designation} {article.contenance or ''}".strip()
        raise ErreurMetier(
            "STOCK_INSUFFISANT",
            f"Stock insuffisant : il reste {formater_quantite(stock_avant, article.unite_base)} "
            f"de {nom}. Réduisez la quantité.",
            status.HTTP_409_CONFLICT,
            {"article_id": str(article.id), "disponible": str(stock_avant)},
        )

    cout_unitaire = article.cout_moyen
    if cout_entree is not None and quantite > 0:
        cout_unitaire = cout_entree.quantize(COUT, ROUND_HALF_UP)
        article.cout_moyen = nouveau_cout_moyen(
            stock_avant, article.cout_moyen, quantite, cout_unitaire
        )

    mouvement = MouvementStock(
        article_id=article.id,
        type_mouvement=type_mouvement,
        quantite=quantite,
        cout_unitaire=cout_unitaire,
        stock_avant=stock_avant,
        stock_apres=stock_apres,
        achat_id=achat_id,
        vente_id=vente_id,
        ordre_fabrication_id=ordre_fabrication_id,
        inventaire_id=inventaire_id,
        reference_document=reference_document,
        motif=motif,
        utilisateur_id=utilisateur_id,
    )
    session.add(mouvement)
    article.stock_actuel = stock_apres
    await session.flush()
    return mouvement


# --- Pertes (US-STK-06) --------------------------------------------------------------


async def declarer_perte(
    session: AsyncSession,
    *,
    article_id: uuid.UUID,
    quantite: Decimal,
    unite_id: int | None,
    motif: MotifEcart,
    commentaire: str | None,
    auteur: Utilisateur,
) -> MouvementStock:
    """Sortie de stock hors inventaire, sans effet sur la trésorerie."""
    article = (await verrouiller_articles(session, [article_id]))[article_id]
    facteur = Decimal(1)
    if unite_id is not None:
        unite = await session.get(ArticleUnite, unite_id)
        if unite is None or unite.article_id != article.id:
            raise ErreurMetier(
                "UNITE_INTROUVABLE", "Cette unité n'appartient pas à l'article.", 404
            )
        facteur = unite.facteur_vers_base
    texte_motif = LIBELLES_MOTIFS[motif] + (f" : {commentaire.strip()}" if commentaire else "")
    mouvement = await ecrire_mouvement_stock(
        session,
        article,
        type_mouvement=TypeMouvementStock.SORTIE_PERTE,
        quantite=-(quantite * facteur),
        utilisateur_id=auteur.id,
        motif=texte_motif,
    )
    await session.commit()
    return mouvement


# --- Journal (US-STK-05) -------------------------------------------------------------


def _debut_du_jour(jour: date) -> datetime:
    return datetime.combine(jour, time.min, tzinfo=FUSEAU)


async def lister_mouvements(
    session: AsyncSession,
    pagination: PaginationParams,
    *,
    article_id: uuid.UUID | None = None,
    type_mouvement: TypeMouvementStock | None = None,
    du: date | None = None,
    au: date | None = None,
) -> tuple[list[MouvementStock], int, int]:
    requete = select(MouvementStock)
    if article_id is not None:
        requete = requete.where(MouvementStock.article_id == article_id)
    if type_mouvement is not None:
        requete = requete.where(MouvementStock.type_mouvement == type_mouvement)
    if du is not None:
        requete = requete.where(MouvementStock.date_mouvement >= _debut_du_jour(du))
    if au is not None:
        requete = requete.where(
            MouvementStock.date_mouvement < _debut_du_jour(au + timedelta(days=1))
        )
    requete = requete.order_by(MouvementStock.date_mouvement.desc(), MouvementStock.id.desc())
    return await paginer(session, requete, pagination)


async def noms_des_auteurs(session: AsyncSession, ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, str]:
    lignes = await session.execute(
        select(Utilisateur.id, Utilisateur.nom_complet).where(Utilisateur.id.in_(set(ids)))
    )
    return {identifiant: nom for identifiant, nom in lignes}


async def articles_par_id(
    session: AsyncSession, ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, Article]:
    articles = await session.execute(
        select(Article).options(selectinload(Article.unites)).where(Article.id.in_(set(ids)))
    )
    return {article.id: article for article in articles.scalars()}


# --- Synthèse valorisée (US-STK-02, US-STK-03) ---------------------------------------


async def synthese_par_famille(
    session: AsyncSession,
) -> list[tuple[FamilleArticle, int, Decimal, int]]:
    """Par famille d'articles actifs : nombre, valeur au coût moyen, nombre sous le seuil.

    « Sous le seuil » suit la vue v_stock_valorise de la base : stock ≤ seuil.
    """
    valeur = func.coalesce(func.sum(func.round(Article.stock_actuel * Article.cout_moyen, 2)), 0)
    en_alerte = func.sum(case((Article.stock_actuel <= Article.stock_minimum, 1), else_=0))
    lignes = await session.execute(
        select(Article.famille, func.count(), valeur, en_alerte)
        .where(Article.est_actif.is_(True))
        .group_by(Article.famille)
    )
    return [(famille, nombre, Decimal(v), int(a)) for famille, nombre, v, a in lignes]
