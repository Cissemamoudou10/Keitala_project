"""Ventes et dons (US-VTE-01, 02, 04 à 06) : déstockage, encaissements, créances
clients, annulation.

Une opération = une transaction (règle 3). Verrous toujours dans le même ordre : la
pièce, puis les articles, puis les comptes (par identifiant croissant).
"""

import uuid
from collections import defaultdict
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, Literal

from fastapi import status
from sqlalchemy import ScalarSelect, Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.erreurs import ErreurMetier
from app.db.pagination import paginer
from app.db.recherche import contient
from app.models import (
    Article,
    ArticleUnite,
    CompteTresorerie,
    LigneVente,
    Reglement,
    Tiers,
    Utilisateur,
    Vente,
)
from app.models.enums import StatutDocument, TypeFluxTresorerie, TypeMouvementStock
from app.schemas.common import PaginationParams
from app.schemas.pieces import LigneLecture, PaiementCreation, ReglementLecture, ReglementSaisie
from app.schemas.stocks import ArticleResume
from app.schemas.ventes import DonCreation, VenteCreation, VenteDetail, VenteResume
from app.services.numerotation import prochain_numero
from app.services.pieces import (
    aujourd_hui,
    exiger_articles_actifs,
    facteurs_des_lignes,
    fcfa,
    montant_ligne,
    nom_article,
    quantite_base,
    verrouiller_comptes,
)
from app.services.stocks import (
    ecrire_mouvement_stock,
    formater_quantite,
    noms_des_auteurs,
    verrouiller_articles,
)
from app.services.tresorerie import ecrire_mouvement_tresorerie

TypePiece = Literal["ventes", "dons"]


def _introuvable() -> ErreurMetier:
    return ErreurMetier("VENTE_INTROUVABLE", "Cette vente n'existe pas.", status.HTTP_404_NOT_FOUND)


def _date_valide(saisie: date | None) -> date:
    jour = saisie or aujourd_hui()
    if jour > aujourd_hui():
        raise ErreurMetier(
            "DATE_FUTURE",
            "La date ne peut pas être dans le futur.",
            details={"champ": "date_vente"},
        )
    return jour


# --- Lecture -------------------------------------------------------------------------


def total_regle() -> ScalarSelect[Any]:
    return (
        select(func.coalesce(func.sum(Reglement.montant), 0))
        .where(Reglement.vente_id == Vente.id, Reglement.statut == StatutDocument.VALIDE)
        .scalar_subquery()
    )


async def _resumes(session: AsyncSession, ventes: list[Vente]) -> list[VenteResume]:
    ids = [v.id for v in ventes]
    reglements: dict[uuid.UUID, list[tuple[Decimal, str]]] = defaultdict(list)
    if ids:
        lignes = await session.execute(
            select(Reglement.vente_id, Reglement.montant, CompteTresorerie.nom)
            .join(CompteTresorerie, CompteTresorerie.id == Reglement.compte_id)
            .where(Reglement.vente_id.in_(ids), Reglement.statut == StatutDocument.VALIDE)
            .order_by(Reglement.date_creation)
        )
        for vente_id, montant, compte in lignes:
            if vente_id is not None:
                reglements[vente_id].append((montant, compte))
    clients = {
        t.id: t.nom
        for t in (
            await session.execute(
                select(Tiers).where(Tiers.id.in_({v.client_id for v in ventes if v.client_id}))
            )
        ).scalars()
    }
    resumes = []
    for vente in ventes:
        regle = sum((m for m, _ in reglements[vente.id]), start=Decimal(0))
        valide = vente.statut == StatutDocument.VALIDE
        if vente.est_don:
            client = vente.beneficiaire_don
        elif vente.client_id:
            client = clients.get(vente.client_id)
        else:
            client = vente.client_nom_libre
        resumes.append(
            VenteResume(
                id=vente.id,
                numero=vente.numero_facture,
                date_vente=vente.date_vente,
                client_id=vente.client_id,
                client=client,
                est_don=vente.est_don,
                montant_total=vente.montant_total,
                montant_regle=regle,
                reste_a_payer=vente.montant_total - regle if valide else Decimal(0),
                comptes=list(dict.fromkeys(c for _, c in reglements[vente.id])),
                statut=vente.statut,
                date_creation=vente.date_creation,
            )
        )
    return resumes


async def lister_ventes(
    session: AsyncSession,
    pagination: PaginationParams,
    *,
    type_piece: TypePiece | None = None,
    client_id: uuid.UUID | None = None,
    du: date | None = None,
    au: date | None = None,
    a_encaisser: bool = False,
    recherche: str | None = None,
) -> tuple[list[VenteResume], int, int]:
    requete: Select[Vente] = select(Vente).outerjoin(Tiers, Tiers.id == Vente.client_id)
    if type_piece is not None:
        requete = requete.where(Vente.est_don.is_(type_piece == "dons"))
    if client_id is not None:
        requete = requete.where(Vente.client_id == client_id)
    if du is not None:
        requete = requete.where(Vente.date_vente >= du)
    if au is not None:
        requete = requete.where(Vente.date_vente <= au)
    if a_encaisser:
        # Créances clients : ventes non soldées (US-VTE-05)
        requete = requete.where(
            Vente.statut == StatutDocument.VALIDE, Vente.montant_total > total_regle()
        )
    if recherche and recherche.strip():
        requete = requete.where(
            contient(
                recherche,
                Vente.numero_facture,
                Vente.client_nom_libre,
                Vente.beneficiaire_don,
                Tiers.nom,
            )
        )
    requete = requete.order_by(Vente.date_vente.desc(), Vente.date_creation.desc(), Vente.id)
    ventes, total, pages = await paginer(session, requete, pagination)
    return await _resumes(session, ventes), total, pages


async def lire_vente(session: AsyncSession, vente_id: uuid.UUID) -> VenteDetail:
    vente = await session.get(Vente, vente_id, populate_existing=True)
    if vente is None:
        raise _introuvable()
    lignes = (
        await session.execute(
            select(LigneVente, Article, ArticleUnite)
            .join(Article, Article.id == LigneVente.article_id)
            .outerjoin(ArticleUnite, ArticleUnite.id == LigneVente.unite_id)
            .where(LigneVente.vente_id == vente_id)
            .order_by(LigneVente.id)
            .execution_options(populate_existing=True)
        )
    ).all()
    reglements = (
        await session.execute(
            select(Reglement, CompteTresorerie.nom)
            .join(CompteTresorerie, CompteTresorerie.id == Reglement.compte_id)
            .where(Reglement.vente_id == vente_id)
            .order_by(Reglement.date_creation)
            .execution_options(populate_existing=True)
        )
    ).all()
    auteurs = await noms_des_auteurs(
        session,
        [
            vente.cree_par,
            *([vente.annule_par] if vente.annule_par else []),
            *(r.cree_par for r, _ in reglements),
        ],
    )
    client = await session.get(Tiers, vente.client_id) if vente.client_id else None
    resume = (await _resumes(session, [vente]))[0]
    return VenteDetail(
        **resume.model_dump(),
        client_telephone=client.telephone if client else None,
        client_adresse=client.adresse if client else None,
        motif_don=vente.motif_don,
        notes=vente.notes,
        auteur=auteurs.get(vente.cree_par, ""),
        annule_le=vente.annule_le,
        annule_par=auteurs.get(vente.annule_par) if vente.annule_par else None,
        motif_annulation=vente.motif_annulation,
        lignes=[
            LigneLecture(
                id=ligne.id,
                article=ArticleResume.model_validate(article, from_attributes=True),
                unite=unite.libelle if unite else article.unite_base,
                facteur_conversion=ligne.facteur_conversion,
                quantite=ligne.quantite,
                prix_unitaire=ligne.prix_unitaire,
                quantite_base=ligne.quantite_base,
                montant_total=ligne.montant_total,
            )
            for ligne, article, unite in lignes
        ],
        reglements=[
            ReglementLecture(
                id=r.id,
                compte_id=r.compte_id,
                compte=compte,
                montant=r.montant,
                date_reglement=r.date_reglement,
                reference_paiement=r.reference_paiement,
                statut=r.statut,
                auteur=auteurs.get(r.cree_par, ""),
            )
            for r, compte in reglements
        ],
    )


# --- Écritures communes --------------------------------------------------------------


async def _vente_par_cle(session: AsyncSession, cle: uuid.UUID) -> uuid.UUID | None:
    return await session.scalar(select(Vente.id).where(Vente.cle_idempotence == cle))


async def _valider_puis_relire(
    session: AsyncSession, vente_id: uuid.UUID, cle: uuid.UUID
) -> tuple[VenteDetail, bool]:
    try:
        await session.commit()
    except IntegrityError:
        # Même clé envoyée deux fois en même temps : l'autre envoi a gagné
        await session.rollback()
        existant = await _vente_par_cle(session, cle)
        if existant is None:
            raise
        return await lire_vente(session, existant), False
    return await lire_vente(session, vente_id), True


def _exiger_stock(
    articles: dict[uuid.UUID, Article], demandes: dict[uuid.UUID, Decimal], verbe: str
) -> None:
    """Blocage explicite si le stock ne suffit pas (US-VTE-01, règle 2), toutes les
    lignes d'un même article additionnées."""
    for article_id, quantite in demandes.items():
        article = articles[article_id]
        if article.stock_actuel < quantite and not article.autoriser_stock_negatif:
            raise ErreurMetier(
                "STOCK_INSUFFISANT",
                f"Stock insuffisant pour {nom_article(article)} : il reste "
                f"{formater_quantite(article.stock_actuel, article.unite_base)}, "
                f"{verbe} {formater_quantite(quantite, article.unite_base)}.",
                status.HTTP_409_CONFLICT,
                {"article_id": str(article_id), "disponible": str(article.stock_actuel)},
            )


async def _encaisser(
    session: AsyncSession,
    vente: Vente,
    saisie: ReglementSaisie,
    compte: CompteTresorerie,
    libelle_client: str | None,
    auteur: Utilisateur,
    cle_idempotence: uuid.UUID | None = None,
) -> None:
    reglement = Reglement(
        vente_id=vente.id,
        compte_id=compte.id,
        montant=saisie.montant,
        date_reglement=aujourd_hui(),
        reference_paiement=(saisie.reference_paiement or "").strip() or None,
        cree_par=auteur.id,
        cle_idempotence=cle_idempotence,
    )
    session.add(reglement)
    await session.flush()
    await ecrire_mouvement_tresorerie(
        session,
        compte,
        type_flux=TypeFluxTresorerie.ENCAISSEMENT_VENTE,
        sens="CREDIT",
        montant=saisie.montant,
        libelle=f"Vente {vente.numero_facture}"
        + (f" — {libelle_client}" if libelle_client else ""),
        utilisateur_id=auteur.id,
        reglement_id=reglement.id,
    )


# --- Vente (US-VTE-01, 02) -----------------------------------------------------------


async def creer_vente(
    session: AsyncSession, donnees: VenteCreation, auteur: Utilisateur
) -> tuple[VenteDetail, bool]:
    """Renvoie (vente, créée). Un second envoi avec la même clé renvoie la vente existante."""
    existant = await _vente_par_cle(session, donnees.cle_idempotence)
    if existant is not None:
        return await lire_vente(session, existant), False
    date_vente = _date_valide(donnees.date_vente)

    client: Tiers | None = None
    if donnees.client_id is not None:
        client = await session.get(Tiers, donnees.client_id)
        if client is None or not client.est_client or not client.est_actif:
            raise ErreurMetier(
                "CLIENT_INVALIDE",
                "Ce client n'existe pas ou n'est plus actif.",
                details={"champ": "client_id"},
            )
    nom_libre = (donnees.client_nom_libre or "").strip() or None
    libelle_client = client.nom if client else nom_libre

    articles = await verrouiller_articles(session, [ligne.article_id for ligne in donnees.lignes])
    exiger_articles_actifs(articles)
    facteurs = await facteurs_des_lignes(session, donnees.lignes)
    bases = [quantite_base(s, f) for s, f in zip(donnees.lignes, facteurs, strict=True)]
    demandes: dict[uuid.UUID, Decimal] = defaultdict(Decimal)
    for saisie, base in zip(donnees.lignes, bases, strict=True):
        demandes[saisie.article_id] += base
    _exiger_stock(articles, demandes, "la vente en demande")

    total = sum((montant_ligne(s) for s in donnees.lignes), start=Decimal(0))
    regle = sum((r.montant for r in donnees.reglements), start=Decimal(0))
    if regle > total:
        raise ErreurMetier(
            "REGLEMENT_SUPERIEUR",
            f"Les paiements ({fcfa(regle)}) dépassent le total de la vente ({fcfa(total)}).",
            details={"champ": "reglements"},
        )
    if regle < total and client is None:
        raise ErreurMetier(
            "CREDIT_SANS_CLIENT",
            "Une vente à crédit exige un client du répertoire : choisissez-le, "
            "ou encaissez la totalité.",
            details={"champ": "client_id"},
        )
    comptes = await verrouiller_comptes(session, {r.compte_id for r in donnees.reglements})

    vente = Vente(
        numero_facture=await prochain_numero(session, "FAC", date_vente),
        client_id=client.id if client else None,
        client_nom_libre=None if client else nom_libre,
        date_vente=date_vente,
        montant_total=total,
        notes=(donnees.notes or "").strip() or None,
        cree_par=auteur.id,
        cle_idempotence=donnees.cle_idempotence,
    )
    session.add(vente)
    await session.flush()

    for saisie, facteur, base in zip(donnees.lignes, facteurs, bases, strict=True):
        article = articles[saisie.article_id]
        session.add(
            LigneVente(
                vente_id=vente.id,
                article_id=article.id,
                unite_id=saisie.unite_id,
                facteur_conversion=facteur,
                quantite=saisie.quantite,
                prix_unitaire=saisie.prix_unitaire,
                # Coût moyen du moment, pour le rapport de marges
                cout_unitaire_base=article.cout_moyen,
            )
        )
        await ecrire_mouvement_stock(
            session,
            article,
            type_mouvement=TypeMouvementStock.SORTIE_VENTE,
            quantite=-base,
            utilisateur_id=auteur.id,
            vente_id=vente.id,
            reference_document=vente.numero_facture,
        )
    for reglement in donnees.reglements:
        await _encaisser(
            session, vente, reglement, comptes[reglement.compte_id], libelle_client, auteur
        )
    return await _valider_puis_relire(session, vente.id, donnees.cle_idempotence)


# --- Don ou échantillon (US-VTE-04) --------------------------------------------------


async def creer_don(
    session: AsyncSession, donnees: DonCreation, auteur: Utilisateur
) -> tuple[VenteDetail, bool]:
    existant = await _vente_par_cle(session, donnees.cle_idempotence)
    if existant is not None:
        return await lire_vente(session, existant), False
    date_don = _date_valide(donnees.date_vente)

    articles = await verrouiller_articles(session, [ligne.article_id for ligne in donnees.lignes])
    exiger_articles_actifs(articles)
    facteurs = await facteurs_des_lignes(session, donnees.lignes)
    bases = [quantite_base(ligne, f) for ligne, f in zip(donnees.lignes, facteurs, strict=True)]
    demandes: dict[uuid.UUID, Decimal] = defaultdict(Decimal)
    for ligne, base in zip(donnees.lignes, bases, strict=True):
        demandes[ligne.article_id] += base
    _exiger_stock(articles, demandes, "le don en demande")

    don = Vente(
        numero_facture=await prochain_numero(session, "DON", date_don),
        date_vente=date_don,
        montant_total=Decimal(0),
        est_don=True,
        beneficiaire_don=donnees.beneficiaire.strip(),
        motif_don=donnees.motif.strip(),
        cree_par=auteur.id,
        cle_idempotence=donnees.cle_idempotence,
    )
    session.add(don)
    await session.flush()
    for ligne, facteur, base in zip(donnees.lignes, facteurs, bases, strict=True):
        article = articles[ligne.article_id]
        session.add(
            LigneVente(
                vente_id=don.id,
                article_id=article.id,
                unite_id=ligne.unite_id,
                facteur_conversion=facteur,
                quantite=ligne.quantite,
                prix_unitaire=Decimal(0),
                cout_unitaire_base=article.cout_moyen,
            )
        )
        await ecrire_mouvement_stock(
            session,
            article,
            type_mouvement=TypeMouvementStock.SORTIE_DON,
            quantite=-base,
            utilisateur_id=auteur.id,
            vente_id=don.id,
            reference_document=don.numero_facture,
            motif=f"{don.motif_don} — {don.beneficiaire_don}",
        )
    return await _valider_puis_relire(session, don.id, donnees.cle_idempotence)


# --- Encaissement d'une créance (US-VTE-05) ------------------------------------------


async def encaisser_vente(
    session: AsyncSession, vente_id: uuid.UUID, donnees: PaiementCreation, auteur: Utilisateur
) -> VenteDetail:
    deja = await session.scalar(
        select(Reglement.vente_id).where(Reglement.cle_idempotence == donnees.cle_idempotence)
    )
    if deja is not None:
        return await lire_vente(session, deja)

    vente = (
        await session.execute(select(Vente).where(Vente.id == vente_id).with_for_update())
    ).scalar_one_or_none()
    if vente is None:
        raise _introuvable()
    if vente.statut != StatutDocument.VALIDE:
        raise ErreurMetier(
            "VENTE_ANNULEE",
            f"La vente {vente.numero_facture} est annulée : elle ne s'encaisse plus.",
            409,
        )
    regle = await session.scalar(
        select(func.coalesce(func.sum(Reglement.montant), 0)).where(
            Reglement.vente_id == vente.id, Reglement.statut == StatutDocument.VALIDE
        )
    )
    reste = vente.montant_total - Decimal(regle or 0)
    if reste <= 0:
        raise ErreurMetier(
            "VENTE_SOLDEE", f"La vente {vente.numero_facture} est déjà entièrement payée.", 409
        )
    if donnees.montant > reste:
        raise ErreurMetier(
            "MONTANT_SUPERIEUR_AU_RESTE",
            f"Le reste à payer est de {fcfa(reste)} : l'encaissement ne peut pas le dépasser.",
            details={"champ": "montant", "reste_a_payer": str(reste)},
        )
    compte = (await verrouiller_comptes(session, {donnees.compte_id}))[donnees.compte_id]
    client = await session.get(Tiers, vente.client_id) if vente.client_id else None
    await _encaisser(
        session,
        vente,
        ReglementSaisie(
            compte_id=donnees.compte_id,
            montant=donnees.montant,
            reference_paiement=donnees.reference_paiement,
        ),
        compte,
        client.nom if client else vente.client_nom_libre,
        auteur,
        cle_idempotence=donnees.cle_idempotence,
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        deja = await session.scalar(
            select(Reglement.vente_id).where(Reglement.cle_idempotence == donnees.cle_idempotence)
        )
        if deja is None:
            raise
    return await lire_vente(session, vente_id)


# --- Annulation (US-VTE-06) ----------------------------------------------------------


async def annuler_vente(
    session: AsyncSession, vente_id: uuid.UUID, motif: str, auteur: Utilisateur
) -> VenteDetail:
    """Statut ANNULE (le numéro reste : pas de trou), articles remis en stock à leur coût
    de sortie, encaissements contre-passés (refusé si le compte n'a plus l'argent)."""
    vente = (
        await session.execute(select(Vente).where(Vente.id == vente_id).with_for_update())
    ).scalar_one_or_none()
    if vente is None:
        raise _introuvable()
    if vente.statut != StatutDocument.VALIDE:
        deja = (
            f"Le don {vente.numero_facture} est déjà annulé."
            if vente.est_don
            else f"La vente {vente.numero_facture} est déjà annulée."
        )
        raise ErreurMetier("VENTE_ANNULEE", deja, 409)

    lignes = list(
        (await session.execute(select(LigneVente).where(LigneVente.vente_id == vente.id))).scalars()
    )
    articles = await verrouiller_articles(session, [ligne.article_id for ligne in lignes])
    texte_motif = f"Annulation : {motif.strip()}"
    for ligne in sorted(lignes, key=lambda ligne: (ligne.article_id, ligne.id)):
        await ecrire_mouvement_stock(
            session,
            articles[ligne.article_id],
            type_mouvement=TypeMouvementStock.ANNULATION,
            quantite=ligne.quantite_base,
            # Retour au coût de sortie : le coût moyen revient à sa valeur d'avant la vente
            cout_entree=ligne.cout_unitaire_base,
            utilisateur_id=auteur.id,
            vente_id=vente.id,
            reference_document=vente.numero_facture,
            motif=texte_motif,
        )

    reglements = list(
        (
            await session.execute(
                select(Reglement).where(
                    Reglement.vente_id == vente.id, Reglement.statut == StatutDocument.VALIDE
                )
            )
        ).scalars()
    )
    comptes = await verrouiller_comptes(session, {r.compte_id for r in reglements}, actifs=False)
    maintenant = datetime.now(UTC)
    for reglement in reglements:
        reglement.statut = StatutDocument.ANNULE
        reglement.annule_par = auteur.id
        reglement.annule_le = maintenant
        # L'argent ressort du compte qui l'avait reçu (écriture inverse, règle 4)
        await ecrire_mouvement_tresorerie(
            session,
            comptes[reglement.compte_id],
            type_flux=TypeFluxTresorerie.ANNULATION,
            sens="DEBIT",
            montant=reglement.montant,
            libelle=f"Annulation de la vente {vente.numero_facture}",
            utilisateur_id=auteur.id,
            reglement_id=reglement.id,
        )

    vente.statut = StatutDocument.ANNULE
    vente.annule_par = auteur.id
    vente.annule_le = maintenant
    vente.motif_annulation = motif.strip()
    await session.commit()
    return await lire_vente(session, vente_id)
