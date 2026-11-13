"""S1-T1 (premier Super Admin) et comptes de test des parcours de bout en bout."""

from collections.abc import Awaitable, Callable

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.commandes.comptes_e2e import COMPTES, preparer_comptes
from app.core.security import verifier_mot_de_passe
from app.models import Utilisateur
from app.models.enums import RoleUtilisateur
from app.services.utilisateurs import SuperAdminDejaPresent, creer_premier_super_admin

CreerCompte = Callable[..., Awaitable[Utilisateur]]


async def test_creation_du_premier_super_admin(db_session: AsyncSession) -> None:
    admin = await creer_premier_super_admin(
        db_session, "Awa Keita", "Awa@Keitala.ml", "mot-de-passe-solide"
    )

    assert admin.role == RoleUtilisateur.SUPER_ADMIN
    assert admin.est_actif
    assert admin.email == "awa@keitala.ml"
    assert verifier_mot_de_passe("mot-de-passe-solide", admin.mot_de_passe_hash)


async def test_refusee_si_un_super_admin_existe(
    db_session: AsyncSession, creer_compte: CreerCompte
) -> None:
    await creer_compte(RoleUtilisateur.SUPER_ADMIN)

    with pytest.raises(SuperAdminDejaPresent):
        await creer_premier_super_admin(db_session, "Autre", "autre@keitala.ml", "mot-de-passe")


async def test_comptes_e2e_idempotents(db_session: AsyncSession) -> None:
    await preparer_comptes(db_session, "premier-mot-de-passe")
    consultant = (
        await db_session.execute(
            select(Utilisateur).where(Utilisateur.email == "e2e-consultant@keitala.test")
        )
    ).scalar_one()
    consultant.est_actif = False
    await db_session.flush()

    # Relancée : les comptes reviennent à leur état de départ, sans doublon
    await preparer_comptes(db_session, "second-mot-de-passe")

    nombre = (
        await db_session.execute(select(func.count()).where(Utilisateur.email.in_(list(COMPTES))))
    ).scalar_one()
    assert nombre == 3
    await db_session.refresh(consultant)
    assert consultant.est_actif
    assert verifier_mot_de_passe("second-mot-de-passe", consultant.mot_de_passe_hash)
