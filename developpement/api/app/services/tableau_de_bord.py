"""Tableau de bord et marges (US-DASH-01, 02). Lecture seule, pour tous les rôles."""

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Article, CompteTresorerie, LigneVente, OrdreFabrication, Tiers, Vente
from app.models.enums import StatutDocument, StatutOf
from app.schemas.stocks import ArticleResume
from app.schemas.tableau_de_bord import (
    Impaye,
    Indicateurs,
    MargeArticle,
    RapportMarges,
    SoldeCompte,
    StockBas,
    VenteDuJour,
)
from app.services import stocks as service_stocks
from app.services.journal import synthese
from app.services.pieces import aujourd_hui
from app.services.ventes import total_regle

LIGNES_A_TRAITER = 5
CENTIME = Decimal("0.01")


def _ventes_facturees() -> tuple[ColumnElement[bool], ...]:
    """Ventes qui comptent dans le chiffre d'affaires : validées, hors dons."""
    return (Vente.statut == StatutDocument.VALIDE, Vente.est_don.is_(False))


async def _chiffre_affaires(session: AsyncSession, du: date, au: date) -> Decimal:
    total = await session.scalar(
        select(func.coalesce(func.sum(Vente.montant_total), 0)).where(
            *_ventes_facturees(), Vente.date_vente >= du, Vente.date_vente <= au
        )
    )
    return Decimal(total or 0)


async def indicateurs(session: AsyncSession) -> Indicateurs:
    jour = aujourd_hui()
    debut_30 = jour - timedelta(days=29)

    par_jour = {
        d: Decimal(m)
        for d, m in (
            await session.execute(
                select(Vente.date_vente, func.sum(Vente.montant_total))
                .where(*_ventes_facturees(), Vente.date_vente >= debut_30, Vente.date_vente <= jour)
                .group_by(Vente.date_vente)
            )
        ).all()
    }
    familles = await service_stocks.synthese_par_famille(session)
    comptes = list(
        (
            await session.execute(
                select(CompteTresorerie)
                .where(CompteTresorerie.est_actif.is_(True))
                .order_by(CompteTresorerie.id)
            )
        ).scalars()
    )
    soldes = await synthese(session)
    ordres_en_cours = await session.scalar(
        select(func.count()).where(OrdreFabrication.statut == StatutOf.EN_COURS)
    )

    # Stocks bas : les plus éloignés de leur seuil d'abord
    bas = (
        await session.execute(
            select(Article)
            .where(Article.est_actif.is_(True), Article.stock_actuel <= Article.stock_minimum)
            .order_by((Article.stock_actuel - Article.stock_minimum).asc(), Article.designation)
            .limit(LIGNES_A_TRAITER)
        )
    ).scalars()
    # Impayés : les ventes non soldées les plus anciennes
    reste = Vente.montant_total - total_regle()
    impayes = (
        await session.execute(
            select(Vente, reste.label("reste"), Tiers.nom)
            .outerjoin(Tiers, Tiers.id == Vente.client_id)
            .where(*_ventes_facturees(), Vente.montant_total > total_regle())
            .order_by(Vente.date_vente, Vente.date_creation)
            .limit(LIGNES_A_TRAITER)
        )
    ).all()

    return Indicateurs(
        ca_jour=await _chiffre_affaires(session, jour, jour),
        ca_mois=await _chiffre_affaires(session, jour.replace(day=1), jour),
        valeur_stock=sum((v for _, _, v, _ in familles), start=Decimal(0)),
        solde_global=soldes.solde_global,
        comptes=[
            SoldeCompte(id=c.id, nom=c.nom, type=c.type, solde=c.solde_actuel) for c in comptes
        ],
        total_creances=soldes.total_creances,
        total_dettes=soldes.total_dettes,
        articles_sous_seuil=sum(a for _, _, _, a in familles),
        ordres_en_cours=int(ordres_en_cours or 0),
        ventes_30_jours=[
            VenteDuJour(date=d, montant=par_jour.get(d, Decimal(0)))
            for d in (debut_30 + timedelta(days=i) for i in range(30))
        ],
        stocks_bas=[
            StockBas(
                article=ArticleResume.model_validate(a, from_attributes=True),
                stock_actuel=a.stock_actuel,
                stock_minimum=a.stock_minimum,
            )
            for a in bas
        ],
        impayes_anciens=[
            Impaye(
                id=v.id,
                numero=v.numero_facture,
                client=nom or v.client_nom_libre,
                date_vente=v.date_vente,
                reste_a_payer=Decimal(r),
            )
            for v, r, nom in impayes
        ],
    )


def _taux(marge: Decimal, chiffre: Decimal) -> Decimal | None:
    if chiffre == 0:
        return None
    return (marge * 100 / chiffre).quantize(Decimal("0.1"), ROUND_HALF_UP)


async def marges(session: AsyncSession, du: date | None, au: date | None) -> RapportMarges:
    """Marge brute par article vendu (US-DASH-02) : chiffre d'affaires moins le coût
    moyen de l'article au moment de chaque vente. Ventes annulées et dons exclus."""
    cout = func.sum(func.round(LigneVente.quantite_base * LigneVente.cout_unitaire_base, 2))
    requete = (
        select(
            Article,
            func.sum(LigneVente.quantite_base),
            func.sum(LigneVente.montant_total),
            cout,
        )
        .join(LigneVente, LigneVente.article_id == Article.id)
        .join(Vente, Vente.id == LigneVente.vente_id)
        .where(*_ventes_facturees())
        .group_by(Article.id)
    )
    if du is not None:
        requete = requete.where(Vente.date_vente >= du)
    if au is not None:
        requete = requete.where(Vente.date_vente <= au)

    lignes = []
    for article, quantite, chiffre, cout_total in (await session.execute(requete)).all():
        chiffre = Decimal(chiffre or 0)
        cout_total = Decimal(cout_total or 0).quantize(CENTIME)
        marge = chiffre - cout_total
        lignes.append(
            MargeArticle(
                article=ArticleResume.model_validate(article, from_attributes=True),
                quantite_vendue=Decimal(quantite or 0),
                chiffre_affaires=chiffre,
                cout_de_revient=cout_total,
                marge=marge,
                taux_marge=_taux(marge, chiffre),
            )
        )
    lignes.sort(key=lambda ligne: (-ligne.marge, ligne.article.designation))
    chiffre = sum((ligne.chiffre_affaires for ligne in lignes), start=Decimal(0))
    cout_total = sum((ligne.cout_de_revient for ligne in lignes), start=Decimal(0))
    return RapportMarges(
        du=du,
        au=au,
        articles=lignes,
        chiffre_affaires=chiffre,
        cout_de_revient=cout_total,
        marge=chiffre - cout_total,
        taux_marge=_taux(chiffre - cout_total, chiffre),
    )
