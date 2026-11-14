"""Catalogue des articles (US-STK-01) et unités de saisie (US-REF-02).

Règle 1 d'AGENTS.md : stock, seuil et coût sont en unité de base ; un sac est une
unité de saisie de l'article, jamais un article. Le stock et le coût moyen ne sont
modifiés que par les mouvements de stock (Sprint 3 et suivants), jamais ici.
"""

import uuid

from fastapi import status
from sqlalchemy import exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.erreurs import ErreurMetier
from app.db.pagination import paginer
from app.db.recherche import contient
from app.models import Article, ArticleUnite, LigneAchat, LigneVente, MouvementStock, Utilisateur
from app.models.enums import FamilleArticle, RoleUtilisateur
from app.schemas.articles import ArticleCreation, ArticleModification, UnitesArticle
from app.schemas.common import PaginationParams

CHAMPS_EFFACABLES = frozenset({"categorie_code", "contenance"})


def _introuvable() -> ErreurMetier:
    return ErreurMetier(
        "ARTICLE_INTROUVABLE", "Cet article n'existe pas.", status.HTTP_404_NOT_FOUND
    )


def _sku_deja_utilise(sku: str) -> ErreurMetier:
    return ErreurMetier(
        "CODE_DEJA_UTILISE",
        f"Le code {sku} est déjà utilisé par un autre article.",
        status.HTTP_409_CONFLICT,
        {"champ": "code_sku"},
    )


def _verifier_derogation(autoriser: bool | None, auteur: Utilisateur) -> None:
    if autoriser is not None and auteur.role != RoleUtilisateur.SUPER_ADMIN:
        raise ErreurMetier(
            "DEROGATION_RESERVEE",
            "Seul le Super Admin peut autoriser un stock négatif sur un article.",
            status.HTTP_403_FORBIDDEN,
            {"champ": "autoriser_stock_negatif"},
        )


async def _sku_existe(session: AsyncSession, sku: str, sauf: uuid.UUID | None = None) -> bool:
    requete = select(Article.id).where(Article.code_sku == sku)
    if sauf is not None:
        requete = requete.where(Article.id != sauf)
    return (await session.execute(requete)).first() is not None


async def lister_articles(
    session: AsyncSession,
    pagination: PaginationParams,
    *,
    famille: FamilleArticle | None = None,
    recherche: str | None = None,
    inclure_inactifs: bool = False,
    sous_seuil: bool = False,
) -> tuple[list[Article], int, int]:
    requete = select(Article).options(selectinload(Article.unites))
    if sous_seuil:
        # Même règle que la vue v_stock_valorise : stock ≤ seuil (US-STK-03)
        requete = requete.where(Article.stock_actuel <= Article.stock_minimum)
    if famille is not None:
        requete = requete.where(Article.famille == famille)
    if not inclure_inactifs:
        requete = requete.where(Article.est_actif.is_(True))
    if recherche and recherche.strip():
        requete = requete.where(contient(recherche, Article.designation, Article.code_sku))
    requete = requete.order_by(Article.designation, Article.contenance, Article.code_sku)
    return await paginer(session, requete, pagination)


async def obtenir_article(session: AsyncSession, article_id: uuid.UUID) -> Article:
    article = (
        await session.execute(
            select(Article)
            .options(selectinload(Article.unites))
            .where(Article.id == article_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if article is None:
        raise _introuvable()
    return article


async def creer_article(
    session: AsyncSession, donnees: ArticleCreation, auteur: Utilisateur
) -> Article:
    if donnees.autoriser_stock_negatif:
        _verifier_derogation(True, auteur)
    if await _sku_existe(session, donnees.code_sku):
        raise _sku_deja_utilise(donnees.code_sku)
    article = Article(
        code_sku=donnees.code_sku,
        designation=donnees.designation.strip(),
        famille=donnees.famille,
        categorie_code=donnees.categorie_code,
        contenance=donnees.contenance,
        unite_base=donnees.unite_base.strip(),
        stock_minimum=donnees.stock_minimum,
        prix_vente_standard=donnees.prix_vente_standard,
        autoriser_stock_negatif=donnees.autoriser_stock_negatif,
    )
    session.add(article)
    try:
        await session.commit()
    except IntegrityError as erreur:
        await session.rollback()
        raise _sku_deja_utilise(donnees.code_sku) from erreur
    return await obtenir_article(session, article.id)


async def _a_des_mouvements(session: AsyncSession, article_id: uuid.UUID) -> bool:
    return bool(
        await session.scalar(select(exists().where(MouvementStock.article_id == article_id)))
    )


async def modifier_article(
    session: AsyncSession,
    article_id: uuid.UUID,
    donnees: ArticleModification,
    auteur: Utilisateur,
) -> Article:
    _verifier_derogation(donnees.autoriser_stock_negatif, auteur)
    article = (
        await session.execute(select(Article).where(Article.id == article_id).with_for_update())
    ).scalar_one_or_none()
    if article is None:
        raise _introuvable()

    change_unite = (
        donnees.unite_base is not None and donnees.unite_base.strip() != article.unite_base
    )
    change_famille = donnees.famille is not None and donnees.famille != article.famille
    if (change_unite or change_famille) and await _a_des_mouvements(session, article.id):
        champ = "unite_base" if change_unite else "famille"
        raise ErreurMetier(
            "ARTICLE_DEJA_MOUVEMENTE",
            "Cet article a déjà des mouvements de stock : son unité de base et sa famille "
            "ne peuvent plus changer. Créez un nouvel article si besoin.",
            status.HTTP_409_CONFLICT,
            {"champ": champ},
        )
    if donnees.code_sku is not None and donnees.code_sku != article.code_sku:
        if await _sku_existe(session, donnees.code_sku, sauf=article.id):
            raise _sku_deja_utilise(donnees.code_sku)
        article.code_sku = donnees.code_sku

    valeurs = donnees.model_dump(
        exclude_unset=True, exclude={"code_sku", "designation", "unite_base"}
    )
    for champ, valeur in valeurs.items():
        # Seules la catégorie et la contenance peuvent être vidées ; ailleurs, null = inchangé
        if valeur is None and champ not in CHAMPS_EFFACABLES:
            continue
        setattr(article, champ, valeur)
    if donnees.designation is not None:
        article.designation = donnees.designation.strip()
    if donnees.unite_base is not None:
        article.unite_base = donnees.unite_base.strip()

    try:
        await session.commit()
    except IntegrityError as erreur:
        await session.rollback()
        raise _sku_deja_utilise(article.code_sku) from erreur
    return await obtenir_article(session, article_id)


async def _unite_utilisee(session: AsyncSession, unite_id: int) -> bool:
    utilisee = select(
        or_(
            exists().where(LigneAchat.unite_id == unite_id),
            exists().where(LigneVente.unite_id == unite_id),
        )
    )
    return bool(await session.scalar(utilisee))


async def definir_unites(
    session: AsyncSession, article_id: uuid.UUID, donnees: UnitesArticle
) -> Article:
    """Remplace les unités de saisie de l'article par la liste reçue (US-REF-02)."""
    article = (
        await session.execute(
            select(Article)
            .options(selectinload(Article.unites))
            .where(Article.id == article_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if article is None:
        raise _introuvable()

    for saisie in donnees.unites:
        if saisie.libelle.strip().lower() == article.unite_base.lower():
            raise ErreurMetier(
                "UNITE_DE_BASE",
                f"« {article.unite_base} » est l'unité de base de l'article : "
                "elle n'a pas besoin d'être ajoutée.",
            )

    existantes = {existante.id: existante for existante in article.unites}
    gardees = {saisie.id for saisie in donnees.unites if saisie.id is not None}
    inconnues = gardees - existantes.keys()
    if inconnues:
        raise ErreurMetier(
            "UNITE_INTROUVABLE", "Une des unités n'appartient pas à cet article.", 404
        )

    # 1. Retraits : une unité déjà utilisée dans une pièce reste (historique des lignes)
    for unite_id, retiree in existantes.items():
        if unite_id in gardees:
            continue
        if await _unite_utilisee(session, unite_id):
            raise ErreurMetier(
                "UNITE_UTILISEE",
                f"L'unité « {retiree.libelle} » figure déjà sur des achats ou des ventes : "
                "elle ne peut pas être retirée.",
                status.HTTP_409_CONFLICT,
            )
        await session.delete(retiree)
    await session.flush()

    # 2. Modifications, puis 3. ajouts. Changer un facteur ne touche pas le passé :
    # chaque ligne de pièce garde le facteur copié au moment de la saisie.
    for saisie in donnees.unites:
        if saisie.id is not None:
            modifiee = existantes[saisie.id]
            modifiee.libelle = saisie.libelle.strip()
            modifiee.facteur_vers_base = saisie.facteur_vers_base
        else:
            session.add(
                ArticleUnite(
                    article_id=article.id,
                    libelle=saisie.libelle.strip(),
                    facteur_vers_base=saisie.facteur_vers_base,
                )
            )
    try:
        await session.commit()
    except IntegrityError as erreur:
        await session.rollback()
        raise ErreurMetier(
            "UNITE_EN_DOUBLE", "Deux unités portent le même nom.", status.HTTP_409_CONFLICT
        ) from erreur
    return await obtenir_article(session, article_id)


async def compter_par_famille(session: AsyncSession) -> dict[FamilleArticle, int]:
    """Nombre d'articles actifs par famille, pour les onglets du catalogue."""
    lignes = await session.execute(
        select(Article.famille, func.count())
        .where(Article.est_actif.is_(True))
        .group_by(Article.famille)
    )
    return {famille: nombre for famille, nombre in lignes}
