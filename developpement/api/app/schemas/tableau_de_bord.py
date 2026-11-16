"""Pilotage (Sprint 8) : tableau de bord et marges (US-DASH-01, 02)."""

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.models.enums import TypeCompteTresorerie
from app.schemas.stocks import ArticleResume


class SoldeCompte(BaseModel):
    id: int
    nom: str
    type: TypeCompteTresorerie
    solde: Decimal


class VenteDuJour(BaseModel):
    date: date
    montant: Decimal


class StockBas(BaseModel):
    article: ArticleResume
    stock_actuel: Decimal
    stock_minimum: Decimal


class Impaye(BaseModel):
    id: uuid.UUID
    numero: str
    client: str | None
    date_vente: date
    reste_a_payer: Decimal


class Indicateurs(BaseModel):
    ca_jour: Decimal
    ca_mois: Decimal
    valeur_stock: Decimal
    solde_global: Decimal
    comptes: list[SoldeCompte]
    total_creances: Decimal
    total_dettes: Decimal
    articles_sous_seuil: int
    ordres_en_cours: int
    # Graphique : ventes des 30 derniers jours, aujourd'hui compris, jours sans vente à 0
    ventes_30_jours: list[VenteDuJour]
    # « À traiter » (charte, section 11) : quelques lignes, les plus urgentes
    stocks_bas: list[StockBas]
    impayes_anciens: list[Impaye]


class MargeArticle(BaseModel):
    article: ArticleResume
    quantite_vendue: Decimal
    chiffre_affaires: Decimal
    # Coût moyen de l'article au moment de chaque vente (lignes_vente.cout_unitaire_base)
    cout_de_revient: Decimal
    marge: Decimal
    # Marge ÷ chiffre d'affaires, en pourcentage ; None sans chiffre d'affaires
    taux_marge: Decimal | None


class RapportMarges(BaseModel):
    du: date | None
    au: date | None
    articles: list[MargeArticle]
    chiffre_affaires: Decimal
    cout_de_revient: Decimal
    marge: Decimal
    taux_marge: Decimal | None
