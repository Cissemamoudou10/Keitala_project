"""Journal des comptes et synthèse de la trésorerie (US-TRES-01)."""

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import Numeric, Select, column, func, select, table
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.pagination import paginer_lignes
from app.models import (
    Achat,
    CompteTresorerie,
    Depense,
    Reglement,
    TransactionTresorerie,
    TransfertInterne,
    Vente,
)
from app.models.enums import TypeFluxTresorerie
from app.schemas.common import PaginationParams
from app.schemas.depenses import EcritureLecture, SyntheseTresorerie
from app.services.stocks import FUSEAU, noms_des_auteurs

V_TIERS_SOLDES = table(
    "v_tiers_soldes", column("solde_creance", Numeric), column("solde_dette", Numeric)
)


async def lister_ecritures(
    session: AsyncSession,
    pagination: PaginationParams,
    *,
    compte_id: int | None = None,
    type_flux: TypeFluxTresorerie | None = None,
    du: date | None = None,
    au: date | None = None,
) -> tuple[list[EcritureLecture], int, int]:
    """Écritures du plus récent au plus ancien, avec la pièce d'origine."""
    piece = func.coalesce(
        Vente.numero_facture, Achat.numero, Depense.numero, TransfertInterne.numero
    ).label("piece")
    requete: Select[TransactionTresorerie, str, str | None] = (
        select(TransactionTresorerie, CompteTresorerie.nom, piece)
        .join(CompteTresorerie, CompteTresorerie.id == TransactionTresorerie.compte_id)
        .outerjoin(Reglement, Reglement.id == TransactionTresorerie.reglement_id)
        .outerjoin(Vente, Vente.id == Reglement.vente_id)
        .outerjoin(Achat, Achat.id == Reglement.achat_id)
        .outerjoin(Depense, Depense.id == TransactionTresorerie.depense_id)
        .outerjoin(TransfertInterne, TransfertInterne.id == TransactionTresorerie.transfert_id)
    )
    if compte_id is not None:
        requete = requete.where(TransactionTresorerie.compte_id == compte_id)
    if type_flux is not None:
        requete = requete.where(TransactionTresorerie.type_flux == type_flux)
    if du is not None:
        requete = requete.where(
            TransactionTresorerie.date_transaction >= datetime.combine(du, time.min, FUSEAU)
        )
    if au is not None:
        lendemain = datetime.combine(au, time.min, FUSEAU) + timedelta(days=1)
        requete = requete.where(TransactionTresorerie.date_transaction < lendemain)
    requete = requete.order_by(
        TransactionTresorerie.date_transaction.desc(), TransactionTresorerie.id.desc()
    )
    lignes, total, pages = await paginer_lignes(session, requete, pagination)
    auteurs = await noms_des_auteurs(session, [t.utilisateur_id for t, _, _ in lignes])
    return (
        [
            EcritureLecture(
                id=t.id,
                date_transaction=t.date_transaction,
                compte_id=t.compte_id,
                compte=compte,
                type_flux=t.type_flux,
                sens="CREDIT" if t.sens == "CREDIT" else "DEBIT",
                montant=t.montant,
                solde_avant=t.solde_avant,
                solde_apres=t.solde_apres,
                libelle=t.libelle,
                piece=numero,
                auteur=auteurs.get(t.utilisateur_id, ""),
            )
            for t, compte, numero in lignes
        ],
        total,
        pages,
    )


async def synthese(session: AsyncSession) -> SyntheseTresorerie:
    solde = await session.scalar(select(func.coalesce(func.sum(CompteTresorerie.solde_actuel), 0)))
    creances, dettes = (
        await session.execute(
            select(
                func.coalesce(func.sum(V_TIERS_SOLDES.c.solde_creance), 0),
                func.coalesce(func.sum(V_TIERS_SOLDES.c.solde_dette), 0),
            )
        )
    ).one()
    return SyntheseTresorerie(
        solde_global=Decimal(solde or 0),
        total_creances=Decimal(creances),
        total_dettes=Decimal(dettes),
    )
