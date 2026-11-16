"""Production en deux étapes (US-PROD-01 à 04, règle 8, D-035).

Transformation : matières → semi-fini en vrac. Conditionnement : vrac + emballages →
produit fini. Un ordre est lancé dès sa création (besoins calculés, alerte si un
composant manque) ; les sorties se déclarent au fil des jours ; à la clôture, les
consommations réelles sortent du stock au coût moyen, et leur coût total est réparti sur
les quantités produites, qui entrent en stock à ce coût de revient.
"""

import uuid
from collections import defaultdict
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from fastapi import status
from sqlalchemy import Select, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.erreurs import ErreurMetier
from app.db.pagination import paginer
from app.models import (
    Article,
    LigneRecette,
    OfConsommation,
    OfProduction,
    OrdreFabrication,
    Recette,
    Utilisateur,
)
from app.models.enums import FamilleArticle, StatutOf, TypeMouvementStock, TypeOf
from app.schemas.common import PaginationParams
from app.schemas.production import (
    Cloture,
    ComposantLecture,
    ConsommationLecture,
    OrdreCreation,
    OrdreDetail,
    OrdreResume,
    RecetteLecture,
    RecetteModification,
    RecetteSaisie,
    SortieCreation,
    SortieLecture,
)
from app.schemas.stocks import ArticleResume
from app.services.numerotation import prochain_numero
from app.services.pieces import COUT, aujourd_hui, nom_article
from app.services.stocks import (
    ecrire_mouvement_stock,
    formater_quantite,
    noms_des_auteurs,
    verrouiller_articles,
)

QUANTITE_COMPOSANT = Decimal("0.0001")
# Produit attendu de chaque étape (backlog, EPIC 5)
FAMILLE_PRODUIT = {
    TypeOf.TRANSFORMATION: FamilleArticle.SEMI_FINI,
    TypeOf.CONDITIONNEMENT: FamilleArticle.PRODUIT_FINI,
}
LIBELLE_FAMILLE = {
    TypeOf.TRANSFORMATION: "un produit semi-fini (en vrac)",
    TypeOf.CONDITIONNEMENT: "un produit fini",
}


def _resume_article(article: Article) -> ArticleResume:
    return ArticleResume.model_validate(article, from_attributes=True)


async def _articles(session: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, Article]:
    if not ids:
        return {}
    requete = select(Article).where(Article.id.in_(ids)).execution_options(populate_existing=True)
    return {a.id: a for a in (await session.execute(requete)).scalars()}


# --- Recettes (US-PROD-01) -----------------------------------------------------------


def _recette_introuvable() -> ErreurMetier:
    return ErreurMetier(
        "RECETTE_INTROUVABLE", "Cette recette n'existe pas.", status.HTTP_404_NOT_FOUND
    )


async def _lectures_recettes(
    session: AsyncSession, recettes: list[Recette]
) -> list[RecetteLecture]:
    lignes: dict[uuid.UUID, list[LigneRecette]] = defaultdict(list)
    if recettes:
        for ligne in (
            await session.execute(
                select(LigneRecette)
                .where(LigneRecette.recette_id.in_([r.id for r in recettes]))
                .order_by(LigneRecette.id)
                .execution_options(populate_existing=True)
            )
        ).scalars():
            lignes[ligne.recette_id].append(ligne)
    articles = await _articles(
        session,
        {r.article_produit_id for r in recettes}
        | {ligne.article_composant_id for liste in lignes.values() for ligne in liste},
    )
    return [
        RecetteLecture(
            id=r.id,
            type_of=r.type_of,
            produit=_resume_article(articles[r.article_produit_id]),
            nom_recette=r.nom_recette,
            quantite_base_produite=r.quantite_base_produite,
            notes_preparation=r.notes_preparation,
            est_active=r.est_active,
            composants=[
                ComposantLecture(
                    article=_resume_article(articles[ligne.article_composant_id]),
                    quantite=ligne.quantite_necessaire,
                )
                for ligne in lignes[r.id]
            ],
            date_creation=r.date_creation,
        )
        for r in recettes
    ]


async def lister_recettes(
    session: AsyncSession, *, type_of: TypeOf | None = None, actives: bool = True
) -> list[RecetteLecture]:
    requete = select(Recette).order_by(Recette.type_of, Recette.nom_recette)
    if type_of is not None:
        requete = requete.where(Recette.type_of == type_of)
    if actives:
        requete = requete.where(Recette.est_active.is_(True))
    recettes = list((await session.execute(requete)).scalars())
    return await _lectures_recettes(session, recettes)


async def lire_recette(session: AsyncSession, recette_id: uuid.UUID) -> RecetteLecture:
    recette = await session.get(Recette, recette_id, populate_existing=True)
    if recette is None:
        raise _recette_introuvable()
    return (await _lectures_recettes(session, [recette]))[0]


async def _verifier_recette(session: AsyncSession, donnees: RecetteSaisie) -> None:
    articles = await _articles(
        session, {donnees.article_produit_id} | {c.article_id for c in donnees.composants}
    )
    produit = articles.get(donnees.article_produit_id)
    if produit is None or not produit.est_actif:
        raise ErreurMetier(
            "PRODUIT_INVALIDE",
            "Ce produit n'existe pas ou est retiré du catalogue.",
            details={"champ": "article_produit_id"},
        )
    if produit.famille != FAMILLE_PRODUIT[donnees.type_of]:
        raise ErreurMetier(
            "PRODUIT_INVALIDE",
            f"Une recette de {donnees.type_of.value.lower()} produit "
            f"{LIBELLE_FAMILLE[donnees.type_of]} : « {nom_article(produit)} » n'en est pas un.",
            details={"champ": "article_produit_id"},
        )
    for composant in donnees.composants:
        article = articles.get(composant.article_id)
        if article is None or not article.est_actif:
            raise ErreurMetier(
                "COMPOSANT_INVALIDE",
                "Un composant n'existe pas ou est retiré du catalogue.",
                details={"champ": "composants"},
            )


def _lignes(recette_id: uuid.UUID, donnees: RecetteSaisie) -> list[LigneRecette]:
    return [
        LigneRecette(
            recette_id=recette_id,
            article_composant_id=c.article_id,
            quantite_necessaire=c.quantite,
        )
        for c in donnees.composants
    ]


async def creer_recette(session: AsyncSession, donnees: RecetteSaisie) -> RecetteLecture:
    await _verifier_recette(session, donnees)
    recette = Recette(
        type_of=donnees.type_of,
        article_produit_id=donnees.article_produit_id,
        nom_recette=donnees.nom_recette.strip(),
        quantite_base_produite=donnees.quantite_base_produite,
        notes_preparation=(donnees.notes_preparation or "").strip() or None,
    )
    session.add(recette)
    await session.flush()
    session.add_all(_lignes(recette.id, donnees))
    await session.commit()
    return await lire_recette(session, recette.id)


async def modifier_recette(
    session: AsyncSession, recette_id: uuid.UUID, donnees: RecetteModification
) -> RecetteLecture:
    """Remplace la recette ; les ordres déjà lancés gardent les besoins qu'ils ont copiés."""
    recette = (
        await session.execute(select(Recette).where(Recette.id == recette_id).with_for_update())
    ).scalar_one_or_none()
    if recette is None:
        raise _recette_introuvable()
    await _verifier_recette(session, donnees)
    recette.type_of = donnees.type_of
    recette.article_produit_id = donnees.article_produit_id
    recette.nom_recette = donnees.nom_recette.strip()
    recette.quantite_base_produite = donnees.quantite_base_produite
    recette.notes_preparation = (donnees.notes_preparation or "").strip() or None
    recette.est_active = donnees.est_active
    await session.execute(delete(LigneRecette).where(LigneRecette.recette_id == recette_id))
    session.add_all(_lignes(recette_id, donnees))
    await session.commit()
    return await lire_recette(session, recette_id)


# --- Lecture des ordres ----------------------------------------------------------------


def _ordre_introuvable() -> ErreurMetier:
    return ErreurMetier(
        "ORDRE_INTROUVABLE", "Cet ordre de fabrication n'existe pas.", status.HTTP_404_NOT_FOUND
    )


async def _resumes(session: AsyncSession, ordres: list[OrdreFabrication]) -> list[OrdreResume]:
    ids = [o.id for o in ordres]
    produits: dict[uuid.UUID, Decimal] = {}
    if ids:
        produits = {
            ordre_id: Decimal(total)
            for ordre_id, total in (
                await session.execute(
                    select(
                        OfProduction.ordre_fabrication_id, func.sum(OfProduction.quantite_produite)
                    )
                    .where(OfProduction.ordre_fabrication_id.in_(ids))
                    .group_by(OfProduction.ordre_fabrication_id)
                )
            ).all()
        }
    recettes = {
        r.id: r
        for r in (
            await session.execute(
                select(Recette).where(Recette.id.in_({o.recette_id for o in ordres}))
            )
        ).scalars()
    }
    articles = await _articles(session, {r.article_produit_id for r in recettes.values()})
    auteurs = await noms_des_auteurs(session, [o.responsable_id for o in ordres])
    return [
        OrdreResume(
            id=o.id,
            numero=o.numero_of,
            type_of=o.type_of,
            recette_id=o.recette_id,
            recette=recettes[o.recette_id].nom_recette,
            produit=_resume_article(articles[recettes[o.recette_id].article_produit_id]),
            quantite_prevue=o.quantite_prevue,
            quantite_produite=produits.get(o.id, Decimal(0)),
            statut=o.statut,
            date_lancement=o.date_lancement,
            date_cloture=o.date_cloture,
            responsable=auteurs.get(o.responsable_id, ""),
        )
        for o in ordres
    ]


async def lister_ordres(
    session: AsyncSession,
    pagination: PaginationParams,
    *,
    statut: StatutOf | None = None,
    type_of: TypeOf | None = None,
) -> tuple[list[OrdreResume], int, int]:
    requete: Select[OrdreFabrication] = select(OrdreFabrication)
    if statut is not None:
        requete = requete.where(OrdreFabrication.statut == statut)
    if type_of is not None:
        requete = requete.where(OrdreFabrication.type_of == type_of)
    requete = requete.order_by(OrdreFabrication.date_creation.desc(), OrdreFabrication.id)
    ordres, total, pages = await paginer(session, requete, pagination)
    return await _resumes(session, ordres), total, pages


async def lire_ordre(session: AsyncSession, ordre_id: uuid.UUID) -> OrdreDetail:
    ordre = await session.get(OrdreFabrication, ordre_id, populate_existing=True)
    if ordre is None:
        raise _ordre_introuvable()
    consommations = list(
        (
            await session.execute(
                select(OfConsommation)
                .where(OfConsommation.ordre_fabrication_id == ordre_id)
                .order_by(OfConsommation.id)
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )
    sorties = list(
        (
            await session.execute(
                select(OfProduction)
                .where(OfProduction.ordre_fabrication_id == ordre_id)
                .order_by(OfProduction.date_production, OfProduction.id)
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )
    articles = await _articles(
        session,
        {c.article_composant_id for c in consommations} | {s.article_produit_id for s in sorties},
    )
    termine = ordre.statut == StatutOf.TERMINE
    cout_total = (
        sum(
            (
                (c.quantite_consommee * c.cout_unitaire).quantize(Decimal("0.01"), ROUND_HALF_UP)
                for c in consommations
            ),
            start=Decimal(0),
        )
        if termine
        else None
    )
    consomme = sum((c.quantite_consommee for c in consommations), start=Decimal(0))
    produit = sum((s.quantite_produite for s in sorties), start=Decimal(0))
    rendement = (
        (produit / consomme).quantize(Decimal("0.0001"), ROUND_HALF_UP)
        if termine and ordre.type_of == TypeOf.TRANSFORMATION and consomme > 0
        else None
    )
    resume = (await _resumes(session, [ordre]))[0]
    en_cours = ordre.statut == StatutOf.EN_COURS
    return OrdreDetail(
        **resume.model_dump(),
        quantite_pertes=ordre.quantite_pertes,
        observations=ordre.observations,
        consommations=[
            ConsommationLecture(
                article=_resume_article(articles[c.article_composant_id]),
                quantite_prevue=c.quantite_prevue,
                quantite_consommee=c.quantite_consommee,
                cout_unitaire=c.cout_unitaire,
                stock_actuel=articles[c.article_composant_id].stock_actuel,
                manque=max(
                    Decimal(0), c.quantite_prevue - articles[c.article_composant_id].stock_actuel
                )
                if en_cours and not articles[c.article_composant_id].autoriser_stock_negatif
                else Decimal(0),
            )
            for c in consommations
        ],
        sorties=[
            SortieLecture(
                id=s.id,
                article=_resume_article(articles[s.article_produit_id]),
                date_production=s.date_production,
                quantite=s.quantite_produite,
                cout_unitaire=s.cout_unitaire,
            )
            for s in sorties
        ],
        cout_total=cout_total,
        rendement=rendement,
    )


# --- Lancement (US-PROD-02) ----------------------------------------------------------


async def lancer_ordre(
    session: AsyncSession, donnees: OrdreCreation, auteur: Utilisateur
) -> OrdreDetail:
    recette = await session.get(Recette, donnees.recette_id)
    if recette is None or not recette.est_active:
        raise ErreurMetier(
            "RECETTE_INVALIDE",
            "Cette recette n'existe pas ou n'est plus active.",
            details={"champ": "recette_id"},
        )
    lignes = list(
        (
            await session.execute(select(LigneRecette).where(LigneRecette.recette_id == recette.id))
        ).scalars()
    )
    # Besoins prévisionnels : recette ramenée à la quantité visée
    facteur = donnees.quantite_prevue / recette.quantite_base_produite
    maintenant = datetime.now(UTC)
    ordre = OrdreFabrication(
        numero_of=await prochain_numero(session, "OF", aujourd_hui()),
        type_of=recette.type_of,
        recette_id=recette.id,
        quantite_prevue=donnees.quantite_prevue,
        statut=StatutOf.EN_COURS,
        date_lancement=maintenant,
        responsable_id=auteur.id,
        observations=(donnees.observations or "").strip() or None,
    )
    session.add(ordre)
    await session.flush()
    session.add_all(
        OfConsommation(
            ordre_fabrication_id=ordre.id,
            article_composant_id=ligne.article_composant_id,
            quantite_prevue=(ligne.quantite_necessaire * facteur).quantize(
                QUANTITE_COMPOSANT, ROUND_HALF_UP
            ),
        )
        for ligne in lignes
    )
    await session.commit()
    return await lire_ordre(session, ordre.id)


async def _ordre_en_cours(session: AsyncSession, ordre_id: uuid.UUID) -> OrdreFabrication:
    ordre = (
        await session.execute(
            select(OrdreFabrication).where(OrdreFabrication.id == ordre_id).with_for_update()
        )
    ).scalar_one_or_none()
    if ordre is None:
        raise _ordre_introuvable()
    if ordre.statut != StatutOf.EN_COURS:
        etat = "terminé" if ordre.statut == StatutOf.TERMINE else "annulé"
        raise ErreurMetier(
            "ORDRE_CLOS",
            f"L'ordre {ordre.numero_of} est {etat} : il ne se modifie plus.",
            status.HTTP_409_CONFLICT,
        )
    return ordre


# --- Sorties de production (US-PROD-03) ----------------------------------------------


async def declarer_sortie(
    session: AsyncSession, ordre_id: uuid.UUID, donnees: SortieCreation
) -> OrdreDetail:
    ordre = await _ordre_en_cours(session, ordre_id)
    recette = await session.get(Recette, ordre.recette_id)
    article = await session.get(Article, donnees.article_id)
    jour = donnees.date_production or aujourd_hui()
    if jour > aujourd_hui():
        raise ErreurMetier(
            "DATE_FUTURE",
            "La date ne peut pas être dans le futur.",
            details={"champ": "date_production"},
        )
    if article is None or not article.est_actif:
        raise ErreurMetier(
            "ARTICLE_INVALIDE",
            "Cet article n'existe pas ou est retiré du catalogue.",
            details={"champ": "article_id"},
        )
    assert recette is not None
    # Conditionnement : le produit de la recette ; transformation : un ou plusieurs
    # semi-finis du même lot (Tapioka petit et gros, US-PROD-03)
    if ordre.type_of == TypeOf.CONDITIONNEMENT and article.id != recette.article_produit_id:
        raise ErreurMetier(
            "ARTICLE_INVALIDE",
            "Un conditionnement ne produit que le produit fini de sa recette.",
            details={"champ": "article_id"},
        )
    if ordre.type_of == TypeOf.TRANSFORMATION and article.famille != FamilleArticle.SEMI_FINI:
        raise ErreurMetier(
            "ARTICLE_INVALIDE",
            "Une transformation produit des semi-finis (en vrac).",
            details={"champ": "article_id"},
        )
    session.add(
        OfProduction(
            ordre_fabrication_id=ordre.id,
            article_produit_id=article.id,
            date_production=jour,
            quantite_produite=donnees.quantite,
        )
    )
    await session.commit()
    return await lire_ordre(session, ordre_id)


async def retirer_sortie(session: AsyncSession, ordre_id: uuid.UUID, sortie_id: int) -> OrdreDetail:
    """Une sortie déclarée par erreur se retire tant que l'ordre est en cours : rien
    n'est encore entré en stock."""
    await _ordre_en_cours(session, ordre_id)
    resultat = await session.execute(
        delete(OfProduction).where(
            OfProduction.id == sortie_id, OfProduction.ordre_fabrication_id == ordre_id
        )
    )
    if resultat.rowcount == 0:  # type: ignore[attr-defined]
        raise ErreurMetier(
            "SORTIE_INTROUVABLE", "Cette sortie n'existe pas.", status.HTTP_404_NOT_FOUND
        )
    await session.commit()
    return await lire_ordre(session, ordre_id)


# --- Clôture (US-PROD-04) ------------------------------------------------------------


async def cloturer_ordre(
    session: AsyncSession, ordre_id: uuid.UUID, donnees: Cloture, auteur: Utilisateur
) -> OrdreDetail:
    ordre = await _ordre_en_cours(session, ordre_id)
    consommations = {
        c.article_composant_id: c
        for c in (
            await session.execute(
                select(OfConsommation).where(OfConsommation.ordre_fabrication_id == ordre_id)
            )
        ).scalars()
    }
    sorties = list(
        (
            await session.execute(
                select(OfProduction).where(OfProduction.ordre_fabrication_id == ordre_id)
            )
        ).scalars()
    )
    if not sorties:
        raise ErreurMetier(
            "AUCUNE_SORTIE",
            "Déclarez d'abord ce qui est sorti de l'atelier.",
            status.HTTP_409_CONFLICT,
        )
    reelles = {c.article_id: c.quantite for c in donnees.consommations}
    inconnus = set(reelles) - set(consommations)
    if inconnus:
        raise ErreurMetier(
            "COMPOSANT_INVALIDE",
            "Un composant consommé ne fait pas partie de cet ordre.",
            details={"champ": "consommations"},
        )

    # Composants et produits verrouillés ensemble, par identifiant croissant
    articles = await verrouiller_articles(
        session, [*consommations, *(s.article_produit_id for s in sorties)]
    )
    manques = [
        f"{nom_article(articles[a])} : il faut "
        f"{formater_quantite(q, articles[a].unite_base)}, il reste "
        f"{formater_quantite(articles[a].stock_actuel, articles[a].unite_base)}"
        for a, q in reelles.items()
        if q > articles[a].stock_actuel and not articles[a].autoriser_stock_negatif
    ]
    if manques:
        raise ErreurMetier(
            "COMPOSANT_MANQUANT",
            "Clôture impossible, composant insuffisant. " + " ; ".join(manques) + ".",
            status.HTTP_409_CONFLICT,
        )

    cout_total = Decimal(0)
    for article_id in sorted(consommations):
        consommation = consommations[article_id]
        quantite = reelles.get(article_id, Decimal(0))
        article = articles[article_id]
        consommation.quantite_consommee = quantite
        consommation.cout_unitaire = article.cout_moyen
        if quantite == 0:
            continue
        cout_total += (quantite * article.cout_moyen).quantize(Decimal("0.01"), ROUND_HALF_UP)
        await ecrire_mouvement_stock(
            session,
            article,
            type_mouvement=TypeMouvementStock.CONSO_PRODUCTION,
            quantite=-quantite,
            utilisateur_id=auteur.id,
            ordre_fabrication_id=ordre.id,
            reference_document=ordre.numero_of,
        )

    # Coût réparti au prorata des quantités produites : un même coût par unité
    produit = sum((s.quantite_produite for s in sorties), start=Decimal(0))
    cout_unitaire = (cout_total / produit).quantize(COUT, ROUND_HALF_UP)
    for sortie in sorted(sorties, key=lambda s: (s.article_produit_id, s.id)):
        sortie.cout_unitaire = cout_unitaire
        await ecrire_mouvement_stock(
            session,
            articles[sortie.article_produit_id],
            type_mouvement=TypeMouvementStock.ENTREE_PRODUCTION,
            quantite=sortie.quantite_produite,
            cout_entree=cout_unitaire,
            utilisateur_id=auteur.id,
            ordre_fabrication_id=ordre.id,
            reference_document=ordre.numero_of,
        )

    ordre.quantite_pertes = donnees.pertes
    if donnees.observations and donnees.observations.strip():
        ordre.observations = "\n".join(
            filter(None, [ordre.observations, donnees.observations.strip()])
        )
    ordre.statut = StatutOf.TERMINE
    ordre.date_cloture = datetime.now(UTC)
    await session.commit()
    return await lire_ordre(session, ordre_id)


async def annuler_ordre(
    session: AsyncSession, ordre_id: uuid.UUID, motif: str, auteur: Utilisateur
) -> OrdreDetail:
    """Un ordre en cours s'annule : aucun stock n'a encore bougé. Un ordre terminé non."""
    ordre = await _ordre_en_cours(session, ordre_id)
    noms = await noms_des_auteurs(session, [auteur.id])
    jour = aujourd_hui().strftime("%d/%m/%Y")
    mention = f"Annulé le {jour} par {noms.get(auteur.id, '')} : {motif.strip()}"
    ordre.observations = "\n".join(filter(None, [ordre.observations, mention]))
    ordre.statut = StatutOf.ANNULE
    await session.commit()
    return await lire_ordre(session, ordre_id)
