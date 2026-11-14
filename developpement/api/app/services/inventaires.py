"""Inventaire physique et régularisation des écarts (US-STK-04).

Déroulé : ouverture (numéro INV-AAAA-NNNN, stock théorique figé), saisie du comptage
(motif obligatoire pour tout écart), validation (ajustements écrits au journal par
`ecrire_mouvement_stock`, en une transaction). Sert aussi au stock de départ (D-018) :
un excédent sur un article sans coût moyen exige alors son coût unitaire (D-028).
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.erreurs import ErreurMetier
from app.db.pagination import paginer
from app.models import Article, Inventaire, LigneInventaire, Utilisateur
from app.models.enums import FamilleArticle, MotifEcart, StatutInventaire, TypeMouvementStock
from app.schemas.articles import UniteLecture
from app.schemas.common import PaginationParams
from app.schemas.stocks import (
    ArticleResume,
    Comptage,
    InventaireDetail,
    InventaireResume,
    LigneInventaireLecture,
)
from app.services.numerotation import prochain_numero
from app.services.stocks import (
    LIBELLES_MOTIFS,
    ecrire_mouvement_stock,
    noms_des_auteurs,
    verrouiller_articles,
)


def _introuvable() -> ErreurMetier:
    return ErreurMetier(
        "INVENTAIRE_INTROUVABLE", "Cet inventaire n'existe pas.", status.HTTP_404_NOT_FOUND
    )


def _deja_valide(inventaire: Inventaire) -> ErreurMetier:
    return ErreurMetier(
        "INVENTAIRE_VALIDE",
        f"L'inventaire {inventaire.numero} est déjà validé : il ne se modifie plus.",
        status.HTTP_409_CONFLICT,
    )


async def _compteurs(
    session: AsyncSession, ids: list[uuid.UUID]
) -> dict[uuid.UUID, tuple[int, int]]:
    if not ids:
        return {}
    lignes = await session.execute(
        select(
            LigneInventaire.inventaire_id,
            func.count(),
            func.sum(case((LigneInventaire.ecart != 0, 1), else_=0)),
        )
        .where(LigneInventaire.inventaire_id.in_(ids))
        .group_by(LigneInventaire.inventaire_id)
    )
    return {identifiant: (n, int(e or 0)) for identifiant, n, e in lignes}


def _resume(
    inventaire: Inventaire,
    auteurs: dict[uuid.UUID, str],
    compteurs: dict[uuid.UUID, tuple[int, int]],
) -> InventaireResume:
    nombre_lignes, nombre_ecarts = compteurs.get(inventaire.id, (0, 0))
    return InventaireResume(
        id=inventaire.id,
        numero=inventaire.numero,
        date_inventaire=inventaire.date_inventaire,
        famille=inventaire.famille,
        statut=inventaire.statut,
        observations=inventaire.observations,
        auteur=auteurs.get(inventaire.cree_par, ""),
        date_creation=inventaire.date_creation,
        valide_le=inventaire.valide_le,
        controle_le=inventaire.controle_le,
        nombre_lignes=nombre_lignes,
        nombre_ecarts=nombre_ecarts,
    )


async def lister_inventaires(
    session: AsyncSession, pagination: PaginationParams
) -> tuple[list[InventaireResume], int, int]:
    requete = select(Inventaire).order_by(Inventaire.date_creation.desc(), Inventaire.id)
    inventaires, total, pages = await paginer(session, requete, pagination)
    auteurs = await noms_des_auteurs(session, [i.cree_par for i in inventaires])
    compteurs = await _compteurs(session, [i.id for i in inventaires])
    return [_resume(i, auteurs, compteurs) for i in inventaires], total, pages


async def lire_inventaire(session: AsyncSession, inventaire_id: uuid.UUID) -> InventaireDetail:
    inventaire = await session.get(Inventaire, inventaire_id, populate_existing=True)
    if inventaire is None:
        raise _introuvable()
    lignes = await session.execute(
        select(LigneInventaire, Article)
        .join(Article, Article.id == LigneInventaire.article_id)
        .options(selectinload(Article.unites))
        .where(LigneInventaire.inventaire_id == inventaire_id)
        .order_by(Article.designation, Article.contenance, Article.code_sku)
        .execution_options(populate_existing=True)
    )
    lectures = [
        LigneInventaireLecture(
            id=ligne.id,
            article=ArticleResume.model_validate(article, from_attributes=True),
            cout_moyen=article.cout_moyen,
            unites=[UniteLecture.model_validate(u) for u in article.unites],
            stock_theorique=ligne.stock_theorique,
            stock_physique=ligne.stock_physique,
            ecart=ligne.ecart,
            motif=ligne.motif,
            commentaire=ligne.commentaire,
            cout_unitaire=ligne.cout_unitaire,
        )
        for ligne, article in lignes
    ]
    auteurs = await noms_des_auteurs(session, [inventaire.cree_par])
    nombre_ecarts = sum(1 for ligne in lectures if ligne.ecart != 0)
    resume = _resume(inventaire, auteurs, {inventaire.id: (len(lectures), nombre_ecarts)})
    return InventaireDetail(**resume.model_dump(), lignes=lectures)


async def ouvrir_inventaire(
    session: AsyncSession,
    famille: FamilleArticle | None,
    observations: str | None,
    auteur: Utilisateur,
) -> InventaireDetail:
    # Un seul comptage à la fois : deux inventaires sur les mêmes articles se contrediraient
    en_cours = (
        await session.execute(
            select(Inventaire.numero).where(Inventaire.statut == StatutInventaire.EN_COURS)
        )
    ).scalar_one_or_none()
    if en_cours is not None:
        raise ErreurMetier(
            "INVENTAIRE_EN_COURS",
            f"L'inventaire {en_cours} est encore en cours. Validez-le avant d'en ouvrir un autre.",
            status.HTTP_409_CONFLICT,
            {"numero": en_cours},
        )

    requete = select(Article).where(Article.est_actif.is_(True))
    if famille is not None:
        requete = requete.where(Article.famille == famille)
    articles = list((await session.execute(requete)).scalars())
    if not articles:
        raise ErreurMetier(
            "AUCUN_ARTICLE", "Aucun article actif dans cette famille : rien à compter."
        )

    inventaire = Inventaire(
        numero=await prochain_numero(session, "INV"),
        famille=famille,
        observations=(observations or "").strip() or None,
        cree_par=auteur.id,
    )
    session.add(inventaire)
    await session.flush()
    for article in articles:
        # Stock théorique figé ; comptage prérempli : seul ce qui diffère est à corriger
        physique = max(article.stock_actuel, Decimal(0))
        negatif = article.stock_actuel < 0
        session.add(
            LigneInventaire(
                inventaire_id=inventaire.id,
                article_id=article.id,
                stock_theorique=article.stock_actuel,
                stock_physique=physique,
                # Un stock négatif (dérogation) ne peut être compté que nul ou positif
                motif=MotifEcart.AUTRE if negatif else None,
                commentaire="Stock théorique négatif" if negatif else None,
            )
        )
    await session.commit()
    return await lire_inventaire(session, inventaire.id)


async def saisir_comptage(
    session: AsyncSession, inventaire_id: uuid.UUID, comptage: Comptage
) -> InventaireDetail:
    inventaire = (
        await session.execute(
            select(Inventaire).where(Inventaire.id == inventaire_id).with_for_update()
        )
    ).scalar_one_or_none()
    if inventaire is None:
        raise _introuvable()
    if inventaire.statut != StatutInventaire.EN_COURS:
        raise _deja_valide(inventaire)

    lignes = {
        ligne.article_id: ligne
        for ligne in (
            await session.execute(
                select(LigneInventaire).where(LigneInventaire.inventaire_id == inventaire_id)
            )
        ).scalars()
    }
    for saisie in comptage.lignes:
        ligne = lignes.get(saisie.article_id)
        if ligne is None:
            raise ErreurMetier(
                "ARTICLE_HORS_INVENTAIRE", "Un des articles ne fait pas partie de cet inventaire."
            )
        if saisie.stock_physique == ligne.stock_theorique:
            # Pas d'écart : ni motif, ni coût
            ligne.stock_physique, ligne.motif, ligne.commentaire, ligne.cout_unitaire = (
                saisie.stock_physique,
                None,
                None,
                None,
            )
            continue
        if saisie.motif is None:
            raise ErreurMetier(
                "MOTIF_REQUIS",
                "Indiquez le motif de chaque écart (casse, avarie, dessiccation, erreur de "
                "comptage ou autre).",
                details={"article_id": str(saisie.article_id)},
            )
        ligne.stock_physique = saisie.stock_physique
        ligne.motif = saisie.motif
        ligne.commentaire = (saisie.commentaire or "").strip() or None
        # Le coût ne vaut que pour un excédent (entrée en stock)
        excedent = saisie.stock_physique > ligne.stock_theorique
        ligne.cout_unitaire = saisie.cout_unitaire if excedent else None
    if comptage.observations is not None:
        inventaire.observations = comptage.observations.strip() or None
    await session.commit()
    return await lire_inventaire(session, inventaire_id)


async def valider_inventaire(
    session: AsyncSession, inventaire_id: uuid.UUID, auteur: Utilisateur
) -> InventaireDetail:
    """Écrit les ajustements au journal (un mouvement par écart), en une transaction.

    L'écart (compté − théorique figé) s'applique au stock du moment : une vente faite
    pendant le comptage reste prise en compte.
    """
    inventaire = (
        await session.execute(
            select(Inventaire).where(Inventaire.id == inventaire_id).with_for_update()
        )
    ).scalar_one_or_none()
    if inventaire is None:
        raise _introuvable()
    if inventaire.statut != StatutInventaire.EN_COURS:
        raise _deja_valide(inventaire)

    ecarts = list(
        (
            await session.execute(
                select(LigneInventaire).where(
                    LigneInventaire.inventaire_id == inventaire_id, LigneInventaire.ecart != 0
                )
            )
        ).scalars()
    )
    articles = await verrouiller_articles(session, [ligne.article_id for ligne in ecarts])

    sans_cout = [
        articles[ligne.article_id]
        for ligne in ecarts
        if ligne.ecart > 0
        and ligne.cout_unitaire is None
        and articles[ligne.article_id].cout_moyen == 0
    ]
    if sans_cout:
        noms = ", ".join(f"{a.designation} {a.contenance or ''}".strip() for a in sans_cout[:5])
        raise ErreurMetier(
            "COUT_REQUIS",
            "Indiquez le coût unitaire des articles qui entrent en stock sans coût connu : "
            f"{noms}.",
            details={"articles": [str(a.id) for a in sans_cout]},
        )

    for ligne in sorted(ecarts, key=lambda ecart: ecart.article_id):
        motif = LIBELLES_MOTIFS[ligne.motif] if ligne.motif else None
        if motif and ligne.commentaire:
            motif = f"{motif} : {ligne.commentaire}"
        await ecrire_mouvement_stock(
            session,
            articles[ligne.article_id],
            type_mouvement=TypeMouvementStock.AJUSTEMENT_INVENTAIRE,
            quantite=ligne.ecart,
            utilisateur_id=auteur.id,
            cout_entree=ligne.cout_unitaire if ligne.ecart > 0 else None,
            inventaire_id=inventaire.id,
            reference_document=inventaire.numero,
            motif=motif,
        )
    inventaire.statut = StatutInventaire.VALIDE
    inventaire.valide_le = datetime.now(UTC)
    await session.commit()
    return await lire_inventaire(session, inventaire_id)
