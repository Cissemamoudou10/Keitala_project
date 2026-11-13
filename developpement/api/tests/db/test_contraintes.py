"""Contraintes et déclencheurs de la base : le dernier rempart des règles métier.

Règles d'AGENTS.md section 6 couvertes ici, au niveau de la base :
2 (pas de stock négatif), 4 (journaux immuables), 6 (règlement rattaché à une pièce),
et la cohérence des journaux et des colonnes calculées.
"""

from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Article,
    ArticleUnite,
    CategorieDepense,
    CompteTresorerie,
    LigneVente,
    MouvementStock,
    Reglement,
    TransactionTresorerie,
    Utilisateur,
    Vente,
)
from app.models.enums import TypeFluxTresorerie, TypeMouvementStock


async def erreur_sql(session: AsyncSession, sql: str, **params: Any) -> str:
    """Exécute une requête qui doit échouer ; renvoie le message d'erreur de PostgreSQL."""
    with pytest.raises(DBAPIError) as erreur:
        async with session.begin_nested():
            await session.execute(text(sql), params)
    return str(erreur.value.orig)


async def erreur_insertion(session: AsyncSession, objet: object) -> str:
    """Ajoute un objet dont l'insertion doit échouer ; renvoie le message d'erreur."""
    with pytest.raises(DBAPIError) as erreur:
        async with session.begin_nested():
            session.add(objet)
            await session.flush()
    session.expunge_all()
    return str(erreur.value.orig)


def mouvement(article: Article, utilisateur: Utilisateur, **valeurs: Any) -> MouvementStock:
    champs: dict[str, Any] = {
        "type_mouvement": TypeMouvementStock.ENTREE_ACHAT,
        "quantite": Decimal("10"),
        "stock_avant": Decimal("100"),
        "stock_apres": Decimal("110"),
    }
    champs.update(valeurs)
    return MouvementStock(article_id=article.id, utilisateur_id=utilisateur.id, **champs)


def ecriture(compte: CompteTresorerie, utilisateur: Utilisateur, **valeurs: Any) -> Any:
    champs: dict[str, Any] = {
        "type_flux": TypeFluxTresorerie.SOLDE_INITIAL,
        "sens": "CREDIT",
        "montant": Decimal("5000"),
        "solde_avant": Decimal("0"),
        "solde_apres": Decimal("5000"),
        "libelle": "Solde d'ouverture",
    }
    champs.update(valeurs)
    return TransactionTresorerie(compte_id=compte.id, utilisateur_id=utilisateur.id, **champs)


# --- Données initiales -------------------------------------------------------------


async def test_donnees_initiales_presentes(db_session: AsyncSession) -> None:
    async def compter(modele: type[Any]) -> int:
        return (await db_session.execute(select(func.count()).select_from(modele))).scalar_one()

    assert await compter(CompteTresorerie) == 5
    assert await compter(CategorieDepense) == 7
    assert await compter(Article) == 29
    assert await compter(ArticleUnite) == 5


# --- Règle 2 : pas de stock négatif -------------------------------------------------


async def test_stock_negatif_refuse(db_session: AsyncSession, article: Article) -> None:
    message = await erreur_sql(
        db_session, "UPDATE articles SET stock_actuel = -1 WHERE id = :id", id=article.id
    )
    assert "chk_stock_non_negatif" in message


async def test_stock_negatif_accepte_avec_derogation(
    db_session: AsyncSession, article: Article
) -> None:
    article.autoriser_stock_negatif = True
    article.stock_actuel = Decimal("-5")
    await db_session.flush()
    await db_session.refresh(article)
    assert article.stock_actuel == Decimal("-5.000")


# --- Règle 4 : journaux immuables ---------------------------------------------------


async def test_mouvement_stock_ni_modifiable_ni_supprimable(
    db_session: AsyncSession, article: Article, gestionnaire: Utilisateur
) -> None:
    ligne = mouvement(article, gestionnaire)
    db_session.add(ligne)
    await db_session.flush()

    message = await erreur_sql(
        db_session, "UPDATE mouvements_stock SET motif = 'x' WHERE id = :id", id=ligne.id
    )
    assert "Journal immuable : UPDATE interdit sur mouvements_stock" in message

    message = await erreur_sql(
        db_session, "DELETE FROM mouvements_stock WHERE id = :id", id=ligne.id
    )
    assert "Journal immuable : DELETE interdit sur mouvements_stock" in message


async def test_transaction_tresorerie_ni_modifiable_ni_supprimable(
    db_session: AsyncSession, caisse: CompteTresorerie, gestionnaire: Utilisateur
) -> None:
    ligne = ecriture(caisse, gestionnaire)
    db_session.add(ligne)
    await db_session.flush()

    message = await erreur_sql(
        db_session,
        "UPDATE transactions_tresorerie SET libelle = 'x' WHERE id = :id",
        id=ligne.id,
    )
    assert "Journal immuable : UPDATE interdit sur transactions_tresorerie" in message

    message = await erreur_sql(
        db_session, "DELETE FROM transactions_tresorerie WHERE id = :id", id=ligne.id
    )
    assert "Journal immuable : DELETE interdit sur transactions_tresorerie" in message


# --- Cohérence des journaux ---------------------------------------------------------


async def test_mouvement_incoherent_refuse(
    db_session: AsyncSession, article: Article, gestionnaire: Utilisateur
) -> None:
    ligne = mouvement(article, gestionnaire, stock_apres=Decimal("999"))
    assert "chk_mouvement_coherent" in await erreur_insertion(db_session, ligne)


async def test_perte_sans_motif_refusee(
    db_session: AsyncSession, article: Article, gestionnaire: Utilisateur
) -> None:
    ligne = mouvement(
        article,
        gestionnaire,
        type_mouvement=TypeMouvementStock.SORTIE_PERTE,
        quantite=Decimal("-10"),
        stock_apres=Decimal("90"),
    )
    assert "chk_mouvement_perte" in await erreur_insertion(db_session, ligne)


async def test_ecriture_tresorerie_incoherente_refusee(
    db_session: AsyncSession, caisse: CompteTresorerie, gestionnaire: Utilisateur
) -> None:
    ligne = ecriture(caisse, gestionnaire, sens="DEBIT")  # 0 - 5000 n'égale pas 5000
    assert "chk_transaction_coherente" in await erreur_insertion(db_session, ligne)


# --- Ventes, dons et règlements -----------------------------------------------------


async def test_don_avec_montant_refuse(db_session: AsyncSession, gestionnaire: Utilisateur) -> None:
    don = Vente(
        numero_facture="DON-2026-0001",
        est_don=True,
        montant_total=Decimal("1000"),
        beneficiaire_don="École",
        motif_don="Dégustation",
        cree_par=gestionnaire.id,
    )
    assert "chk_vente_don" in await erreur_insertion(db_session, don)


async def test_reglement_sans_piece_refuse(
    db_session: AsyncSession, caisse: CompteTresorerie, gestionnaire: Utilisateur
) -> None:
    reglement = Reglement(compte_id=caisse.id, montant=Decimal("1000"), cree_par=gestionnaire.id)
    assert "chk_reglement_cible" in await erreur_insertion(db_session, reglement)


async def test_compte_mobile_money_exige_un_operateur(db_session: AsyncSession) -> None:
    message = await erreur_sql(
        db_session,
        "INSERT INTO comptes_tresorerie (code, nom, type) VALUES ('MM', 'Sans opérateur', "
        "'MOBILE_MONEY')",
    )
    assert "chk_compte_operateur" in message


# --- Règle 1 : unité de base et colonnes calculées ----------------------------------


async def test_ligne_vente_convertit_en_unite_de_base(
    db_session: AsyncSession, article: Article, gestionnaire: Utilisateur
) -> None:
    vente = Vente(numero_facture="FAC-2026-0001", cree_par=gestionnaire.id)
    db_session.add(vente)
    await db_session.flush()

    # 3 sacs de 50 kg à 12 500 FCFA le sac
    ligne = LigneVente(
        vente_id=vente.id,
        article_id=article.id,
        facteur_conversion=Decimal("50"),
        quantite=Decimal("3"),
        prix_unitaire=Decimal("12500"),
    )
    db_session.add(ligne)
    await db_session.flush()
    await db_session.refresh(ligne)

    assert ligne.quantite_base == Decimal("150.000")
    assert ligne.montant_total == Decimal("37500.00")
