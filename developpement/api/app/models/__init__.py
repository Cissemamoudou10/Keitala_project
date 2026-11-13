"""Modèles SQLAlchemy des 24 tables de schema.sql v1.1."""

from app.models.achats import Achat, LigneAchat
from app.models.articles import Article, ArticleUnite
from app.models.depenses import ClotureCaisse, Depense, TransactionTresorerie, TransfertInterne
from app.models.production import (
    LigneRecette,
    OfConsommation,
    OfProduction,
    OrdreFabrication,
    Recette,
)
from app.models.reglements import Reglement
from app.models.stocks import Inventaire, LigneInventaire, MouvementStock
from app.models.tiers import Tiers
from app.models.tresorerie import CategorieDepense, CompteTresorerie
from app.models.utilisateurs import CompteurDocument, Utilisateur
from app.models.ventes import LigneVente, Vente

__all__ = [
    "Achat",
    "Article",
    "ArticleUnite",
    "CategorieDepense",
    "ClotureCaisse",
    "CompteTresorerie",
    "CompteurDocument",
    "Depense",
    "Inventaire",
    "LigneAchat",
    "LigneInventaire",
    "LigneRecette",
    "LigneVente",
    "MouvementStock",
    "OfConsommation",
    "OfProduction",
    "OrdreFabrication",
    "Recette",
    "Reglement",
    "Tiers",
    "TransactionTresorerie",
    "TransfertInterne",
    "Utilisateur",
    "Vente",
]
