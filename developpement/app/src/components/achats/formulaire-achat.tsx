"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { CLE_ACHATS, estNul, type AchatDetail } from "@/components/achats/types";
import { CLE_ARTICLES } from "@/components/articles/types";
import { Page } from "@/components/coquille/page";
import { BlocPaiements, Recapitulatif, validerPaiements } from "@/components/pieces/bloc-paiements";
import { ConfirmationMontant } from "@/components/pieces/confirmation-montant";
import { LignesArticles } from "@/components/pieces/lignes-articles";
import {
  dateDuJour,
  ecrireBrouillon,
  lireBrouillon,
  messageEchec,
  nouveauPaiement,
  nouvelleLigne,
  paiementsAffiches,
  quantiteValide,
  totalDesLignes,
  totalRegle,
  useAvertirAvantDeQuitter,
  type ErreursLigne,
  type ErreursPaiement,
  type Ligne,
  type Paiement,
} from "@/components/pieces/saisie";
import type { Tiers } from "@/components/tiers/formulaire-tiers";
import { CLE_COMPTES, type CompteTresorerie } from "@/components/tresorerie/formulaires-compte";
import { Button } from "@/components/ui/button";
import { Champ } from "@/components/ui/champ";
import { ChampChoix } from "@/components/ui/champ-choix";
import { Input } from "@/components/ui/input";
import { appelerApi } from "@/lib/api";
import { estInferieur, soustraireDecimaux } from "@/lib/decimal";
import { formaterMontant } from "@/lib/formats";
import { notifier } from "@/lib/notifications";
import { SEUIL_CONFIRMATION_FCFA } from "@/lib/seuils";

type Fournisseur = Pick<Tiers, "id" | "nom" | "telephone">;

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
  lignes?: Record<string, ErreursLigne>;
  paiements?: Record<string, ErreursPaiement>;
  general?: string;
};

const CLE_BROUILLON = "keitala:brouillon-achat";

export const lireBrouillonAchat = () => lireBrouillon<Saisie>(CLE_BROUILLON);

function nouvelleSaisie(): Saisie {
  return {
    cleIdempotence: crypto.randomUUID(),
    fournisseur: null,
    fournisseurLibre: "",
    numeroFacture: "",
    dateAchat: dateDuJour(),
    lignes: [nouvelleLigne()],
    paiements: [nouveauPaiement()],
    paiementSuitTotal: true,
  };
}

function estModifiee(saisie: Saisie): boolean {
  return (
    saisie.fournisseur !== null ||
    saisie.fournisseurLibre.trim() !== "" ||
    saisie.numeroFacture.trim() !== "" ||
    saisie.lignes.some((l) => l.article || l.quantite || l.prix)
  );
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

  const total = totalDesLignes(saisie.lignes);
  const paiements = paiementsAffiches(
    saisie.paiements,
    saisie.paiementSuitTotal,
    total,
    comptesActifs,
  );
  const regle = totalRegle(paiements);
  const reste = soustraireDecimaux(total, regle) ?? "0";
  const aCredit = !reste.startsWith("-") && !estNul(reste);
  const nomFournisseur = saisie.fournisseur?.nom ?? (saisie.fournisseurLibre.trim() || null);

  // Brouillon gardé à chaque frappe : un réseau coupé ou un onglet fermé ne perd rien
  React.useEffect(() => {
    ecrireBrouillon(CLE_BROUILLON, estModifiee(saisie) ? saisie : null);
  }, [saisie]);
  useAvertirAvantDeQuitter(estModifiee(saisie));

  const modifier = (changement: Partial<Saisie>) => {
    setSaisie((avant) => ({ ...avant, ...changement }));
    setRepris(false);
  };

  const recommencer = () => {
    ecrireBrouillon(CLE_BROUILLON, null);
    setSaisie(nouvelleSaisie());
    setErreurs({});
    setRepris(false);
  };

  const valider = (): Erreurs => {
    const nouvelles: Erreurs = {};
    const lignes: Record<string, ErreursLigne> = {};
    for (const ligne of saisie.lignes) {
      const e: ErreursLigne = {};
      if (!ligne.article) e.article = "Choisissez l'article.";
      if (!quantiteValide(ligne.quantite)) e.quantite = "Saisissez la quantité reçue.";
      if (ligne.prix === "") e.prix = "Saisissez le prix d'achat.";
      if (Object.keys(e).length > 0) lignes[ligne.cle] = e;
    }
    if (Object.keys(lignes).length > 0) nouvelles.lignes = lignes;
    const erreursPaiements = validerPaiements(paiements, comptesActifs, "decaissement");
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
      ecrireBrouillon(CLE_BROUILLON, null);
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
      setErreurs({ general: messageEchec(cause, "l'achat ne sera pas enregistré deux fois") });
    } finally {
      setEnCours(false);
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
        onKeyDown={(evenement) => {
          if (evenement.key === "Enter" && (evenement.ctrlKey || evenement.metaKey)) {
            evenement.preventDefault();
            demanderEnregistrement();
          }
        }}
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

        <LignesArticles
          titre="Articles reçus"
          lignes={saisie.lignes}
          erreurs={erreurs.lignes}
          onChange={(lignes) => modifier({ lignes })}
        />

        <BlocPaiements
          flux="decaissement"
          paiements={paiements}
          comptes={comptesActifs}
          total={total}
          erreurs={erreurs.paiements}
          onChange={(suivants, manuel) =>
            modifier({
              paiements: suivants,
              paiementSuitTotal: saisie.paiementSuitTotal && !manuel,
            })
          }
        />

        <Recapitulatif
          libelleTotal="Total de l'achat"
          total={total}
          libelleRegle="Payé maintenant"
          regle={regle}
          libelleReste={`Reste dû${nomFournisseur ? ` à ${nomFournisseur}` : ""}`}
          reste={reste}
        />

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

      <ConfirmationMontant
        ouvert={confirmation}
        onOuvertChange={setConfirmation}
        titre="Confirmer un achat de"
        montant={total}
        action="Enregistrer l'achat"
        enCours={enCours}
        onConfirmer={enregistrer}
      />
    </Page>
  );
}
