"""Briques communes aux pièces commerciales (achats, ventes) : calcul des lignes,
comptes de règlement, formats. Aucune n'effectue de commit."""

import uuid
from collections.abc import Sequence
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.erreurs import ErreurMetier
from app.models import Article, ArticleUnite, CompteTresorerie
from app.services.stocks import FUSEAU

QUANTITE = Decimal("0.001")
# Montants en FCFA entiers : une ligne s'arrondit au franc, comme la base (P-019, D-031)
FRANC = Decimal(1)
COUT = Decimal("0.0001")


def fcfa(montant: Decimal) -> str:
    """2030000 → « 2 030 000 FCFA »."""
    return f"{format(montant.quantize(FRANC), ',').replace(',', ' ')} FCFA"


def aujourd_hui() -> date:
    return datetime.now(FUSEAU).date()


def nom_article(article: Article) -> str:
    return f"{article.designation} {article.contenance or ''}".strip()


class LigneQuantite(Protocol):
    @property
    def article_id(self) -> uuid.UUID: ...
    @property
    def unite_id(self) -> int | None: ...
    @property
    def quantite(self) -> Decimal: ...


class LigneSaisie(LigneQuantite, Protocol):
    @property
    def prix_unitaire(self) -> Decimal: ...


def exiger_articles_actifs(articles: dict[uuid.UUID, Article]) -> None:
    for article in articles.values():
        if not article.est_actif:
            raise ErreurMetier(
                "ARTICLE_INACTIF",
                f"L'article « {nom_article(article)} » est retiré du catalogue.",
            )


async def facteurs_des_lignes(
    session: AsyncSession, lignes: Sequence[LigneQuantite]
) -> list[Decimal]:
    """Facteur vers l'unité de base de chaque ligne (1 sans unité de saisie)."""
    ids = {ligne.unite_id for ligne in lignes if ligne.unite_id is not None}
    unites = {
        u.id: u
        for u in (
            await session.execute(select(ArticleUnite).where(ArticleUnite.id.in_(ids)))
        ).scalars()
    }
    facteurs = []
    for ligne in lignes:
        if ligne.unite_id is None:
            facteurs.append(Decimal(1))
            continue
        unite = unites.get(ligne.unite_id)
        if unite is None or unite.article_id != ligne.article_id:
            raise ErreurMetier(
                "UNITE_INTROUVABLE", "Une unité n'appartient pas à l'article de sa ligne.", 404
            )
        facteurs.append(unite.facteur_vers_base)
    return facteurs


def quantite_base(ligne: LigneQuantite, facteur: Decimal) -> Decimal:
    return (ligne.quantite * facteur).quantize(QUANTITE, ROUND_HALF_UP)


def montant_ligne(ligne: LigneSaisie) -> Decimal:
    """Même calcul que la colonne `montant_total` de la base (arrondi au franc)."""
    return (ligne.quantite * ligne.prix_unitaire).quantize(FRANC, ROUND_HALF_UP)


async def verrouiller_comptes(
    session: AsyncSession, ids: set[int], *, actifs: bool = True
) -> dict[int, CompteTresorerie]:
    """SELECT ... FOR UPDATE, par identifiant croissant. `actifs=False` pour une
    contre-passation, qui revient toujours sur le compte d'origine, même désactivé."""
    comptes = {
        c.id: c
        for c in (
            await session.execute(
                select(CompteTresorerie)
                .where(CompteTresorerie.id.in_(sorted(ids)))
                .order_by(CompteTresorerie.id)
                .with_for_update()
            )
        ).scalars()
    }
    if not actifs:
        return comptes
    for identifiant in ids:
        compte = comptes.get(identifiant)
        if compte is None:
            raise ErreurMetier(
                "COMPTE_INTROUVABLE", "Un des comptes de paiement n'existe pas.", 404
            )
        if not compte.est_actif:
            raise ErreurMetier(
                "COMPTE_INACTIF",
                f"Le compte « {compte.nom} » est désactivé : choisissez-en un autre.",
            )
    return comptes
