"use client";

import Link from "next/link";
import { Printer } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import {
  CLE_VENTES,
  CLIENT_COMPTOIR,
  etatVente,
  type VenteDetail,
} from "@/components/ventes/types";
import { formaterDate, formaterDateHeure, formaterMontant, formaterTelephone } from "@/lib/formats";
import { usePeut } from "@/lib/session";

/** Fiche d'une vente ou d'un don (US-VTE-03, 05, 06), dans le panneau de l'historique. */
export function DetailVente({ vente }: { vente: VenteDetail }) {
  const peutSaisir = usePeut("saisir_vente");
  const rafraichir = useRafraichirApres<VenteDetail>(CLE_VENTES);
  const etat = etatVente(vente);
  const annule = vente.statut === "ANNULE";
  const encaissements = vente.reglements.filter((r) => r.statut === "VALIDE");
  const resteDu = !annule && !/^0+(\.0+)?$/.test(vente.reste_a_payer);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={etat.variante}>{etat.libelle}</Badge>
        <span className="text-texte-2">
          Le {formaterDate(vente.date_vente)} · saisi par {vente.auteur}
        </span>
      </div>
      {annule && (
        <p className="rounded-md bg-neutre-fond px-3 py-2 text-neutre">
          Annulé le {vente.annule_le ? formaterDateHeure(vente.annule_le) : ""} par{" "}
          {vente.annule_par} : {vente.motif_annulation}
        </p>
      )}
      <dl className="flex flex-col gap-2">
        {vente.est_don ? (
          <>
            <Ligne libelle="Bénéficiaire">{vente.client}</Ligne>
            <Ligne libelle="Motif">{vente.motif_don}</Ligne>
          </>
        ) : (
          <>
            <Ligne libelle="Client">{vente.client ?? CLIENT_COMPTOIR}</Ligne>
            {vente.client_telephone && (
              <Ligne libelle="Téléphone">{formaterTelephone(vente.client_telephone)}</Ligne>
            )}
          </>
        )}
      </dl>
      <ListeArticles piece={vente} sansPrix={vente.est_don} />
      {!vente.est_don && (
        <>
          <Totaux piece={vente} annule={annule} libelleRegle="Encaissé" />
          <ListeReglements piece={vente} titre="Encaissements" />
          <div>
            <Button asChild>
              <Link href={`/ventes/${vente.id}/facture`} target="_blank">
                <Printer />
                Imprimer la facture
              </Link>
            </Button>
          </div>
        </>
      )}

      {peutSaisir && !annule && (
        <>
          {resteDu && vente.client_id && (
            <ReglementUlterieur
              // Nouvelle clé d'idempotence après chaque encaissement enregistré
              key={vente.reglements.length}
              piece={vente}
              adresse={`ventes/${vente.id}/reglements`}
              flux="encaissement"
              onEnregistre={rafraichir}
              libelles={{
                titre: "Encaisser le client",
                bouton: "Enregistrer l'encaissement",
                sansDoublon: "l'encaissement ne sera pas enregistré deux fois",
                solde: (numero) => `Vente ${numero} soldée`,
                partiel: (montant, reste) =>
                  `Encaissement de ${montant} enregistré ; reste ${reste}`,
              }}
            />
          )}
          <div>
            <AnnulationPiece
              piece={vente}
              adresse={`ventes/${vente.id}/annuler`}
              onEnregistre={rafraichir}
              effets={[
                ...effetsStock(vente, "reviendront en stock"),
                ...encaissements.map(
                  (r) =>
                    `L'encaissement de ${formaterMontant(r.montant)} sera retiré de « ${r.compte} ».`,
                ),
              ]}
              libelles={
                vente.est_don
                  ? {
                      action: "Annuler le don",
                      garder: "Garder le don",
                      description: "Le don restera dans l'historique, marqué « Annulé ».",
                      motifManquant: "Indiquez pourquoi le don est annulé.",
                      annule: (numero) => `Don ${numero} annulé`,
                    }
                  : {
                      action: "Annuler la vente",
                      garder: "Garder la vente",
                      description:
                        "La facture garde son numéro et reste dans l'historique, marquée « Annulé ».",
                      motifManquant: "Indiquez pourquoi la vente est annulée.",
                      annule: (numero) => `Vente ${numero} annulée`,
                    }
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
