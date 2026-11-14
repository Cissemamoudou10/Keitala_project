"""Achats (US-ACH-01 à 04) : réception, règlements, dettes fournisseurs, annulation.

Une opération = une transaction (règle 3) : pièce, lignes, mouvements de stock,
règlements et écritures de trésorerie sont écrits ensemble ou pas du tout. Verrous
toujours dans le même ordre : la pièce, puis les articles, puis les comptes (chacun par
identifiant croissant), pour que deux opérations ne s'interbloquent pas.
"""

import uuid
from collections import defaultdict
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from fastapi import status
from sqlalchemy import ScalarSelect, Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.erreurs import ErreurMetier
from app.db.pagination import paginer
from app.db.recherche import contient
from app.models import (
    Achat,
    Article,
    ArticleUnite,
    CompteTresorerie,
    LigneAchat,
    Reglement,
    Tiers,
    Utilisateur,
)
from app.models.enums import StatutDocument, TypeFluxTresorerie, TypeMouvementStock
from app.schemas.achats import (
    AchatCreation,
    AchatDetail,
    AchatResume,
    LigneAchatLecture,
    PaiementCreation,
    ReglementLecture,
    ReglementSaisie,
)
from app.schemas.common import PaginationParams
from app.schemas.stocks import ArticleResume
from app.services.numerotation import prochain_numero
from app.services.stocks import (
    FUSEAU,
    ecrire_mouvement_stock,
    formater_quantite,
    noms_des_auteurs,
    verrouiller_articles,
)
from app.services.tresorerie import ecrire_mouvement_tresorerie

QUANTITE = Decimal("0.001")
CENTIME = Decimal("0.01")
COUT = Decimal("0.0001")


def _fcfa(montant: Decimal) -> str:
    return f"{format(montant.quantize(Decimal(1)), ',').replace(',', ' ')} FCFA"


def _introuvable() -> ErreurMetier:
    return ErreurMetier("ACHAT_INTROUVABLE", "Cet achat n'existe pas.", status.HTTP_404_NOT_FOUND)


def aujourd_hui() -> date:
    return datetime.now(FUSEAU).date()


# --- Lecture -------------------------------------------------------------------------


def _total_regle() -> ScalarSelect[Any]:
    """Somme des règlements valides d'un achat (sous-requête corrélée)."""
    return (
        select(func.coalesce(func.sum(Reglement.montant), 0))
        .where(Reglement.achat_id == Achat.id, Reglement.statut == StatutDocument.VALIDE)
        .scalar_subquery()
    )


async def _resumes(session: AsyncSession, achats: list[Achat]) -> list[AchatResume]:
    ids = [a.id for a in achats]
    reglements: dict[uuid.UUID, list[tuple[Decimal, str]]] = defaultdict(list)
    if ids:
        lignes = await session.execute(
            select(Reglement.achat_id, Reglement.montant, CompteTresorerie.nom)
            .join(CompteTresorerie, CompteTresorerie.id == Reglement.compte_id)
            .where(Reglement.achat_id.in_(ids), Reglement.statut == StatutDocument.VALIDE)
            .order_by(Reglement.date_creation)
        )
        for achat_id, montant, compte in lignes:
            if achat_id is not None:
                reglements[achat_id].append((montant, compte))
    fournisseurs = {
        t.id: t.nom
        for t in (
            await session.execute(
                select(Tiers).where(
                    Tiers.id.in_({a.fournisseur_id for a in achats if a.fournisseur_id})
                )
            )
        ).scalars()
    }
    resumes = []
    for achat in achats:
        regle = sum((m for m, _ in reglements[achat.id]), start=Decimal(0))
        comptes = list(dict.fromkeys(c for _, c in reglements[achat.id]))
        valide = achat.statut == StatutDocument.VALIDE
        resumes.append(
            AchatResume(
                id=achat.id,
                numero=achat.numero,
                numero_facture_fournisseur=achat.numero_facture_fournisseur,
                date_achat=achat.date_achat,
                fournisseur_id=achat.fournisseur_id,
                fournisseur=fournisseurs.get(achat.fournisseur_id)
                if achat.fournisseur_id
                else achat.fournisseur_nom_libre,
                montant_total=achat.montant_total,
                montant_regle=regle,
                reste_a_payer=achat.montant_total - regle if valide else Decimal(0),
                comptes=comptes,
                statut=achat.statut,
                date_creation=achat.date_creation,
            )
        )
    return resumes


async def lister_achats(
    session: AsyncSession,
    pagination: PaginationParams,
    *,
    fournisseur_id: uuid.UUID | None = None,
    du: date | None = None,
    au: date | None = None,
    a_payer: bool = False,
    recherche: str | None = None,
) -> tuple[list[AchatResume], int, int]:
    requete: Select[Achat] = select(Achat).outerjoin(Tiers, Tiers.id == Achat.fournisseur_id)
    if fournisseur_id is not None:
        requete = requete.where(Achat.fournisseur_id == fournisseur_id)
    if du is not None:
        requete = requete.where(Achat.date_achat >= du)
    if au is not None:
        requete = requete.where(Achat.date_achat <= au)
    if a_payer:
        # Achats non soldés (US-ACH-03)
        requete = requete.where(
            Achat.statut == StatutDocument.VALIDE, Achat.montant_total > _total_regle()
        )
    if recherche and recherche.strip():
        requete = requete.where(
            contient(
                recherche,
                Achat.numero,
                Achat.numero_facture_fournisseur,
                Achat.fournisseur_nom_libre,
                Tiers.nom,
            )
        )
    requete = requete.order_by(Achat.date_achat.desc(), Achat.date_creation.desc(), Achat.id)
    achats, total, pages = await paginer(session, requete, pagination)
    return await _resumes(session, achats), total, pages


async def lire_achat(session: AsyncSession, achat_id: uuid.UUID) -> AchatDetail:
    achat = await session.get(Achat, achat_id, populate_existing=True)
    if achat is None:
        raise _introuvable()
    lignes = (
        await session.execute(
            select(LigneAchat, Article, ArticleUnite)
            .join(Article, Article.id == LigneAchat.article_id)
            .outerjoin(ArticleUnite, ArticleUnite.id == LigneAchat.unite_id)
            .where(LigneAchat.achat_id == achat_id)
            .order_by(LigneAchat.id)
            .execution_options(populate_existing=True)
        )
    ).all()
    reglements = (
        await session.execute(
            select(Reglement, CompteTresorerie.nom)
            .join(CompteTresorerie, CompteTresorerie.id == Reglement.compte_id)
            .where(Reglement.achat_id == achat_id)
            .order_by(Reglement.date_creation)
            .execution_options(populate_existing=True)
        )
    ).all()
    auteurs = await noms_des_auteurs(
        session,
        [
            achat.cree_par,
            *([achat.annule_par] if achat.annule_par else []),
            *(r.cree_par for r, _ in reglements),
        ],
    )
    resume = (await _resumes(session, [achat]))[0]
    return AchatDetail(
        **resume.model_dump(),
        notes=achat.notes,
        auteur=auteurs.get(achat.cree_par, ""),
        annule_le=achat.annule_le,
        annule_par=auteurs.get(achat.annule_par) if achat.annule_par else None,
        motif_annulation=achat.motif_annulation,
        lignes=[
            LigneAchatLecture(
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


# --- Règlements (communs à la création et aux paiements ultérieurs) ------------------


async def _verrouiller_comptes(session: AsyncSession, ids: set[int]) -> dict[int, CompteTresorerie]:
    comptes = {
        c.id: c
        for c in (
            await session.execute(
                select(CompteTresorerie)
                .where(CompteTresorerie.id.in_(sorted(ids)))
                .order_by(CompteTresorerie.id)
                .with_for_update()
            )
        ).scalars()
    }
    for identifiant in ids:
        compte = comptes.get(identifiant)
        if compte is None:
            raise ErreurMetier(
                "COMPTE_INTROUVABLE", "Un des comptes de paiement n'existe pas.", 404
            )
        if not compte.est_actif:
            raise ErreurMetier(
                "COMPTE_INACTIF",
                f"Le compte « {compte.nom} » est désactivé : choisissez-en un autre.",
            )
    return comptes


async def _payer(
    session: AsyncSession,
    achat: Achat,
    saisie: ReglementSaisie,
    compte: CompteTresorerie,
    libelle_tiers: str | None,
    auteur: Utilisateur,
    cle_idempotence: uuid.UUID | None = None,
) -> None:
    reglement = Reglement(
        achat_id=achat.id,
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
        type_flux=TypeFluxTresorerie.DECAISSEMENT_ACHAT,
        sens="DEBIT",
        montant=saisie.montant,
        libelle=f"Achat {achat.numero}" + (f" — {libelle_tiers}" if libelle_tiers else ""),
        utilisateur_id=auteur.id,
        reglement_id=reglement.id,
    )


# --- Création (US-ACH-01) ------------------------------------------------------------


async def _achat_par_cle(session: AsyncSession, cle: uuid.UUID) -> uuid.UUID | None:
    return await session.scalar(select(Achat.id).where(Achat.cle_idempotence == cle))


async def creer_achat(
    session: AsyncSession, donnees: AchatCreation, auteur: Utilisateur
) -> tuple[AchatDetail, bool]:
    """Renvoie (achat, créé). Un second envoi avec la même clé renvoie l'achat existant."""
    existant = await _achat_par_cle(session, donnees.cle_idempotence)
    if existant is not None:
        return await lire_achat(session, existant), False

    date_achat = donnees.date_achat or aujourd_hui()
    if date_achat > aujourd_hui():
        raise ErreurMetier(
            "DATE_FUTURE",
            "La date de l'achat ne peut pas être dans le futur.",
            details={"champ": "date_achat"},
        )

    fournisseur: Tiers | None = None
    if donnees.fournisseur_id is not None:
        fournisseur = await session.get(Tiers, donnees.fournisseur_id)
        if fournisseur is None or not fournisseur.est_fournisseur or not fournisseur.est_actif:
            raise ErreurMetier(
                "FOURNISSEUR_INVALIDE",
                "Ce fournisseur n'existe pas ou n'est plus actif.",
                details={"champ": "fournisseur_id"},
            )
    nom_libre = (donnees.fournisseur_nom_libre or "").strip() or None
    libelle_tiers = fournisseur.nom if fournisseur else nom_libre

    # Articles verrouillés (ordre des identifiants), puis unités de saisie
    articles = await verrouiller_articles(session, [ligne.article_id for ligne in donnees.lignes])
    for article in articles.values():
        if not article.est_actif:
            raise ErreurMetier(
                "ARTICLE_INACTIF",
                f"L'article « {article.designation} » est retiré du catalogue.",
            )
    ids_unites = {ligne.unite_id for ligne in donnees.lignes if ligne.unite_id is not None}
    unites = {
        u.id: u
        for u in (
            await session.execute(select(ArticleUnite).where(ArticleUnite.id.in_(ids_unites)))
        ).scalars()
    }

    calculs = []
    total = Decimal(0)
    for saisie in donnees.lignes:
        facteur = Decimal(1)
        if saisie.unite_id is not None:
            unite = unites.get(saisie.unite_id)
            if unite is None or unite.article_id != saisie.article_id:
                raise ErreurMetier(
                    "UNITE_INTROUVABLE", "Une unité n'appartient pas à l'article de sa ligne.", 404
                )
            facteur = unite.facteur_vers_base
        quantite_base = (saisie.quantite * facteur).quantize(QUANTITE, ROUND_HALF_UP)
        montant = (saisie.quantite * saisie.prix_unitaire).quantize(CENTIME, ROUND_HALF_UP)
        # Coût d'entrée par unité de base : prix du sac ÷ kg du sac (US-ACH-01, PUMP)
        cout_entree = (saisie.prix_unitaire / facteur).quantize(COUT, ROUND_HALF_UP)
        calculs.append((saisie, facteur, quantite_base, cout_entree))
        total += montant

    regle = sum((r.montant for r in donnees.reglements), start=Decimal(0))
    if regle > total:
        raise ErreurMetier(
            "REGLEMENT_SUPERIEUR",
            f"Les paiements ({_fcfa(regle)}) dépassent le total de l'achat ({_fcfa(total)}).",
            details={"champ": "reglements"},
        )
    if regle < total and fournisseur is None:
        raise ErreurMetier(
            "CREDIT_SANS_FOURNISSEUR",
            "Un achat à crédit exige un fournisseur du répertoire : choisissez-le, "
            "ou réglez la totalité.",
            details={"champ": "fournisseur_id"},
        )
    comptes = await _verrouiller_comptes(session, {r.compte_id for r in donnees.reglements})

    achat = Achat(
        numero=await prochain_numero(session, "ACH", date_achat),
        numero_facture_fournisseur=(donnees.numero_facture_fournisseur or "").strip() or None,
        fournisseur_id=fournisseur.id if fournisseur else None,
        fournisseur_nom_libre=None if fournisseur else nom_libre,
        date_achat=date_achat,
        montant_total=total,
        notes=(donnees.notes or "").strip() or None,
        cree_par=auteur.id,
        cle_idempotence=donnees.cle_idempotence,
    )
    session.add(achat)
    await session.flush()

    for saisie, facteur, quantite_base, cout_entree in calculs:
        session.add(
            LigneAchat(
                achat_id=achat.id,
                article_id=saisie.article_id,
                unite_id=saisie.unite_id,
                facteur_conversion=facteur,
                quantite=saisie.quantite,
                prix_unitaire=saisie.prix_unitaire,
            )
        )
        await ecrire_mouvement_stock(
            session,
            articles[saisie.article_id],
            type_mouvement=TypeMouvementStock.ENTREE_ACHAT,
            quantite=quantite_base,
            cout_entree=cout_entree,
            utilisateur_id=auteur.id,
            achat_id=achat.id,
            reference_document=achat.numero,
        )
    for saisie_reglement in donnees.reglements:
        await _payer(
            session,
            achat,
            saisie_reglement,
            comptes[saisie_reglement.compte_id],
            libelle_tiers,
            auteur,
        )

    try:
        await session.commit()
    except IntegrityError:
        # Même clé envoyée deux fois en même temps : l'autre envoi a gagné
        await session.rollback()
        existant = await _achat_par_cle(session, donnees.cle_idempotence)
        if existant is None:
            raise
        return await lire_achat(session, existant), False
    return await lire_achat(session, achat.id), True


# --- Paiement d'une dette (US-ACH-03) ------------------------------------------------


async def payer_achat(
    session: AsyncSession, achat_id: uuid.UUID, donnees: PaiementCreation, auteur: Utilisateur
) -> AchatDetail:
    deja = await session.scalar(
        select(Reglement.achat_id).where(Reglement.cle_idempotence == donnees.cle_idempotence)
    )
    if deja is not None:
        return await lire_achat(session, deja)

    achat = (
        await session.execute(select(Achat).where(Achat.id == achat_id).with_for_update())
    ).scalar_one_or_none()
    if achat is None:
        raise _introuvable()
    if achat.statut != StatutDocument.VALIDE:
        raise ErreurMetier(
            "ACHAT_ANNULE", f"L'achat {achat.numero} est annulé : il ne se règle plus.", 409
        )
    regle = await session.scalar(
        select(func.coalesce(func.sum(Reglement.montant), 0)).where(
            Reglement.achat_id == achat.id, Reglement.statut == StatutDocument.VALIDE
        )
    )
    reste = achat.montant_total - Decimal(regle or 0)
    if reste <= 0:
        raise ErreurMetier("ACHAT_SOLDE", f"L'achat {achat.numero} est déjà entièrement payé.", 409)
    if donnees.montant > reste:
        raise ErreurMetier(
            "MONTANT_SUPERIEUR_AU_RESTE",
            f"Le reste à payer est de {_fcfa(reste)} : le paiement ne peut pas le dépasser.",
            details={"champ": "montant", "reste_a_payer": str(reste)},
        )
    compte = (await _verrouiller_comptes(session, {donnees.compte_id}))[donnees.compte_id]
    fournisseur = await session.get(Tiers, achat.fournisseur_id) if achat.fournisseur_id else None
    await _payer(
        session,
        achat,
        ReglementSaisie(
            compte_id=donnees.compte_id,
            montant=donnees.montant,
            reference_paiement=donnees.reference_paiement,
        ),
        compte,
        fournisseur.nom if fournisseur else achat.fournisseur_nom_libre,
        auteur,
        cle_idempotence=donnees.cle_idempotence,
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        deja = await session.scalar(
            select(Reglement.achat_id).where(Reglement.cle_idempotence == donnees.cle_idempotence)
        )
        if deja is None:
            raise
    return await lire_achat(session, achat_id)


# --- Annulation (US-ACH-04, P-010) ---------------------------------------------------


async def annuler_achat(
    session: AsyncSession, achat_id: uuid.UUID, motif: str, auteur: Utilisateur
) -> AchatDetail:
    """Statut ANNULE, stock repris au coût d'entrée (coût moyen recalculé sur le reste),
    règlements contre-passés. Refus si le stock reçu a déjà été vendu ou consommé."""
    achat = (
        await session.execute(select(Achat).where(Achat.id == achat_id).with_for_update())
    ).scalar_one_or_none()
    if achat is None:
        raise _introuvable()
    if achat.statut != StatutDocument.VALIDE:
        raise ErreurMetier("ACHAT_ANNULE", f"L'achat {achat.numero} est déjà annulé.", 409)

    lignes = list(
        (await session.execute(select(LigneAchat).where(LigneAchat.achat_id == achat.id))).scalars()
    )
    articles = await verrouiller_articles(session, [ligne.article_id for ligne in lignes])
    a_reprendre: dict[uuid.UUID, Decimal] = defaultdict(Decimal)
    for ligne in lignes:
        a_reprendre[ligne.article_id] += ligne.quantite_base
    for article_id, quantite in a_reprendre.items():
        article = articles[article_id]
        if article.stock_actuel < quantite and not article.autoriser_stock_negatif:
            nom = f"{article.designation} {article.contenance or ''}".strip()
            raise ErreurMetier(
                "ANNULATION_IMPOSSIBLE",
                "Impossible d'annuler : il reste "
                f"{formater_quantite(article.stock_actuel, article.unite_base)} "
                f"de {nom}, alors que l'achat en a fait entrer "
                f"{formater_quantite(quantite, article.unite_base)}. Une partie a déjà été "
                "vendue ou consommée.",
                status.HTTP_409_CONFLICT,
                {"article_id": str(article_id)},
            )

    texte_motif = f"Annulation : {motif.strip()}"
    for ligne in sorted(lignes, key=lambda ligne: (ligne.article_id, ligne.id)):
        await ecrire_mouvement_stock(
            session,
            articles[ligne.article_id],
            type_mouvement=TypeMouvementStock.ANNULATION,
            quantite=-ligne.quantite_base,
            cout_retrait=(ligne.prix_unitaire / ligne.facteur_conversion).quantize(
                COUT, ROUND_HALF_UP
            ),
            utilisateur_id=auteur.id,
            achat_id=achat.id,
            reference_document=achat.numero,
            motif=texte_motif,
        )

    reglements = list(
        (
            await session.execute(
                select(Reglement).where(
                    Reglement.achat_id == achat.id, Reglement.statut == StatutDocument.VALIDE
                )
            )
        ).scalars()
    )
    comptes = await _verrouiller_comptes_existants(session, {r.compte_id for r in reglements})
    maintenant = datetime.now(UTC)
    for reglement in reglements:
        reglement.statut = StatutDocument.ANNULE
        reglement.annule_par = auteur.id
        reglement.annule_le = maintenant
        # L'argent revient sur le compte (écriture inverse, règle 4)
        await ecrire_mouvement_tresorerie(
            session,
            comptes[reglement.compte_id],
            type_flux=TypeFluxTresorerie.ANNULATION,
            sens="CREDIT",
            montant=reglement.montant,
            libelle=f"Annulation de l'achat {achat.numero}",
            utilisateur_id=auteur.id,
            reglement_id=reglement.id,
        )

    achat.statut = StatutDocument.ANNULE
    achat.annule_par = auteur.id
    achat.annule_le = maintenant
    achat.motif_annulation = motif.strip()
    await session.commit()
    return await lire_achat(session, achat_id)


async def _verrouiller_comptes_existants(
    session: AsyncSession, ids: set[int]
) -> dict[int, CompteTresorerie]:
    """Comme `_verrouiller_comptes`, sans exiger un compte actif : une contre-passation
    revient toujours sur le compte d'origine, même désactivé depuis."""
    return {
        c.id: c
        for c in (
            await session.execute(
                select(CompteTresorerie)
                .where(CompteTresorerie.id.in_(sorted(ids)))
                .order_by(CompteTresorerie.id)
                .with_for_update()
            )
        ).scalars()
    }
