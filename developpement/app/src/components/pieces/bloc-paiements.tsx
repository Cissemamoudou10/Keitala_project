"use client";

import { Plus, X } from "lucide-react";

import {
  enFrancs,
  nouveauPaiement,
  type ErreursPaiement,
  type Flux,
  type Paiement,
} from "@/components/pieces/saisie";
import { ChampMontant } from "@/components/saisie/champ-montant";
import type { CompteTresorerie } from "@/components/tresorerie/formulaires-compte";
import { Button } from "@/components/ui/button";
import { Champ } from "@/components/ui/champ";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { additionnerDecimaux, estInferieur, soustraireDecimaux } from "@/lib/decimal";
import { formaterMontant } from "@/lib/formats";

const LIBELLES: Record<
  Flux,
  { compte: string; montant: string; maintenant: string; autre: string; piece: string }
> = {
  decaissement: {
    compte: "Choisissez le compte qui paie.",
    montant: "Montant payé",
    maintenant: "Payer maintenant",
    autre: "Payer aussi sur un autre compte",
    piece: "Rien n'est payé maintenant : tout l'achat est à crédit.",
  },
  encaissement: {
    compte: "Choisissez le compte qui reçoit l'argent.",
    montant: "Montant reçu",
    maintenant: "Encaisser maintenant",
    autre: "Encaisser aussi sur un autre compte",
    piece: "Rien n'est encaissé maintenant : toute la vente est à crédit.",
  },
};

/** Solde du compte après le paiement : il baisse pour un achat, monte pour une vente. */
export function soldeApres(compte: CompteTresorerie, montant: string, flux: Flux): string | null {
  return flux === "decaissement"
    ? soustraireDecimaux(compte.solde_actuel, montant)
    : additionnerDecimaux([compte.solde_actuel, montant]);
}

/** Erreurs des paiements : compte, montant, et solde insuffisant hors banque (D-030). */
export function validerPaiements(
  paiements: Paiement[],
  comptes: CompteTresorerie[],
  flux: Flux,
): Record<string, ErreursPaiement> {
  const erreurs: Record<string, ErreursPaiement> = {};
  for (const paiement of paiements) {
    const e: ErreursPaiement = {};
    const compte = comptes.find((c) => c.id === paiement.compteId);
    if (!paiement.montant) {
      e.montant = `Saisissez le ${LIBELLES[flux].montant.toLowerCase()}, ou retirez cette ligne.`;
    }
    if (!compte) e.compte = LIBELLES[flux].compte;
    else if (
      flux === "decaissement" &&
      compte.type !== "BANQUE" &&
      paiement.montant &&
      estInferieur(compte.solde_actuel, paiement.montant) === true
    ) {
      e.montant = `Il reste ${formaterMontant(compte.solde_actuel)} sur « ${compte.nom} ». Réduisez le montant ou choisissez un autre compte.`;
    }
    if (Object.keys(e).length > 0) erreurs[paiement.cle] = e;
  }
  return erreurs;
}

/**
 * Règlement d'une pièce (US-ACH-01, US-VTE-02) : un ou plusieurs comptes (Caisse, Banque,
 * Orange Money, Mobicash, Wave), montant saisi à la main, référence facultative hors
 * caisse ; sans paiement, la pièce est à crédit.
 */
export function BlocPaiements({
  flux,
  paiements,
  comptes,
  total,
  erreurs,
  onChange,
}: {
  flux: Flux;
  paiements: Paiement[];
  comptes: CompteTresorerie[];
  total: string;
  erreurs?: Record<string, ErreursPaiement>;
  /** `manuel` : l'utilisateur a pris la main, le premier paiement ne suit plus le total. */
  onChange: (paiements: Paiement[], manuel: boolean) => void;
}) {
  const libelles = LIBELLES[flux];
  const modifier = (cle: string, changement: Partial<Paiement>) =>
    onChange(
      paiements.map((p) => (p.cle === cle ? { ...p, ...changement } : p)),
      // Toucher au montant du premier paiement arrête le suivi du total
      paiements[0]?.cle === cle && "montant" in changement,
    );

  return (
    <section className="flex flex-col gap-4" aria-label="Règlement">
      <h2 className="text-titre-section font-semibold">Règlement</h2>
      {paiements.map((paiement) => {
        const e = erreurs?.[paiement.cle] ?? {};
        const compte = comptes.find((c) => c.id === paiement.compteId);
        const apres =
          compte && paiement.montant ? soldeApres(compte, paiement.montant, flux) : null;
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
                  ? apres !== null
                    ? `Solde après : ${formaterMontant(apres)}`
                    : `Solde : ${formaterMontant(compte.solde_actuel)}`
                  : undefined
              }
            >
              {(controle) => (
                <Select
                  value={paiement.compteId === null ? "" : String(paiement.compteId)}
                  onValueChange={(valeur) => modifier(paiement.cle, { compteId: Number(valeur) })}
                >
                  <SelectTrigger {...controle} className="w-56">
                    <SelectValue placeholder="Choisir le compte" />
                  </SelectTrigger>
                  <SelectContent>
                    {comptes.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Champ>
            <Champ libelle={libelles.montant} erreur={e.montant}>
              {(controle) => (
                <ChampMontant
                  {...controle}
                  className="w-44"
                  value={paiement.montant}
                  onChange={(montant) => modifier(paiement.cle, { montant })}
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
                    placeholder={compte.type === "BANQUE" ? "N° de chèque" : "N° de transaction"}
                    className="w-44"
                    value={paiement.reference}
                    onChange={(e) => modifier(paiement.cle, { reference: e.target.value })}
                  />
                )}
              </Champ>
            )}
            <Button
              variant="discret"
              size="icone"
              className="mt-7"
              aria-label="Retirer ce paiement"
              title="Retirer ce paiement"
              onClick={() =>
                onChange(
                  paiements.filter((p) => p.cle !== paiement.cle),
                  true,
                )
              }
            >
              <X />
            </Button>
          </div>
        );
      })}
      {paiements.length === 0 && <p className="text-texte-2">{libelles.piece}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            onChange(
              [...paiements, nouveauPaiement(paiements.length === 0 ? enFrancs(total) : "")],
              true,
            )
          }
        >
          <Plus />
          {paiements.length === 0 ? libelles.maintenant : libelles.autre}
        </Button>
        {paiements.length > 0 && (
          <Button variant="discret" onClick={() => onChange([], true)}>
            Tout à crédit
          </Button>
        )}
      </div>
    </section>
  );
}

/** Total, réglé, reste dû : la conséquence affichée avant de valider (charte). */
export function Recapitulatif({
  libelleTotal,
  total,
  libelleRegle,
  regle,
  libelleReste,
  reste,
}: {
  libelleTotal: string;
  total: string;
  libelleRegle: string;
  regle: string;
  libelleReste: string;
  reste: string;
}) {
  const aCredit = !reste.startsWith("-") && !/^0+(\.0+)?$/.test(reste);
  return (
    <section
      aria-label="Récapitulatif"
      className="flex flex-col gap-2 rounded-md bg-fond-doux p-4 tabular-nums"
    >
      <p className="flex justify-between">
        <span>{libelleTotal}</span>
        <span className="font-semibold">{formaterMontant(total)}</span>
      </p>
      <p className="flex justify-between text-texte-2">
        <span>{libelleRegle}</span>
        <span>{formaterMontant(regle)}</span>
      </p>
      {aCredit && (
        <p className="flex justify-between text-attention">
          <span>{libelleReste}</span>
          <span className="font-medium">{formaterMontant(reste)}</span>
        </p>
      )}
    </section>
  );
}
