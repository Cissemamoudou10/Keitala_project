"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";

import { nomComplet } from "@/components/articles/types";
import { Logo } from "@/components/coquille/logo";
import { EtatRequete } from "@/components/etats/etat-requete";
import { SqueletteFormulaire } from "@/components/etats/squelettes";
import { Button } from "@/components/ui/button";
import {
  CLE_VENTES,
  CLIENT_COMPTOIR,
  type Entreprise,
  type VenteDetail,
} from "@/components/ventes/types";
import { appelerApi } from "@/lib/api";
import {
  formaterDate,
  formaterMontant,
  formaterMontantSeul,
  formaterQuantite,
  formaterTelephone,
} from "@/lib/formats";
import { montantEnLettres } from "@/lib/nombres-en-lettres";

/**
 * Facture A4 imprimable (US-VTE-03, D-032) : « Imprimer » ouvre la fenêtre du
 * navigateur, qui propose aussi « Enregistrer en PDF ». En-tête provisoire (P-006).
 */
export function Facture({ id }: { id: string }) {
  const vente = useQuery({
    queryKey: [...CLE_VENTES, id],
    queryFn: ({ signal }) => appelerApi<VenteDetail>(`ventes/${id}`, { signal }),
  });
  const entreprise = useQuery({
    queryKey: ["entreprise"],
    queryFn: ({ signal }) => appelerApi<Entreprise>("entreprise", { signal }),
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <div className="mx-auto flex w-full max-w-[210mm] flex-col gap-6 px-4 py-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <Button asChild variant="discret">
          <Link href={`/ventes?vente=${id}`}>Retour à la vente</Link>
        </Button>
        <Button variant="principal" onClick={() => window.print()} disabled={!vente.data}>
          <Printer />
          Imprimer
        </Button>
      </div>
      <EtatRequete requete={vente} chargement={<SqueletteFormulaire champs={8} />}>
        {(donnees) =>
          donnees.est_don ? (
            <p className="text-texte-2">
              {donnees.numero} est un don : il n&apos;a pas de facture.
            </p>
          ) : (
            <FeuilleFacture vente={donnees} entreprise={entreprise.data} />
          )
        }
      </EtatRequete>
    </div>
  );
}

function FeuilleFacture({
  vente,
  entreprise,
}: {
  vente: VenteDetail;
  entreprise: Entreprise | undefined;
}) {
  const encaissements = vente.reglements.filter((r) => r.statut === "VALIDE");
  const annulee = vente.statut === "ANNULE";
  const resteDu = !annulee && !/^0+(\.0+)?$/.test(vente.reste_a_payer);
  // En milieu de phrase : « … à la somme de vingt-cinq mille francs CFA »
  const enLettres = montantEnLettres(vente.montant_total);
  const somme = enLettres.charAt(0).toLowerCase() + enLettres.slice(1);

  return (
    <article
      aria-label={`Facture ${vente.numero}`}
      className="flex flex-col gap-8 rounded-md border border-bordure bg-fond p-10 text-sm print:border-0 print:p-0"
    >
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <Logo className="mb-2 h-16 self-start" />
          <p className="text-titre-section font-semibold">{entreprise?.nom ?? "Keitala Négoce"}</p>
          {entreprise?.adresse && <p className="text-texte-2">{entreprise.adresse}</p>}
          {entreprise?.telephone && (
            <p className="text-texte-2">Tél. {formaterTelephone(entreprise.telephone)}</p>
          )}
          {entreprise?.identifiants && <p className="text-texte-2">{entreprise.identifiants}</p>}
        </div>
        <div className="flex flex-col gap-1 text-right">
          <h1 className="text-titre-page font-semibold">Facture</h1>
          <p className="tabular-nums">{vente.numero}</p>
          <p className="text-texte-2">Date : {formaterDate(vente.date_vente)}</p>
        </div>
      </header>

      {annulee && (
        <p className="rounded-md border border-danger px-3 py-2 text-center font-semibold text-danger">
          FACTURE ANNULÉE{vente.motif_annulation ? ` : ${vente.motif_annulation}` : ""}
        </p>
      )}

      <section className="flex flex-col gap-1" aria-label="Client">
        <p className="text-xs text-texte-2 uppercase">Facturé à</p>
        <p className="font-medium">{vente.client ?? CLIENT_COMPTOIR}</p>
        {vente.client_telephone && (
          <p className="text-texte-2">Tél. {formaterTelephone(vente.client_telephone)}</p>
        )}
        {vente.client_adresse && <p className="text-texte-2">{vente.client_adresse}</p>}
      </section>

      <table className="w-full border-collapse tabular-nums">
        <thead>
          <tr className="border-b border-bordure-forte text-left text-texte-2">
            <th className="py-2 font-medium">Désignation</th>
            <th className="py-2 text-right font-medium">Quantité</th>
            <th className="py-2 text-right font-medium">Prix unitaire</th>
            <th className="py-2 text-right font-medium">Montant FCFA</th>
          </tr>
        </thead>
        <tbody>
          {vente.lignes.map((ligne) => (
            <tr key={ligne.id} className="border-b border-bordure">
              <td className="py-2">{nomComplet(ligne.article)}</td>
              <td className="py-2 text-right">{formaterQuantite(ligne.quantite, ligne.unite)}</td>
              <td className="py-2 text-right">{formaterMontantSeul(ligne.prix_unitaire)}</td>
              <td className="py-2 text-right">{formaterMontantSeul(ligne.montant_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="ml-auto flex w-full max-w-xs flex-col gap-2 tabular-nums">
        <p className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span>{formaterMontant(vente.montant_total)}</span>
        </p>
        {encaissements.map((r) => (
          <p key={r.id} className="flex justify-between gap-4 text-texte-2">
            <span>
              Reçu le {formaterDate(r.date_reglement)} · {r.compte}
              {r.reference_paiement && ` (réf. ${r.reference_paiement})`}
            </span>
            <span>{formaterMontant(r.montant)}</span>
          </p>
        ))}
        <p className="flex justify-between border-t border-bordure pt-2 font-medium">
          <span>{resteDu ? "Reste à payer" : "Solde"}</span>
          <span>{formaterMontant(resteDu ? vente.reste_a_payer : "0")}</span>
        </p>
      </section>

      <p>
        Arrêtée la présente facture à la somme de <span className="font-medium">{somme}</span>.
      </p>

      {entreprise?.mentions && (
        <footer className="border-t border-bordure pt-4 text-center text-texte-2">
          {entreprise.mentions}
        </footer>
      )}
    </article>
  );
}
