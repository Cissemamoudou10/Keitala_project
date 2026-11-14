"""Répertoire des clients et fournisseurs (US-REF-01).

Créances et dettes ne sont pas stockées : la vue `v_tiers_soldes` les calcule à partir
des ventes, des achats et de leurs règlements.
"""

import re
import uuid
from collections.abc import Sequence
from decimal import Decimal

from fastapi import status
from sqlalchemy import Numeric, Uuid, column, func, or_, select, table
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.erreurs import ErreurMetier
from app.db.pagination import paginer
from app.db.recherche import contient, simplifier, simplifier_sql
from app.models import Tiers
from app.schemas.common import PaginationParams
from app.schemas.tiers import TiersCreation, TiersLecture, TiersModification, TypeTiers

# Vue de la migration 0001, lue sans modèle (elle n'est pas dans les métadonnées)
V_TIERS_SOLDES = table(
    "v_tiers_soldes",
    column("tiers_id", Uuid),
    column("solde_creance", Numeric),
    column("solde_dette", Numeric),
)


def _introuvable() -> ErreurMetier:
    return ErreurMetier(
        "TIERS_INTROUVABLE", "Ce client ou fournisseur n'existe pas.", status.HTTP_404_NOT_FOUND
    )


async def _soldes(
    session: AsyncSession, ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, tuple[Decimal, Decimal]]:
    if not ids:
        return {}
    lignes = await session.execute(
        select(
            V_TIERS_SOLDES.c.tiers_id, V_TIERS_SOLDES.c.solde_creance, V_TIERS_SOLDES.c.solde_dette
        ).where(V_TIERS_SOLDES.c.tiers_id.in_(ids))
    )
    return {tiers_id: (creance, dette) for tiers_id, creance, dette in lignes}


async def _lectures(session: AsyncSession, tiers: Sequence[Tiers]) -> list[TiersLecture]:
    soldes = await _soldes(session, [t.id for t in tiers])
    lectures = []
    for un_tiers in tiers:
        lecture = TiersLecture.model_validate(un_tiers)
        lecture.solde_creance, lecture.solde_dette = soldes.get(
            un_tiers.id, (Decimal(0), Decimal(0))
        )
        lectures.append(lecture)
    return lectures


async def lister_tiers(
    session: AsyncSession,
    pagination: PaginationParams,
    *,
    type_tiers: TypeTiers | None = None,
    recherche: str | None = None,
    inclure_inactifs: bool = False,
) -> tuple[list[TiersLecture], int, int]:
    requete = select(Tiers)
    if type_tiers == TypeTiers.CLIENT:
        requete = requete.where(Tiers.est_client.is_(True))
    elif type_tiers == TypeTiers.FOURNISSEUR:
        requete = requete.where(Tiers.est_fournisseur.is_(True))
    if not inclure_inactifs:
        requete = requete.where(Tiers.est_actif.is_(True))
    if recherche and recherche.strip():
        requete = requete.where(contient(recherche, Tiers.nom, Tiers.telephone, Tiers.code_tiers))
    tiers, total, pages = await paginer(session, requete.order_by(Tiers.nom, Tiers.id), pagination)
    return await _lectures(session, tiers), total, pages


async def lire_tiers(session: AsyncSession, tiers_id: uuid.UUID) -> TiersLecture:
    un_tiers = await session.get(Tiers, tiers_id, populate_existing=True)
    if un_tiers is None:
        raise _introuvable()
    return (await _lectures(session, [un_tiers]))[0]


def _chiffres_telephone(telephone: str | None) -> str | None:
    """Les 8 derniers chiffres (numéro malien sans indicatif), ou None si trop court."""
    chiffres = re.sub(r"\D", "", telephone or "")
    return chiffres[-8:] if len(chiffres) >= 8 else None


async def tiers_semblables(
    session: AsyncSession, nom: str, telephone: str | None, sauf: uuid.UUID | None = None
) -> list[Tiers]:
    """Même nom (accents et casse ignorés) ou même numéro de téléphone."""
    conditions = [simplifier_sql(func.trim(Tiers.nom)) == simplifier(nom.strip())]
    chiffres = _chiffres_telephone(telephone)
    if chiffres:
        conditions.append(
            func.right(func.regexp_replace(Tiers.telephone, r"\D", "", "g"), 8) == chiffres
        )
    requete = select(Tiers).where(or_(*conditions)).order_by(Tiers.nom).limit(5)
    if sauf is not None:
        requete = requete.where(Tiers.id != sauf)
    return list((await session.execute(requete)).scalars())


async def creer_tiers(session: AsyncSession, donnees: TiersCreation) -> TiersLecture:
    if not donnees.confirmer_doublon:
        semblables = await tiers_semblables(session, donnees.nom, donnees.telephone)
        if semblables:
            raise ErreurMetier(
                "DOUBLON_PROBABLE",
                "Un client ou fournisseur semblable existe déjà. Ouvrez sa fiche, "
                "ou confirmez qu'il s'agit d'un autre.",
                status.HTTP_409_CONFLICT,
                {
                    "tiers": [
                        {"id": str(t.id), "nom": t.nom, "telephone": t.telephone}
                        for t in semblables
                    ]
                },
            )
    un_tiers = Tiers(
        nom=donnees.nom.strip(),
        telephone=donnees.telephone,
        adresse=donnees.adresse,
        est_client=donnees.est_client,
        est_fournisseur=donnees.est_fournisseur,
    )
    session.add(un_tiers)
    await session.commit()
    return await lire_tiers(session, un_tiers.id)


async def modifier_tiers(
    session: AsyncSession, tiers_id: uuid.UUID, donnees: TiersModification
) -> TiersLecture:
    un_tiers = (
        await session.execute(select(Tiers).where(Tiers.id == tiers_id).with_for_update())
    ).scalar_one_or_none()
    if un_tiers is None:
        raise _introuvable()

    est_client = un_tiers.est_client if donnees.est_client is None else donnees.est_client
    est_fournisseur = (
        un_tiers.est_fournisseur if donnees.est_fournisseur is None else donnees.est_fournisseur
    )
    if not (est_client or est_fournisseur):
        raise ErreurMetier("TYPE_TIERS_REQUIS", "Cochez « Client », « Fournisseur », ou les deux.")

    valeurs = donnees.model_dump(exclude_unset=True)
    for champ, valeur in valeurs.items():
        # Téléphone et adresse peuvent être vidés ; ailleurs, null = inchangé
        if valeur is None and champ not in {"telephone", "adresse"}:
            continue
        setattr(un_tiers, champ, valeur.strip() if champ == "nom" else valeur)
    await session.commit()
    return await lire_tiers(session, tiers_id)
