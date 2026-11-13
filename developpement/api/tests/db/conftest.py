from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Article, CompteTresorerie, Utilisateur
from app.models.enums import FamilleArticle, RoleUtilisateur


@pytest.fixture
async def gestionnaire(db_session: AsyncSession) -> Utilisateur:
    utilisateur = Utilisateur(
        nom_complet="Gestionnaire Test",
        email="gestionnaire@test.ml",
        mot_de_passe_hash="x",
        role=RoleUtilisateur.GESTIONNAIRE,
    )
    db_session.add(utilisateur)
    await db_session.flush()
    return utilisateur


@pytest.fixture
async def article(db_session: AsyncSession) -> Article:
    """Article en kg avec 100 kg en stock, sans dérogation au stock négatif."""
    article = Article(
        code_sku="TEST-ART",
        designation="Article de test",
        famille=FamilleArticle.MATIERE_PREMIERE,
        unite_base="kg",
        stock_actuel=Decimal("100"),
    )
    db_session.add(article)
    await db_session.flush()
    return article


@pytest.fixture
async def caisse(db_session: AsyncSession) -> CompteTresorerie:
    """Compte Caisse créé par les données initiales de la migration."""
    requete = select(CompteTresorerie).where(CompteTresorerie.code == "CAISSE")
    return (await db_session.execute(requete)).scalar_one()
