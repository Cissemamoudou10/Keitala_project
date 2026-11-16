"""Contrôle a posteriori par le Super Admin (US-TRES-05, règle 9) : rien n'attend son
accord ; il marque après coup les dépenses, transferts, inventaires et clôtures."""

import uuid
from datetime import UTC, datetime
from typing import cast

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.erreurs import ErreurMetier
from app.models import (
    CategorieDepense,
    ClotureCaisse,
    CompteTresorerie,
    Depense,
    Inventaire,
    TransfertInterne,
    Utilisateur,
)
from app.models.enums import StatutDocument, StatutInventaire
from app.schemas.depenses import NombreAControler, PieceAControler, TypeControle
from app.services.pieces import fcfa
from app.services.stocks import noms_des_auteurs

# Un inventaire en cours n'est pas encore une opération : il se contrôle une fois clos
INVENTAIRES_CLOS = (StatutInventaire.VALIDE, StatutInventaire.ANNULE)
MODELES: dict[
    TypeControle, type[Depense] | type[TransfertInterne] | type[Inventaire] | type[ClotureCaisse]
] = {
    "depense": Depense,
    "transfert": TransfertInterne,
    "inventaire": Inventaire,
    "cloture": ClotureCaisse,
}


async def compter(session: AsyncSession) -> NombreAControler:
    par_type = {
        "depense": await session.scalar(select(func.count()).where(Depense.controle_le.is_(None))),
        "transfert": await session.scalar(
            select(func.count()).where(TransfertInterne.controle_le.is_(None))
        ),
        "inventaire": await session.scalar(
            select(func.count()).where(
                Inventaire.controle_le.is_(None), Inventaire.statut.in_(INVENTAIRES_CLOS)
            )
        ),
        "cloture": await session.scalar(
            select(func.count()).where(ClotureCaisse.controle_le.is_(None))
        ),
    }
    nombres = {cle: int(valeur or 0) for cle, valeur in par_type.items()}
    return NombreAControler(total=sum(nombres.values()), par_type=nombres)


async def lister(
    session: AsyncSession, type_piece: TypeControle | None, limite: int = 200
) -> list[PieceAControler]:
    """Pièces non contrôlées, les plus récentes d'abord (`limite` par type)."""
    comptes = {c.id: c.nom for c in (await session.execute(select(CompteTresorerie))).scalars()}
    pieces: list[tuple[PieceAControler, uuid.UUID]] = []

    def voulu(nom: TypeControle) -> bool:
        return type_piece is None or type_piece == nom

    if voulu("depense"):
        categories = {
            c.id: c.nom for c in (await session.execute(select(CategorieDepense))).scalars()
        }
        for d in (
            await session.execute(
                select(Depense)
                .where(Depense.controle_le.is_(None))
                .order_by(Depense.date_creation.desc())
                .limit(limite)
            )
        ).scalars():
            annulee = " (annulée)" if d.statut == StatutDocument.ANNULE else ""
            pieces.append(
                (
                    PieceAControler(
                        type="depense",
                        id=d.id,
                        numero=d.numero,
                        date=d.date_depense,
                        resume=f"{categories.get(d.categorie_id, '')} — {d.designation} · "
                        f"{comptes.get(d.compte_id, '')}{annulee}",
                        montant=d.montant,
                        auteur="",
                        date_creation=d.date_creation,
                    ),
                    d.cree_par,
                )
            )
    if voulu("transfert"):
        for t in (
            await session.execute(
                select(TransfertInterne)
                .where(TransfertInterne.controle_le.is_(None))
                .order_by(TransfertInterne.date_creation.desc())
                .limit(limite)
            )
        ).scalars():
            pieces.append(
                (
                    PieceAControler(
                        type="transfert",
                        id=t.id,
                        numero=t.numero,
                        date=t.date_transfert,
                        resume=f"{comptes.get(t.compte_source_id, '')} → "
                        f"{comptes.get(t.compte_destination_id, '')}"
                        + (" (annulé)" if t.statut == StatutDocument.ANNULE else ""),
                        montant=t.montant,
                        auteur="",
                        date_creation=t.date_creation,
                    ),
                    t.cree_par,
                )
            )
    if voulu("inventaire"):
        for i in (
            await session.execute(
                select(Inventaire)
                .where(Inventaire.controle_le.is_(None), Inventaire.statut.in_(INVENTAIRES_CLOS))
                .order_by(Inventaire.date_creation.desc())
                .limit(limite)
            )
        ).scalars():
            pieces.append(
                (
                    PieceAControler(
                        type="inventaire",
                        id=i.id,
                        numero=i.numero,
                        date=i.date_inventaire,
                        resume="Inventaire validé"
                        if i.statut == StatutInventaire.VALIDE
                        else "Inventaire abandonné",
                        montant=None,
                        auteur="",
                        date_creation=i.date_creation,
                    ),
                    i.cree_par,
                )
            )
    if voulu("cloture"):
        for c in (
            await session.execute(
                select(ClotureCaisse)
                .where(ClotureCaisse.controle_le.is_(None))
                .order_by(ClotureCaisse.date_creation.desc())
                .limit(limite)
            )
        ).scalars():
            ecart = (
                "sans écart"
                if c.ecart == 0
                else f"écart de {'+' if c.ecart > 0 else '−'}{fcfa(abs(c.ecart))}"
            )
            pieces.append(
                (
                    PieceAControler(
                        type="cloture",
                        id=c.id,
                        numero=f"Clôture du {c.date_cloture.strftime('%d/%m/%Y')}",
                        date=c.date_cloture,
                        resume=f"{comptes.get(c.compte_id, '')} : {ecart}",
                        montant=c.ecart,
                        auteur="",
                        date_creation=c.date_creation,
                    ),
                    c.cree_par,
                )
            )

    auteurs = await noms_des_auteurs(session, [auteur for _, auteur in pieces])
    resultat = [
        piece.model_copy(update={"auteur": auteurs.get(auteur, "")}) for piece, auteur in pieces
    ]
    return sorted(resultat, key=lambda piece: piece.date_creation, reverse=True)


async def marquer(
    session: AsyncSession, type_piece: TypeControle, piece_id: uuid.UUID, admin: Utilisateur
) -> None:
    modele = MODELES[type_piece]
    # Le type exact dépend de `type_piece` : mypy ne le déduit pas de la table MODELES
    piece = cast(
        Depense | TransfertInterne | Inventaire | ClotureCaisse | None,
        (
            await session.execute(select(modele).where(modele.id == piece_id).with_for_update())
        ).scalar_one_or_none(),
    )
    if piece is None:
        raise ErreurMetier(
            "PIECE_INTROUVABLE", "Cette pièce n'existe pas.", status.HTTP_404_NOT_FOUND
        )
    if isinstance(piece, Inventaire) and piece.statut not in INVENTAIRES_CLOS:
        raise ErreurMetier(
            "INVENTAIRE_EN_COURS",
            "Cet inventaire est encore en cours : il se contrôle une fois validé.",
            status.HTTP_409_CONFLICT,
        )
    if piece.controle_le is not None:
        raise ErreurMetier("DEJA_CONTROLE", "Cette pièce est déjà contrôlée.", 409)
    piece.controle_par = admin.id
    piece.controle_le = datetime.now(UTC)
    await session.commit()
