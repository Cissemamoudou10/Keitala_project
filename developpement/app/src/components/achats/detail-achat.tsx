"use client";

import { CLE_ACHATS, estNul, etatPaiement, type AchatDetail } from "@/components/achats/types";
import {
  AnnulationPiece,
  effetsStock,
  Ligne,
  ListeArticles,
  ListeReglements,
  ReglementUlterieur,
  Totaux,
  useRafraichirApres,
} from "@/components/pieces/detail-piece";
import { Badge } from "@/components/ui/badge";
import { formaterDate, formaterDateHeure, formaterMontant } from "@/lib/formats";
import { usePeut } from "@/lib/session";

/** Fiche d'un achat (US-ACH-02), dans le panneau latéral de l'historique. */
export function DetailAchat({ achat }: { achat: AchatDetail }) {
  const peutSaisir = usePeut("saisir_achat");
  const rafraichir = useRafraichirApres<AchatDetail>(CLE_ACHATS);
  const etat = etatPaiement(achat);
  const annule = achat.statut === "ANNULE";
  const paiements = achat.reglements.filter((r) => r.statut === "VALIDE");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={etat.variante}>{etat.libelle}</Badge>
        <span className="text-texte-2">
          Reçu le {formaterDate(achat.date_achat)} · saisi par {achat.auteur}
        </span>
      </div>
      {annule && (
        <p className="rounded-md bg-neutre-fond px-3 py-2 text-neutre">
          Annulé le {achat.annule_le ? formaterDateHeure(achat.annule_le) : ""} par{" "}
          {achat.annule_par} : {achat.motif_annulation}
        </p>
      )}
      <dl className="flex flex-col gap-2">
        <Ligne libelle="Fournisseur">{achat.fournisseur ?? "Non renseigné"}</Ligne>
        {achat.numero_facture_fournisseur && (
          <Ligne libelle="Facture ou bordereau">{achat.numero_facture_fournisseur}</Ligne>
        )}
      </dl>
      <ListeArticles piece={achat} />
      <Totaux piece={achat} annule={annule} libelleRegle="Payé" />
      <ListeReglements piece={achat} titre="Paiements" />

      {peutSaisir && !annule && (
        <>
          {!estNul(achat.reste_a_payer) && achat.fournisseur_id && (
            <ReglementUlterieur
              // Nouvelle clé d'idempotence après chaque paiement enregistré
              key={achat.reglements.length}
              piece={achat}
              adresse={`achats/${achat.id}/reglements`}
              flux="decaissement"
              onEnregistre={rafraichir}
              libelles={{
                titre: "Payer le fournisseur",
                bouton: "Enregistrer le paiement",
                sansDoublon: "le paiement ne sera pas enregistré deux fois",
                solde: (numero) => `Achat ${numero} soldé`,
                partiel: (montant, reste) => `Paiement de ${montant} enregistré ; reste ${reste}`,
              }}
            />
          )}
          <div>
            <AnnulationPiece
              piece={achat}
              adresse={`achats/${achat.id}/annuler`}
              onEnregistre={rafraichir}
              effets={[
                ...effetsStock(achat, "sortiront du stock"),
                ...paiements.map(
                  (r) =>
                    `Le paiement de ${formaterMontant(r.montant)} reviendra sur « ${r.compte} ».`,
                ),
              ]}
              libelles={{
                action: "Annuler l'achat",
                garder: "Garder l'achat",
                description: "L'achat restera dans l'historique, marqué « Annulé ».",
                motifManquant: "Indiquez pourquoi l'achat est annulé.",
                annule: (numero) => `Achat ${numero} annulé`,
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
