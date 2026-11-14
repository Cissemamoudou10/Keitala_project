"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import { CLE_ACHATS, estNul, type AchatDetail } from "@/components/achats/types";
import {
  CLE_ARTICLES,
  nomComplet,
  type Article,
  type PageArticles,
} from "@/components/articles/types";
import { Page } from "@/components/coquille/page";
import { ChampMontant } from "@/components/saisie/champ-montant";
import { ChampQuantite } from "@/components/saisie/champ-quantite";
import type { Tiers } from "@/components/tiers/formulaire-tiers";
import { CLE_COMPTES, type CompteTresorerie } from "@/components/tresorerie/formulaires-compte";
import { Button } from "@/components/ui/button";
import { Champ } from "@/components/ui/champ";
import { ChampChoix } from "@/components/ui/champ-choix";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appelerApi, ErreurApi } from "@/lib/api";
import {
  additionnerDecimaux,
  estInferieur,
  multiplierDecimaux,
  soustraireDecimaux,
} from "@/lib/decimal";
import { formaterMontant, formaterQuantite } from "@/lib/formats";
import { montantEnLettres } from "@/lib/nombres-en-lettres";
import { notifier } from "@/lib/notifications";
import { SEUIL_CONFIRMATION_FCFA } from "@/lib/seuils";
import { cn } from "@/lib/utils";

type Fournisseur = Pick<Tiers, "id" | "nom" | "telephone">;

type Ligne = {
  cle: string;
  article: Article | null;
  uniteId: number | null;
  quantite: string;
  prix: string;
};

type Paiement = { cle: string; compteId: number | null; montant: string; reference: string };

/** Tout ce qui est saisi, gardé en brouillon dans le navigateur. */
export type Saisie = {
  /** Clé d'idempotence (P-009) : la même tant que l'achat n'est pas enregistré. */
  cleIdempotence: string;
  fournisseur: Fournisseur | null;
  fournisseurLibre: string;
  numeroFacture: string;
  dateAchat: string;
  lignes: Ligne[];
  paiements: Paiement[];
  /** Le premier paiement suit le total tant que l'utilisateur n'y a pas touché. */
  paiementSuitTotal: boolean;
};

type Erreurs = {
  fournisseur?: string;
  lignes?: Record<string, { article?: string; quantite?: string; prix?: string }>;
  paiements?: Record<string, { compte?: string; montant?: string }>;
  general?: string;
};

const CLE_BROUILLON = "keitala:brouillon-achat";

/** Date du jour à Bamako (UTC+0 toute l'année). */
function dateDuJour(): string {
  return new Date().toISOString().slice(0, 10);
}

function nouvelleLigne(): Ligne {
  return { cle: crypto.randomUUID(), article: null, uniteId: null, quantite: "", prix: "" };
}

function nouvelleSaisie(): Saisie {
  return {
    cleIdempotence: crypto.randomUUID(),
    fournisseur: null,
    fournisseurLibre: "",
    numeroFacture: "",
    dateAchat: dateDuJour(),
    lignes: [nouvelleLigne()],
    paiements: [{ cle: crypto.randomUUID(), compteId: null, montant: "", reference: "" }],
    paiementSuitTotal: true,
  };
}

/** Le brouillon n'existe que dans le navigateur : à lire après l'hydratation. */
export function lireBrouillonAchat(): Saisie | null {
  try {
    const texte = window.localStorage.getItem(CLE_BROUILLON);
    return texte ? (JSON.parse(texte) as Saisie) : null;
  } catch {
    return null;
  }
}

function ecrireBrouillon(saisie: Saisie | null) {
  try {
    if (saisie) window.localStorage.setItem(CLE_BROUILLON, JSON.stringify(saisie));
    else window.localStorage.removeItem(CLE_BROUILLON);
  } catch {
    // Stockage indisponible (navigation privée) : la saisie reste dans la page
  }
}

/** Montant d'une ligne au centime, comme la base (colonne calculée), ou null. */
function montantLigne(ligne: Ligne): string | null {
  if (!ligne.article || !ligne.prix || !/^\d+([.,]\d{1,3})?$/.test(ligne.quantite)) return null;
  return multiplierDecimaux(ligne.quantite.replace(",", "."), ligne.prix, 2);
}

function estModifiee(saisie: Saisie): boolean {
  return (
    saisie.fournisseur !== null ||
    saisie.fournisseurLibre.trim() !== "" ||
    saisie.numeroFacture.trim() !== "" ||
    saisie.lignes.some((l) => l.article || l.quantite || l.prix)
  );
}

async function chercherArticles(texte: string, signal: AbortSignal): Promise<Article[]> {
  const page = await appelerApi<PageArticles>("articles", {
    parametres: { recherche: texte, taille: 20 },
    signal,
  });
  return page.items;
}

async function chercherFournisseurs(texte: string, signal: AbortSignal): Promise<Fournisseur[]> {
  const page = await appelerApi<{ items: Tiers[] }>("tiers", {
    parametres: { type: "fournisseur", recherche: texte, taille: 20 },
    signal,
  });
  return page.items;
}

/**
 * Saisie d'un achat (US-ACH-01) : fournisseur, articles en kg ou en sacs, paiements sur
 * un ou plusieurs comptes. Le reste non payé devient une dette fournisseur.
 */
export function FormulaireAchat({ brouillon }: { brouillon: Saisie | null }) {
  const router = useRouter();
  const clientRequetes = useQueryClient();
  const [saisie, setSaisie] = React.useState<Saisie>(() => brouillon ?? nouvelleSaisie());
  const [repris, setRepris] = React.useState(brouillon !== null);
  const [erreurs, setErreurs] = React.useState<Erreurs>({});
  const [enCours, setEnCours] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState(false);
  const formulaire = React.useRef<HTMLFormElement>(null);

  const comptes = useQuery({
    queryKey: CLE_COMPTES,
    queryFn: ({ signal }) => appelerApi<CompteTresorerie[]>("tresorerie/comptes", { signal }),
  });
  const comptesActifs = (comptes.data ?? []).filter((c) => c.est_actif);

  const montants = saisie.lignes.map(montantLigne);
  const total = additionnerDecimaux(montants.map((m) => m ?? "0")) ?? "0";
  // Le premier paiement suit le total, déduction faite des autres paiements
  const paiements = saisie.paiements.map((p, index) => {
    if (index !== 0 || !saisie.paiementSuitTotal) return p;
    // Caisse proposée d'emblée : le cas le plus courant
    const compteId = p.compteId ?? comptesActifs.find((c) => c.type === "CAISSE")?.id ?? null;
    const autres = additionnerDecimaux(saisie.paiements.slice(1).map((x) => x.montant || "0"));
    const reste = soustraireDecimaux(total, autres ?? "0") ?? "0";
    // Paiements en FCFA entiers : on arrondit au franc inférieur
    const entier = reste.startsWith("-") ? "0" : reste.split(".")[0];
    return { ...p, compteId, montant: entier === "0" ? "" : entier };
  });
  const regle = additionnerDecimaux(paiements.map((p) => p.montant || "0")) ?? "0";
  const reste = soustraireDecimaux(total, regle) ?? "0";
  const aCredit = !reste.startsWith("-") && !estNul(reste);
  const nomFournisseur = saisie.fournisseur?.nom ?? (saisie.fournisseurLibre.trim() || null);

  // Brouillon gardé à chaque frappe : un réseau coupé ou un onglet fermé ne perd rien
  React.useEffect(() => {
    ecrireBrouillon(estModifiee(saisie) ? saisie : null);
  }, [saisie]);

  // Ne jamais perdre une saisie : avertir avant de quitter la page (charte, section 10)
  const modifiee = estModifiee(saisie);
  React.useEffect(() => {
    if (!modifiee) return;
    const avertir = (evenement: BeforeUnloadEvent) => evenement.preventDefault();
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [modifiee]);

  const modifier = (changement: Partial<Saisie>) => {
    setSaisie((avant) => ({ ...avant, ...changement }));
    setRepris(false);
  };
  const modifierLigne = (cle: string, changement: Partial<Ligne>) =>
    modifier({ lignes: saisie.lignes.map((l) => (l.cle === cle ? { ...l, ...changement } : l)) });
  const modifierPaiement = (cle: string, changement: Partial<Paiement>) => {
    const premier = saisie.paiements[0]?.cle === cle;
    modifier({
      paiements: paiements.map((p) => (p.cle === cle ? { ...p, ...changement } : p)),
      paiementSuitTotal: saisie.paiementSuitTotal && !(premier && "montant" in changement),
    });
  };

  const recommencer = () => {
    ecrireBrouillon(null);
    setSaisie(nouvelleSaisie());
    setErreurs({});
    setRepris(false);
  };

  const valider = (): Erreurs => {
    const nouvelles: Erreurs = {};
    const lignes: NonNullable<Erreurs["lignes"]> = {};
    for (const ligne of saisie.lignes) {
      const e: (typeof lignes)[string] = {};
      if (!ligne.article) e.article = "Choisissez l'article.";
      if (!/^\d+([.,]\d{1,3})?$/.test(ligne.quantite) || /^0+([.,]0*)?$/.test(ligne.quantite)) {
        e.quantite = "Saisissez la quantité reçue.";
      }
      if (ligne.prix === "") e.prix = "Saisissez le prix d'achat.";
      if (Object.keys(e).length > 0) lignes[ligne.cle] = e;
    }
    if (Object.keys(lignes).length > 0) nouvelles.lignes = lignes;

    const erreursPaiements: NonNullable<Erreurs["paiements"]> = {};
    for (const paiement of paiements) {
      const e: (typeof erreursPaiements)[string] = {};
      const compte = comptesActifs.find((c) => c.id === paiement.compteId);
      if (!paiement.montant) e.montant = "Saisissez le montant payé, ou retirez ce paiement.";
      if (!compte) e.compte = "Choisissez le compte qui paie.";
      else if (
        compte.type !== "BANQUE" &&
        paiement.montant &&
        estInferieur(compte.solde_actuel, paiement.montant) === true
      ) {
        e.montant = `Il reste ${formaterMontant(compte.solde_actuel)} sur « ${compte.nom} ». Réduisez le montant ou choisissez un autre compte.`;
      }
      if (Object.keys(e).length > 0) erreursPaiements[paiement.cle] = e;
    }
    if (Object.keys(erreursPaiements).length > 0) nouvelles.paiements = erreursPaiements;

    if (reste.startsWith("-")) {
      nouvelles.general = `Les paiements dépassent le total de ${formaterMontant(soustraireDecimaux("0", reste) ?? "0")}.`;
    }
    if (aCredit && !saisie.fournisseur) {
      nouvelles.fournisseur = saisie.fournisseurLibre.trim()
        ? "Un achat à crédit exige un fournisseur du répertoire : choisissez-le dans la liste."
        : "Choisissez le fournisseur : le reste à payer deviendra une dette envers lui.";
    }
    return nouvelles;
  };

  const demanderEnregistrement = () => {
    if (enCours) return;
    const nouvelles = valider();
    setErreurs(nouvelles);
    if (Object.keys(nouvelles).length > 0) {
      // Amène la première erreur à l'écran
      window.requestAnimationFrame(() =>
        formulaire.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(),
      );
      return;
    }
    if (!estInferieur(total, SEUIL_CONFIRMATION_FCFA)) setConfirmation(true);
    else void enregistrer();
  };

  const enregistrer = async () => {
    setEnCours(true);
    setErreurs({});
    try {
      const achat = await appelerApi<AchatDetail>("achats", {
        methode: "POST",
        corps: {
          cle_idempotence: saisie.cleIdempotence,
          fournisseur_id: saisie.fournisseur?.id ?? null,
          fournisseur_nom_libre: saisie.fournisseur ? null : saisie.fournisseurLibre.trim() || null,
          numero_facture_fournisseur: saisie.numeroFacture.trim() || null,
          date_achat: saisie.dateAchat || null,
          lignes: saisie.lignes.map((l) => ({
            article_id: l.article?.id,
            unite_id: l.uniteId,
            quantite: l.quantite.replace(",", "."),
            prix_unitaire: l.prix,
          })),
          reglements: paiements.map((p) => ({
            compte_id: p.compteId,
            montant: p.montant,
            reference_paiement: p.reference.trim() || null,
          })),
        },
      });
      ecrireBrouillon(null);
      setSaisie(nouvelleSaisie());
      await Promise.all([
        clientRequetes.invalidateQueries({ queryKey: CLE_ACHATS }),
        clientRequetes.invalidateQueries({ queryKey: CLE_ARTICLES }),
        clientRequetes.invalidateQueries({ queryKey: CLE_COMPTES }),
        clientRequetes.invalidateQueries({ queryKey: ["tiers"] }),
        clientRequetes.invalidateQueries({ queryKey: ["stocks"] }),
      ]);
      notifier.succes(`Achat ${achat.numero} enregistré`);
      router.push(`/achats?achat=${achat.id}`);
    } catch (cause) {
      setConfirmation(false);
      setErreurs({
        general:
          cause instanceof ErreurApi
            ? cause.statut === 0
              ? "La connexion a été perdue. Votre saisie est conservée : réessayez dans un instant, l'achat ne sera pas enregistré deux fois."
              : cause.message
            : "Une erreur inattendue est survenue. Votre saisie est conservée.",
      });
    } finally {
      setEnCours(false);
    }
  };

  const gererTouche = (evenement: React.KeyboardEvent<HTMLFormElement>) => {
    if (evenement.key === "Enter" && (evenement.ctrlKey || evenement.metaKey)) {
      evenement.preventDefault();
      demanderEnregistrement();
    }
  };

  return (
    <Page
      titre="Nouvel achat"
      description="Réception de marchandises : le stock et les comptes sont mis à jour à l'enregistrement."
      largeur="formulaire"
    >
      {repris && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-info-fond px-3 py-2 text-info">
          Votre saisie précédente a été reprise.
          <Button variant="discret" onClick={recommencer}>
            Recommencer à zéro
          </Button>
        </p>
      )}
      <form
        ref={formulaire}
        noValidate
        onKeyDown={gererTouche}
        onSubmit={(evenement) => {
          evenement.preventDefault();
          demanderEnregistrement();
        }}
        className="flex flex-col gap-8"
      >
        <section className="flex flex-col gap-5">
          <Champ
            libelle="Fournisseur"
            erreur={erreurs.fournisseur}
            aide={
              !saisie.fournisseur && saisie.fournisseurLibre.trim()
                ? "Hors répertoire : le nom sera seulement noté sur l'achat (paiement comptant)."
                : undefined
            }
          >
            {(controle) => (
              // Clé de la saisie : le champ repart à vide quand on recommence
              <ChampChoix<Fournisseur>
                key={saisie.cleIdempotence}
                {...controle}
                autoFocus={!repris}
                valeur={saisie.fournisseur}
                texteInitial={saisie.fournisseurLibre}
                onChoix={(fournisseur) => modifier({ fournisseur })}
                onTexteChange={(fournisseurLibre) => modifier({ fournisseurLibre })}
                libelleDe={(f) => f.nom}
                cleDe={(f) => f.id}
                rechercher={chercherFournisseurs}
                cleRequete={["tiers", "fournisseurs"]}
                placeholder="Nom du fournisseur"
              />
            )}
          </Champ>
          <div className="flex flex-wrap gap-4">
            <Champ libelle="N° de facture ou bordereau" facultatif>
              {(controle) => (
                <Input
                  {...controle}
                  autoComplete="off"
                  maxLength={100}
                  className="w-56"
                  value={saisie.numeroFacture}
                  onChange={(e) => modifier({ numeroFacture: e.target.value })}
                />
              )}
            </Champ>
            <Champ libelle="Date de réception">
              {(controle) => (
                <Input
                  {...controle}
                  type="date"
                  max={dateDuJour()}
                  className="w-44"
                  value={saisie.dateAchat}
                  onChange={(e) => modifier({ dateAchat: e.target.value })}
                />
              )}
            </Champ>
          </div>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="titre-articles">
          <h2 id="titre-articles" className="text-titre-section font-semibold">
            Articles reçus
          </h2>
          {saisie.lignes.map((ligne, index) => {
            const e = erreurs.lignes?.[ligne.cle] ?? {};
            const montant = montants[index];
            const article = ligne.article;
            return (
              <div
                key={ligne.cle}
                className="flex flex-col gap-4 rounded-md border border-bordure p-4"
                aria-label={`Article ${index + 1}`}
                role="group"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <Champ libelle="Article" erreur={e.article}>
                      {(controle) => (
                        <ChampChoix<Article>
                          {...controle}
                          valeur={ligne.article}
                          onChoix={(article) =>
                            modifierLigne(ligne.cle, {
                              article,
                              // Unité de saisie courante (le sac) proposée d'emblée
                              uniteId: article?.unites[0]?.id ?? null,
                            })
                          }
                          libelleDe={nomComplet}
                          cleDe={(a) => a.id}
                          rechercher={chercherArticles}
                          cleRequete={[...CLE_ARTICLES, "choix"]}
                          placeholder="Rechercher un article"
                          rendreOption={(a) => (
                            <span className="flex w-full justify-between gap-4">
                              <span>{nomComplet(a)}</span>
                              <span className="text-texte-2 tabular-nums">
                                En stock : {formaterQuantite(a.stock_actuel, a.unite_base)}
                              </span>
                            </span>
                          )}
                        />
                      )}
                    </Champ>
                  </div>
                  {saisie.lignes.length > 1 && (
                    <Button
                      type="button"
                      variant="discret"
                      size="icone"
                      className="mt-7"
                      aria-label={`Retirer l'article ${index + 1}`}
                      title="Retirer cet article"
                      onClick={() =>
                        modifier({ lignes: saisie.lignes.filter((l) => l.cle !== ligne.cle) })
                      }
                    >
                      <X />
                    </Button>
                  )}
                </div>
                {article && (
                  <div className="flex flex-wrap items-start gap-4">
                    <Champ libelle="Quantité" erreur={e.quantite}>
                      {(controle) => (
                        <ChampQuantite
                          {...controle}
                          quantite={ligne.quantite}
                          onQuantiteChange={(quantite) => modifierLigne(ligne.cle, { quantite })}
                          uniteId={ligne.uniteId}
                          onUniteChange={(uniteId) => modifierLigne(ligne.cle, { uniteId })}
                          uniteBase={article.unite_base}
                          unites={article.unites}
                        />
                      )}
                    </Champ>
                    <Champ
                      libelle={`Prix par ${
                        article.unites.find((u) => u.id === ligne.uniteId)?.libelle ??
                        article.unite_base
                      }`}
                      erreur={e.prix}
                    >
                      {(controle) => (
                        <ChampMontant
                          {...controle}
                          className="w-44"
                          value={ligne.prix}
                          onChange={(prix) => modifierLigne(ligne.cle, { prix })}
                        />
                      )}
                    </Champ>
                  </div>
                )}
                {montant && (
                  <p className="text-right text-texte-2 tabular-nums">
                    Montant : <span className="text-texte">{formaterMontant(montant)}</span>
                  </p>
                )}
              </div>
            );
          })}
          <div>
            <Button
              type="button"
              onClick={() => modifier({ lignes: [...saisie.lignes, nouvelleLigne()] })}
            >
              <Plus />
              Ajouter un article
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="titre-reglement">
          <h2 id="titre-reglement" className="text-titre-section font-semibold">
            Règlement
          </h2>
          {paiements.map((paiement) => {
            const e = erreurs.paiements?.[paiement.cle] ?? {};
            const compte = comptesActifs.find((c) => c.id === paiement.compteId);
            const soldeApres =
              compte && paiement.montant
                ? soustraireDecimaux(compte.solde_actuel, paiement.montant)
                : null;
            return (
              <div
                key={paiement.cle}
                className="flex flex-wrap items-start gap-4"
                role="group"
                aria-label="Paiement"
              >
                <Champ
                  libelle="Compte"
                  erreur={e.compte}
                  aide={
                    compte
                      ? soldeApres !== null
                        ? `Solde après : ${formaterMontant(soldeApres)}`
                        : `Solde : ${formaterMontant(compte.solde_actuel)}`
                      : undefined
                  }
                >
                  {(controle) => (
                    <Select
                      value={paiement.compteId === null ? "" : String(paiement.compteId)}
                      onValueChange={(valeur) =>
                        modifierPaiement(paiement.cle, { compteId: Number(valeur) })
                      }
                    >
                      <SelectTrigger {...controle} className="w-56">
                        <SelectValue placeholder="Choisir le compte" />
                      </SelectTrigger>
                      <SelectContent>
                        {comptesActifs.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.nom}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Champ>
                <Champ libelle="Montant payé" erreur={e.montant}>
                  {(controle) => (
                    <ChampMontant
                      {...controle}
                      className="w-44"
                      value={paiement.montant}
                      onChange={(montant) => modifierPaiement(paiement.cle, { montant })}
                    />
                  )}
                </Champ>
                {compte && compte.type !== "CAISSE" && (
                  <Champ libelle="Référence" facultatif>
                    {(controle) => (
                      <Input
                        {...controle}
                        autoComplete="off"
                        maxLength={100}
                        placeholder={
                          compte.type === "BANQUE" ? "N° de chèque" : "N° de transaction"
                        }
                        className="w-44"
                        value={paiement.reference}
                        onChange={(e) =>
                          modifierPaiement(paiement.cle, { reference: e.target.value })
                        }
                      />
                    )}
                  </Champ>
                )}
                <Button
                  type="button"
                  variant="discret"
                  size="icone"
                  className="mt-7"
                  aria-label="Retirer ce paiement"
                  title="Retirer ce paiement"
                  onClick={() =>
                    modifier({
                      paiements: paiements.filter((p) => p.cle !== paiement.cle),
                      paiementSuitTotal: false,
                    })
                  }
                >
                  <X />
                </Button>
              </div>
            );
          })}
          {paiements.length === 0 && (
            <p className="text-texte-2">
              Rien n&apos;est payé maintenant : tout l&apos;achat est à crédit.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() =>
                modifier({
                  paiements: [
                    ...paiements,
                    {
                      cle: crypto.randomUUID(),
                      compteId: null,
                      montant: paiements.length === 0 && !estNul(total) ? total.split(".")[0] : "",
                      reference: "",
                    },
                  ],
                  paiementSuitTotal: false,
                })
              }
            >
              <Plus />
              {paiements.length === 0 ? "Payer maintenant" : "Payer aussi sur un autre compte"}
            </Button>
            {paiements.length > 0 && (
              <Button
                type="button"
                variant="discret"
                onClick={() => modifier({ paiements: [], paiementSuitTotal: false })}
              >
                Tout à crédit
              </Button>
            )}
          </div>
        </section>

        <section
          aria-label="Récapitulatif"
          className="bg-fond-2 flex flex-col gap-2 rounded-md p-4 tabular-nums"
        >
          <p className="flex justify-between">
            <span>Total de l&apos;achat</span>
            <span className="font-semibold">{formaterMontant(total)}</span>
          </p>
          <p className="flex justify-between text-texte-2">
            <span>Payé maintenant</span>
            <span>{formaterMontant(regle)}</span>
          </p>
          {aCredit && (
            <p className="flex justify-between text-attention">
              <span>Reste dû{nomFournisseur ? ` à ${nomFournisseur}` : ""}</span>
              <span className="font-medium">{formaterMontant(reste)}</span>
            </p>
          )}
        </section>

        {erreurs.general && (
          <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
            {erreurs.general}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="submit"
            variant="principal"
            enCours={enCours}
            libelleEnCours="Enregistrement…"
          >
            Enregistrer l&apos;achat
          </Button>
          <Button asChild variant="discret">
            <Link href="/achats">Retour aux achats</Link>
          </Button>
          <span className="hidden text-xs text-texte-2 lg:inline">
            Ctrl + Entrée pour enregistrer
          </span>
        </div>
      </form>

      <Dialog open={confirmation} onOpenChange={(valeur) => !enCours && setConfirmation(valeur)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer un achat de {formaterMontant(total)}</DialogTitle>
            <DialogDescription>Relisez le montant avant d&apos;enregistrer.</DialogDescription>
          </DialogHeader>
          <p className={cn("text-lg font-medium first-letter:uppercase")}>
            {montantEnLettres(total)}
          </p>
          <DialogFooter>
            <Button onClick={() => setConfirmation(false)} disabled={enCours}>
              Corriger
            </Button>
            <Button
              variant="principal"
              enCours={enCours}
              libelleEnCours="Enregistrement…"
              onClick={enregistrer}
            >
              Enregistrer l&apos;achat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
