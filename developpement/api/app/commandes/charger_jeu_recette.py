"""S9-8 : jeu de données de recette, réaliste, sur une base neuve (D-038).

Passe par les services de l'API, comme le ferait l'application : stocks, coûts moyens,
soldes et numéros de pièces restent cohérents. Tirages aléatoires figés (même jeu à
chaque chargement).

Usage (dans le conteneur, sur une base qui n'a encore aucune pièce) :
    python -m app.commandes.charger_jeu_recette --confirmer

Crée un Gestionnaire et un Consultant de recette : leurs mots de passe, générés, sont
affichés une seule fois à la fin. Le Super Admin se crée à part (creer_super_admin).

Limite : les écritures de trésorerie et les mouvements de stock portent la date du
chargement ; les pièces (ventes, achats, dépenses…) portent leur date sur 30 jours.
"""

import argparse
import asyncio
import random
import secrets
import uuid
from collections.abc import Awaitable
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import selectinload
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.erreurs import ErreurMetier
from app.models import Achat, Article, CategorieDepense, CompteTresorerie, Utilisateur, Vente
from app.models.enums import FamilleArticle, MotifEcart, RoleUtilisateur, TypeOf
from app.schemas.achats import AchatCreation, LigneAchatCreation
from app.schemas.articles import ArticleCreation, ArticleModification, UniteSaisie, UnitesArticle
from app.schemas.depenses import DepenseCreation, TransfertCreation
from app.schemas.pieces import PaiementCreation, ReglementSaisie
from app.schemas.production import (
    Cloture,
    ComposantSaisie,
    ConsommationReelle,
    OrdreCreation,
    RecetteSaisie,
    SortieCreation,
)
from app.schemas.stocks import Comptage, LigneComptage
from app.schemas.tiers import TiersCreation
from app.schemas.utilisateurs import UtilisateurCreation
from app.schemas.ventes import DonCreation, LigneDonCreation, LigneVenteCreation, VenteCreation
from app.services import (
    achats,
    articles,
    depenses,
    inventaires,
    production,
    tiers,
    transferts,
    tresorerie,
    utilisateurs,
    ventes,
)
from app.services.pieces import aujourd_hui

JOURS = 30
D = Decimal

# --- Catalogue ------------------------------------------------------------------------

# Articles absents de l'Excel, nécessaires à la production (règle 8)
NOUVEAUX: list[tuple[str, str, str | None, FamilleArticle, str]] = [
    ("KN-MAN-ATVRAC", "Attiéké vrac", None, FamilleArticle.SEMI_FINI, "kg"),
    ("KN-MAN-GARVRAC", "Gari vrac", None, FamilleArticle.SEMI_FINI, "kg"),
    ("KN-SOJ-CAFVRAC", "Café de soja vrac", None, FamilleArticle.SEMI_FINI, "kg"),
    ("EM-SAC-500", "Sachet imprimé", "500 g", FamilleArticle.EMBALLAGE, "sachet"),
    ("EM-SAC-200", "Sachet imprimé", "200 g", FamilleArticle.EMBALLAGE, "sachet"),
]

# Prix de vente (FCFA par unité de base) et seuil d'alerte
PRIX_SEUILS: dict[str, tuple[int, int]] = {
    "MP-MAI": (275, 300),
    "MP-MIL": (325, 250),
    "MP-SOJ-CON": (400, 250),
    "MP-SOJ-SEM": (1000, 100),
    "MP-MAN": (0, 300),
    "KN-MAN-ATVRAC": (0, 50),
    "KN-MAN-GARVRAC": (0, 30),
    "KN-SOJ-CAFVRAC": (0, 20),
    "EM-SAC-500": (0, 300),
    "EM-SAC-200": (0, 300),
    "KN-MAN-ATS500": (750, 100),
    "KN-MAN-ATS200": (350, 60),
    "KN-MAN-GAR500": (600, 60),
    "KN-SOJ-CAF200": (1000, 50),
    "KN-TAP-TAP200": (400, 30),
    "KN-DJU-DJU1KG": (1500, 20),
    "KN-FON-FON1KG": (1250, 20),
    "KN-SOJ-HUI1L": (1500, 12),
    "KN-SOJ-FAR200": (500, 30),
}

UNITES: dict[str, list[tuple[str, int]]] = {
    "MP-MAI": [("Sac 50 kg", 50)],
    "MP-MIL": [("Sac 50 kg", 50)],
    "MP-SOJ-CON": [("Sac 50 kg", 50)],
    "MP-SOJ-SEM": [("Sac 50 kg", 50)],
    "MP-MAN": [("Bassine 25 kg", 25)],
    "KN-MAN-ATS500": [("Carton 20 sachets", 20)],
    "KN-MAN-GAR500": [("Carton 20 sachets", 20)],
    "KN-SOJ-CAF200": [("Carton 24 sachets", 24)],
    "EM-SAC-500": [("Paquet 100", 100)],
    "EM-SAC-200": [("Paquet 100", 100)],
}

# Stock de départ (inventaire) : quantité, coût unitaire
DEPART: dict[str, tuple[int, int]] = {
    "MP-MAI": (1500, 200),
    "MP-MIL": (1000, 240),
    "MP-SOJ-CON": (800, 300),
    "MP-SOJ-SEM": (300, 650),
    "MP-MAN": (400, 150),
    "EM-SAC-500": (2000, 40),
    "EM-SAC-200": (1500, 25),
    "KN-MAN-ATS500": (120, 500),
    "KN-MAN-ATS200": (100, 240),
    "KN-MAN-GAR500": (80, 420),
    "KN-SOJ-CAF200": (60, 650),
    "KN-TAP-TAP200": (50, 250),
    "KN-DJU-DJU1KG": (30, 1000),
    "KN-FON-FON1KG": (40, 850),
    "KN-SOJ-HUI1L": (24, 1100),
    "KN-SOJ-FAR200": (40, 300),
}

# (étape, produit, nom, quantité de base, [(composant, quantité)])
RECETTES: list[tuple[TypeOf, str, str, str, list[tuple[str, str]]]] = [
    (TypeOf.TRANSFORMATION, "KN-MAN-ATVRAC", "Attiéké vrac", "100", [("MP-MAN", "160")]),
    (TypeOf.TRANSFORMATION, "KN-MAN-GARVRAC", "Gari vrac", "100", [("MP-MAN", "230")]),
    (TypeOf.TRANSFORMATION, "KN-SOJ-CAFVRAC", "Café de soja vrac", "100", [("MP-SOJ-CON", "130")]),
    (
        TypeOf.CONDITIONNEMENT,
        "KN-MAN-ATS500",
        "Attiéké sec 500 g",
        "1",
        [("KN-MAN-ATVRAC", "0.5"), ("EM-SAC-500", "1")],
    ),
    (
        TypeOf.CONDITIONNEMENT,
        "KN-MAN-GAR500",
        "Gari 500 g",
        "1",
        [("KN-MAN-GARVRAC", "0.5"), ("EM-SAC-500", "1")],
    ),
    (
        TypeOf.CONDITIONNEMENT,
        "KN-SOJ-CAF200",
        "Café de soja 200 g",
        "1",
        [("KN-SOJ-CAFVRAC", "0.2"), ("EM-SAC-200", "1")],
    ),
]

CLIENTS = [
    ("Boutique Awa Traoré", "Marché de Médine, Bamako"),
    ("Supermarché Azar Libre-Service", "ACI 2000, Bamako"),
    ("Restaurant Le Badala", "Badalabougou, Bamako"),
    ("Mme Coulibaly Fatoumata (revendeuse)", "Marché de Kalaban Coura"),
    ("Hôtel Mandé", "Quartier du Fleuve, Bamako"),
    ("Cantine scolaire de Kalaban", "Kalaban Coro"),
]
FOURNISSEURS = [
    ("Coopérative des femmes de Kati", "Kati"),
    ("Producteurs de soja de Sikasso", "Sikasso"),
    ("Emballages du Sahel", "Zone industrielle, Bamako"),
    ("GIE Céréales de Ségou", "Ségou"),
]
OUVERTURES = {
    "CAISSE": 500_000,
    "BANQUE": 3_000_000,
    "ORANGE_MONEY": 200_000,
    "WAVE": 150_000,
    "MOBICASH": 50_000,
}


class Contexte:
    def __init__(self, session: AsyncSession, auteur: Utilisateur) -> None:
        self.session = session
        self.auteur = auteur
        self.auteur_id = auteur.id
        # Identifiants seulement : un objet chargé expire après un rollback (opération sautée)
        self.articles: dict[str, uuid.UUID] = {}
        self.comptes: dict[str, int] = {}
        self.clients: dict[str, uuid.UUID] = {}
        self.fournisseurs: dict[str, uuid.UUID] = {}
        self.recettes: dict[str, uuid.UUID] = {}
        self.categories: dict[str, int] = {}
        self.journal: list[str] = []

    def id(self, code: str) -> uuid.UUID:
        return self.articles[code]


async def _base_vierge(session: AsyncSession) -> None:
    pieces = await session.scalar(select(func.count()).select_from(Vente)) or 0
    pieces += await session.scalar(select(func.count()).select_from(Achat)) or 0
    comptes = await session.scalar(
        select(func.count()).where(Utilisateur.role != RoleUtilisateur.SUPER_ADMIN)
    )
    if pieces or comptes:
        raise SystemExit(
            "Base déjà utilisée (pièces ou comptes présents) : le jeu de recette ne se charge "
            "que sur une base neuve. Rien n'a été modifié."
        )


async def _comptes_recette(session: AsyncSession) -> tuple[Utilisateur, dict[str, str]]:
    acces: dict[str, str] = {}
    gestionnaire = None
    for nom, email, role in [
        (
            "Awa Diarra (Gestionnaire)",
            "gestionnaire.recette@example.com",
            RoleUtilisateur.GESTIONNAIRE,
        ),
        ("Moussa Keïta (Consultant)", "consultant.recette@example.com", RoleUtilisateur.CONSULTANT),
    ]:
        mot_de_passe = secrets.token_urlsafe(12)
        compte = await utilisateurs.creer_utilisateur(
            session,
            UtilisateurCreation(nom_complet=nom, email=email, role=role, mot_de_passe=mot_de_passe),
        )
        acces[email] = mot_de_passe
        if role == RoleUtilisateur.GESTIONNAIRE:
            gestionnaire = compte
    assert gestionnaire is not None
    return gestionnaire, acces


async def _catalogue(c: Contexte) -> None:
    for code, designation, contenance, famille, unite in NOUVEAUX:
        await articles.creer_article(
            c.session,
            ArticleCreation(
                code_sku=code,
                designation=designation,
                contenance=contenance,
                famille=famille,
                unite_base=unite,
            ),
            c.auteur,
        )
    for article in (await c.session.execute(select(Article))).scalars():
        c.articles[article.code_sku] = article.id
    for code, (prix, seuil) in PRIX_SEUILS.items():
        await articles.modifier_article(
            c.session,
            c.id(code),
            ArticleModification(prix_vente_standard=D(prix), stock_minimum=D(seuil)),
            c.auteur,
        )
    for code, unites in UNITES.items():
        await articles.definir_unites(
            c.session,
            c.id(code),
            UnitesArticle(
                unites=[UniteSaisie(libelle=lib, facteur_vers_base=D(f)) for lib, f in unites]
            ),
        )
    c.journal.append(f"Catalogue : {len(NOUVEAUX)} articles ajoutés, prix et seuils réglés")


async def _tiers(c: Contexte) -> None:
    for nom, adresse in CLIENTS:
        lu = await tiers.creer_tiers(
            c.session, TiersCreation(nom=nom, adresse=adresse, est_client=True)
        )
        c.clients[nom] = lu.id
    for nom, adresse in FOURNISSEURS:
        lu = await tiers.creer_tiers(
            c.session, TiersCreation(nom=nom, adresse=adresse, est_fournisseur=True)
        )
        c.fournisseurs[nom] = lu.id
    c.journal.append(f"Tiers : {len(CLIENTS)} clients, {len(FOURNISSEURS)} fournisseurs")


async def _tresorerie(c: Contexte) -> None:
    for compte in (await c.session.execute(select(CompteTresorerie))).scalars():
        c.comptes[compte.code] = compte.id
    for code, montant in OUVERTURES.items():
        await tresorerie.saisir_solde_ouverture(c.session, c.comptes[code], D(montant), c.auteur.id)
    for categorie in (await c.session.execute(select(CategorieDepense))).scalars():
        c.categories[categorie.nom] = categorie.id
    c.journal.append("Trésorerie : soldes d'ouverture des 5 comptes")


async def _stock_de_depart(c: Contexte) -> None:
    inventaire = await inventaires.ouvrir_inventaire(
        c.session, None, "Inventaire de départ (jeu de recette)", c.auteur
    )
    await inventaires.saisir_comptage(
        c.session,
        inventaire.id,
        Comptage(
            lignes=[
                LigneComptage(
                    article_id=c.id(code),
                    stock_physique=D(quantite),
                    motif=MotifEcart.AUTRE,
                    commentaire="Stock de départ",
                    cout_unitaire=D(cout),
                )
                for code, (quantite, cout) in DEPART.items()
            ]
        ),
    )
    await inventaires.valider_inventaire(c.session, inventaire.id, c.auteur)
    c.journal.append(f"Stock de départ : inventaire validé, {len(DEPART)} articles valorisés")


async def _recettes(c: Contexte) -> None:
    for type_of, produit, nom, base, composants in RECETTES:
        lue = await production.creer_recette(
            c.session,
            RecetteSaisie(
                type_of=type_of,
                article_produit_id=c.id(produit),
                nom_recette=nom,
                quantite_base_produite=D(base),
                composants=[
                    ComposantSaisie(article_id=c.id(a), quantite=D(q)) for a, q in composants
                ],
            ),
        )
        c.recettes[produit] = lue.id
    c.journal.append(f"Recettes : {len(RECETTES)} (3 transformations, 3 conditionnements)")


# --- Activité sur 30 jours -------------------------------------------------------------


async def _essayer(c: Contexte, libelle: str, operation: Awaitable[object]) -> bool:
    """Une opération refusée par une règle métier (stock, solde) est sautée, pas fatale."""
    try:
        await operation
        return True
    except ErreurMetier as erreur:
        await c.session.rollback()
        # Comme une nouvelle requête de l'API : l'auteur est relu (l'objet a expiré)
        auteur = await c.session.get(Utilisateur, c.auteur_id, populate_existing=True)
        assert auteur is not None
        c.auteur = auteur
        c.journal.append(f"  sautée ({libelle}) : {erreur.message}")
        return False


def _cle() -> uuid.UUID:
    return uuid.uuid4()


async def _article(c: Contexte, code: str) -> Article:
    """Article relu en base, avec ses unités (prix et coût à jour)."""
    article = (
        await c.session.execute(
            select(Article)
            .where(Article.id == c.id(code))
            .options(selectinload(Article.unites))
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return article


async def _acheter(
    c: Contexte,
    jour: date,
    fournisseur: str,
    lignes: list[tuple[str, int | None, str, str]],
    payes: list[tuple[str, int]],
    facture: str,
) -> uuid.UUID | None:
    """lignes : (article, indice d'unité ou None, quantité, prix)."""
    resultat: list[uuid.UUID] = []

    async def action() -> None:
        lignes_saisies = []
        for code, unite, quantite, prix in lignes:
            unite_id = None
            if unite is not None:
                unite_id = (await _article(c, code)).unites[unite].id
            lignes_saisies.append(
                LigneAchatCreation(
                    article_id=c.id(code),
                    unite_id=unite_id,
                    quantite=D(quantite),
                    prix_unitaire=D(prix),
                )
            )
        achat, _ = await achats.creer_achat(
            c.session,
            AchatCreation(
                cle_idempotence=_cle(),
                fournisseur_id=c.fournisseurs[fournisseur],
                numero_facture_fournisseur=facture,
                date_achat=jour,
                lignes=lignes_saisies,
                reglements=[
                    ReglementSaisie(compte_id=c.comptes[k], montant=D(m)) for k, m in payes
                ],
            ),
            c.auteur,
        )
        resultat.append(achat.id)

    await _essayer(c, f"achat {facture}", action())
    return resultat[0] if resultat else None


async def _produire(
    c: Contexte, jour: date, produit: str, visee: str, sortie: str, consos: dict[str, str]
) -> None:
    async def action() -> None:
        ordre = await production.lancer_ordre(
            c.session,
            OrdreCreation(recette_id=c.recettes[produit], quantite_prevue=D(visee)),
            c.auteur,
        )
        await production.declarer_sortie(
            c.session,
            ordre.id,
            SortieCreation(article_id=c.id(produit), quantite=D(sortie), date_production=jour),
        )
        await production.cloturer_ordre(
            c.session,
            ordre.id,
            Cloture(
                consommations=[
                    ConsommationReelle(article_id=c.id(a), quantite=D(q)) for a, q in consos.items()
                ],
                pertes=D(0),
            ),
            c.auteur,
        )

    await _essayer(c, f"production {produit}", action())


async def _vendre(
    c: Contexte,
    jour: date,
    client: str | None,
    lignes: list[tuple[str, int | None, str]],
    payes: list[tuple[str, int]],
    remise: Decimal = D(1),
) -> dict[str, object] | None:
    """lignes : (article, indice d'unité ou None, quantité) au prix catalogue × remise."""
    resultat: list[dict[str, object]] = []

    async def action() -> None:
        saisies = []
        total = D(0)
        for code, unite, quantite in lignes:
            article = await _article(c, code)
            facteur = D(1)
            unite_id = None
            if unite is not None:
                unite_id = article.unites[unite].id
                facteur = article.unites[unite].facteur_vers_base
            prix = (article.prix_vente_standard * facteur * remise).quantize(D(1))
            saisies.append(
                LigneVenteCreation(
                    article_id=article.id,
                    unite_id=unite_id,
                    quantite=D(quantite),
                    prix_unitaire=prix,
                )
            )
            total += prix * D(quantite)
        reglements = [
            ReglementSaisie(
                compte_id=c.comptes[k],
                montant=total if m == -1 else D(m),
                reference_paiement=f"TX{random.randint(100000, 999999)}" if k != "CAISSE" else None,
            )
            for k, m in payes
        ]
        vente, _ = await ventes.creer_vente(
            c.session,
            VenteCreation(
                cle_idempotence=_cle(),
                client_id=c.clients[client] if client else None,
                date_vente=jour,
                lignes=saisies,
                reglements=reglements,
            ),
            c.auteur,
        )
        resultat.append({"id": vente.id, "reste": vente.reste_a_payer})

    await _essayer(c, f"vente du {jour}", action())
    return resultat[0] if resultat else None


async def _depenser(
    c: Contexte, jour: date, categorie: str, compte: str, libelle: str, montant: int
) -> None:
    await _essayer(
        c,
        f"dépense {libelle}",
        depenses.creer_depense(
            c.session,
            DepenseCreation(
                cle_idempotence=_cle(),
                categorie_id=c.categories[categorie],
                compte_id=c.comptes[compte],
                date_depense=jour,
                designation=libelle,
                montant=D(montant),
                piece_justificative=f"Reçu {random.randint(100, 999)}",
            ),
            c.auteur,
        ),
    )


async def _activite(c: Contexte) -> None:
    hasard = random.Random(2026)
    random.seed(2026)
    aujourd = aujourd_hui()
    debut = aujourd - timedelta(days=JOURS - 1)
    creances: list[tuple[date, uuid.UUID]] = []
    a_annuler: dict[str, uuid.UUID] = {}
    nb = {"ventes": 0, "achats": 0, "ordres": 0, "depenses": 0}

    for i in range(JOURS):
        jour = debut + timedelta(days=i)
        semaine = i % 7

        # Approvisionnements : pâte de manioc chaque lundi, soja et sachets tous les 10 jours
        if semaine == 0:
            achat = await _acheter(
                c,
                jour,
                "Coopérative des femmes de Kati",
                [("MP-MAN", 0, "24", "3750")],  # 24 bassines de 25 kg = 600 kg
                [("CAISSE", 50_000)],  # le reste à crédit
                f"BL-KATI-{i:02d}",
            )
            nb["achats"] += achat is not None
        if i in (2, 12, 22):
            achat = await _acheter(
                c,
                jour,
                "Producteurs de soja de Sikasso",
                [("MP-SOJ-CON", 0, "8", "15500")],
                [("BANQUE", 124_000)],
                f"FAC-SIK-{i:02d}",
            )
            nb["achats"] += achat is not None
        if i in (4, 18):
            achat = await _acheter(
                c,
                jour,
                "Emballages du Sahel",
                [("EM-SAC-500", 0, "10", "4000"), ("EM-SAC-200", 0, "5", "2500")],
                [("BANQUE", 52_500)],
                f"ES-{i:02d}",
            )
            nb["achats"] += achat is not None
        if i == 8:
            achat = await _acheter(
                c,
                jour,
                "GIE Céréales de Ségou",
                [("MP-MAI", 0, "20", "10000"), ("MP-MIL", 0, "10", "12500")],
                [("BANQUE", 200_000), ("ORANGE_MONEY", 25_000)],
                "GIE-0458",
            )
            nb["achats"] += achat is not None
        if i == 20:
            # Achat saisi en double : annulé dans la foulée (US-ACH-04)
            doublon = await _acheter(
                c,
                jour,
                "GIE Céréales de Ségou",
                [("MP-MIL", 0, "2", "12500")],
                [("CAISSE", 25_000)],
                "GIE-0458-bis",
            )
            if doublon:
                a_annuler["achat"] = doublon

        # Production : attiéké chaque mardi et mercredi, gari et café de soja en alternance
        if semaine == 1:
            await _produire(c, jour, "KN-MAN-ATVRAC", "150", "92", {"MP-MAN": "240"})
            nb["ordres"] += 1
        if semaine == 2:
            await _produire(
                c, jour, "KN-MAN-ATS500", "180", "176", {"KN-MAN-ATVRAC": "89", "EM-SAC-500": "178"}
            )
            nb["ordres"] += 1
        if i in (9, 23):
            await _produire(c, jour, "KN-MAN-GARVRAC", "60", "57", {"MP-MAN": "138"})
            await _produire(
                c,
                jour,
                "KN-MAN-GAR500",
                "110",
                "108",
                {"KN-MAN-GARVRAC": "55", "EM-SAC-500": "109"},
            )
            nb["ordres"] += 2
        if i in (5, 19):
            await _produire(c, jour, "KN-SOJ-CAFVRAC", "40", "38", {"MP-SOJ-CON": "52"})
            await _produire(
                c,
                jour,
                "KN-SOJ-CAF200",
                "180",
                "175",
                {"KN-SOJ-CAFVRAC": "35.5", "EM-SAC-200": "177"},
            )
            nb["ordres"] += 2

        # Ventes du jour : comptoir, Mobile Money, clients à crédit
        for _ in range(hasard.randint(2, 4)):
            tirage = hasard.random()
            if tirage < 0.45:  # comptoir, espèces
                code = hasard.choice(
                    [
                        "KN-MAN-ATS500",
                        "KN-MAN-ATS200",
                        "KN-MAN-GAR500",
                        "KN-SOJ-CAF200",
                        "KN-TAP-TAP200",
                    ]
                )
                vente = await _vendre(
                    c, jour, None, [(code, None, str(hasard.randint(2, 8)))], [("CAISSE", -1)]
                )
            elif tirage < 0.65:  # Mobile Money
                compte = hasard.choice(["ORANGE_MONEY", "WAVE", "MOBICASH"])
                vente = await _vendre(
                    c,
                    jour,
                    None,
                    [
                        (
                            hasard.choice(["KN-MAN-ATS500", "KN-SOJ-CAF200", "KN-DJU-DJU1KG"]),
                            None,
                            str(hasard.randint(2, 6)),
                        )
                    ],
                    [(compte, -1)],
                )
            elif tirage < 0.85:  # gros : céréales en sacs, payé en partie
                client = hasard.choice(
                    [
                        "Mme Coulibaly Fatoumata (revendeuse)",
                        "Cantine scolaire de Kalaban",
                        "Hôtel Mandé",
                    ]
                )
                vente = await _vendre(
                    c,
                    jour,
                    client,
                    [(hasard.choice(["MP-MAI", "MP-MIL"]), 0, str(hasard.randint(1, 3)))],
                    [("CAISSE", 10_000)],
                    remise=D("0.95"),
                )
                if vente and vente["reste"]:
                    creances.append((jour, vente["id"]))  # type: ignore[arg-type]
            else:  # boutiques en cartons, à crédit
                client = hasard.choice(
                    [
                        "Boutique Awa Traoré",
                        "Supermarché Azar Libre-Service",
                        "Restaurant Le Badala",
                    ]
                )
                vente = await _vendre(
                    c,
                    jour,
                    client,
                    [("KN-MAN-ATS500", 0, "1"), ("KN-SOJ-CAF200", 0, "1")],
                    [],
                    remise=D("0.9"),
                )
                if vente:
                    creances.append((jour, vente["id"]))  # type: ignore[arg-type]
            nb["ventes"] += vente is not None

        # Encaissements : les créances de plus de 7 jours, une sur deux
        for jour_vente, vente_id in list(creances):
            if (jour - jour_vente).days >= 7 and hasard.random() < 0.5:
                detail = await ventes.lire_vente(c.session, vente_id)
                reste = detail.reste_a_payer.quantize(D(1))
                if reste > 0:
                    await _essayer(
                        c,
                        "encaissement",
                        ventes.encaisser_vente(
                            c.session,
                            vente_id,
                            PaiementCreation(
                                cle_idempotence=_cle(),
                                compte_id=c.comptes["WAVE"],
                                montant=reste,
                                reference_paiement="WV-ENC",
                            ),
                            c.auteur,
                        ),
                    )
                creances.remove((jour_vente, vente_id))

        # Dépenses courantes
        if i % 3 == 0:
            await _depenser(
                c, jour, "Carburant / Transport", "CAISSE", "Carburant moto livraison", 7_500
            )
            nb["depenses"] += 1
        if semaine == 5:
            await _depenser(
                c,
                jour,
                "Main d'œuvre / Personnel",
                "CAISSE",
                "Journaliers triage et râpage",
                35_000,
            )
            nb["depenses"] += 1
        if i == 14:
            await _depenser(
                c,
                jour,
                "Entretien & Réparations",
                "ORANGE_MONEY",
                "Réparation de la râpeuse",
                45_000,
            )
            await _depenser(
                c, jour, "Fournitures & Hygiène", "CAISSE", "Savon et produits de nettoyage", 6_000
            )
            nb["depenses"] += 2

        # Versement des recettes en banque chaque samedi
        if semaine == 5:
            caisse = await c.session.get(
                CompteTresorerie, c.comptes["CAISSE"], populate_existing=True
            )
            assert caisse is not None
            montant = (caisse.solde_actuel - D(150_000)).quantize(D(1000))
            if montant > 0:
                await _essayer(
                    c,
                    "versement",
                    transferts.creer_transfert(
                        c.session,
                        TransfertCreation(
                            cle_idempotence=_cle(),
                            compte_source_id=c.comptes["CAISSE"],
                            compte_destination_id=c.comptes["BANQUE"],
                            montant=montant,
                            date_transfert=jour,
                            libelle="Versement des recettes de la semaine",
                        ),
                        c.auteur,
                    ),
                )

        # Dons : dégustation au marché, échantillons à un client
        if i in (10, 24):
            await _essayer(
                c,
                "don",
                ventes.creer_don(
                    c.session,
                    DonCreation(
                        cle_idempotence=_cle(),
                        beneficiaire="Foire de Bamako"
                        if jour.day % 2
                        else "Cantine scolaire de Kalaban",
                        motif="Dégustation" if jour.day % 2 else "Échantillons pour la rentrée",
                        date_vente=jour,
                        lignes=[LigneDonCreation(article_id=c.id("KN-SOJ-CAF200"), quantite=D(6))],
                    ),
                    c.auteur,
                ),
            )
        if i == 26:
            vente = await _vendre(c, jour, None, [("KN-MAN-ATS500", None, "3")], [("CAISSE", -1)])
            if vente:
                a_annuler["vente"] = vente["id"]  # type: ignore[assignment]

    # Annulations, pour montrer les pièces barrées
    if "achat" in a_annuler:
        await _essayer(
            c,
            "annulation achat",
            achats.annuler_achat(
                c.session, a_annuler["achat"], "Bordereau saisi deux fois", c.auteur
            ),
        )
    if "vente" in a_annuler:
        await _essayer(
            c,
            "annulation vente",
            ventes.annuler_vente(
                c.session, a_annuler["vente"], "Client reparti sans la marchandise", c.auteur
            ),
        )

    # Un ordre laissé en cours, pour la recette de la clôture (US-PROD-04)
    await _essayer(
        c,
        "ordre en cours",
        production.lancer_ordre(
            c.session,
            OrdreCreation(
                recette_id=c.recettes["KN-MAN-ATVRAC"],
                quantite_prevue=D(100),
                observations="Lot du jour",
            ),
            c.auteur,
        ),
    )
    c.journal.append(
        f"Activité sur {JOURS} jours : {nb['ventes']} ventes, {nb['achats']} achats, "
        f"{nb['ordres']} ordres de fabrication, {nb['depenses']} dépenses, 2 dons, "
        "1 achat et 1 vente annulés, 1 ordre en cours"
    )


async def charger() -> None:
    moteur = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    async with AsyncSession(moteur, expire_on_commit=False) as session:
        await _base_vierge(session)
        auteur, acces = await _comptes_recette(session)
        c = Contexte(session, auteur)
        await _catalogue(c)
        await _tiers(c)
        await _tresorerie(c)
        await _stock_de_depart(c)
        await _recettes(c)
        await _activite(c)
    await moteur.dispose()
    print("\n".join(c.journal))
    print("\nComptes de recette (mots de passe affichés une seule fois) :")
    for email, mot_de_passe in acces.items():
        print(f"  {email} : {mot_de_passe}")


def main() -> None:
    analyse = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    analyse.add_argument("--confirmer", action="store_true", help="charger réellement le jeu")
    if not analyse.parse_args().confirmer:
        raise SystemExit("Ajoutez --confirmer pour charger le jeu de recette.")
    asyncio.run(charger())


if __name__ == "__main__":
    main()
