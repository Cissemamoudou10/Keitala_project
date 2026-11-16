"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";

import { Page } from "@/components/coquille/page";
import { EtatRequete } from "@/components/etats/etat-requete";
import { EtatVide } from "@/components/etats/etat-vide";
import { SqueletteFormulaire, SqueletteTableau } from "@/components/etats/squelettes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Champ } from "@/components/ui/champ";
import { ChampRecherche } from "@/components/ui/champ-recherche";
import { Input } from "@/components/ui/input";
import { Onglets } from "@/components/ui/onglets";
import { Pagination } from "@/components/ui/pagination";
import { Panneau } from "@/components/ui/panneau";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DetailVente } from "@/components/ventes/detail-vente";
import {
  CLE_VENTES,
  CLIENT_COMPTOIR,
  etatVente,
  type PageVentes,
  type VenteDetail,
} from "@/components/ventes/types";
import { appelerApi } from "@/lib/api";
import { formaterDate, formaterMontantSeul } from "@/lib/formats";
import { useParametresAdresse } from "@/lib/parametres-adresse";
import { usePeut } from "@/lib/session";
import { cn } from "@/lib/utils";

type Vue = "toutes" | "a_encaisser" | "dons";

const MESSAGES_VIDES: Record<Vue, string> = {
  toutes: "Aucune vente enregistrée pour l'instant.",
  a_encaisser: "Aucune créance client : toutes les ventes sont encaissées.",
  dons: "Aucun don ni échantillon enregistré.",
};

/**
 * Historique des ventes, créances clients (US-VTE-05) et registre des dons (US-VTE-04) :
 * filtres par période, fiche dans un panneau sans quitter la liste.
 */
export function HistoriqueVentes() {
  const { lire, modifier, page } = useParametresAdresse();
  const peutSaisir = usePeut("saisir_vente");
  const vue: Vue = (["a_encaisser", "dons"] as const).find((v) => v === lire("vue")) ?? "toutes";
  const recherche = lire("recherche");
  const du = lire("du") || null;
  const au = lire("au") || null;
  const venteId = lire("vente") || null;

  const requete = useQuery({
    queryKey: [...CLE_VENTES, "liste", { vue, recherche, du, au, page }],
    queryFn: ({ signal }) =>
      appelerApi<PageVentes>("ventes", {
        parametres: {
          type: vue === "dons" ? "dons" : vue === "a_encaisser" ? "ventes" : null,
          a_encaisser: vue === "a_encaisser" || null,
          recherche,
          du,
          au,
          page,
        },
        signal,
      }),
    placeholderData: (precedent) => precedent,
  });
  const detail = useQuery({
    queryKey: [...CLE_VENTES, venteId],
    queryFn: ({ signal }) => appelerApi<VenteDetail>(`ventes/${venteId}`, { signal }),
    enabled: venteId !== null,
  });
  const filtre = recherche || du || au;

  return (
    <Page
      titre="Ventes"
      description="Ventes au comptoir et en gros, créances clients, dons et échantillons."
      action={
        <div className="flex flex-wrap gap-2">
          {/* Le répertoire des tiers est hors menu : on y accède depuis les ventes */}
          <Button asChild variant="discret">
            <Link href="/tiers?type=client">
              <Users />
              Voir les clients
            </Link>
          </Button>
          {peutSaisir && (
            <Button asChild variant="principal">
              <Link href="/ventes/nouvelle">
                <Plus />
                Nouvelle vente
              </Link>
            </Button>
          )}
        </div>
      }
    >
      <Onglets
        libelleAccessible="Ventes à afficher"
        onglets={[
          { valeur: "toutes", libelle: "Toutes" },
          { valeur: "a_encaisser", libelle: "À encaisser" },
          { valeur: "dons", libelle: "Dons" },
        ]}
        actif={vue}
        onChange={(valeur) => modifier({ vue: valeur === "toutes" ? null : valeur })}
      />
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full max-w-xs">
          <ChampRecherche
            libelle="Rechercher une vente"
            placeholder="N° de facture ou client"
            valeur={recherche}
            onChange={(texte) => modifier({ recherche: texte })}
          />
        </div>
        <Champ libelle="Du">
          {(controle) => (
            <Input
              type="date"
              value={du ?? ""}
              onChange={(e) => modifier({ du: e.target.value })}
              className="w-44"
              {...controle}
            />
          )}
        </Champ>
        <Champ libelle="Au">
          {(controle) => (
            <Input
              type="date"
              value={au ?? ""}
              onChange={(e) => modifier({ au: e.target.value })}
              className="w-44"
              {...controle}
            />
          )}
        </Champ>
      </div>

      <EtatRequete
        requete={requete}
        chargement={<SqueletteTableau lignes={8} colonnes={6} />}
        estVide={(donnees) => donnees.total === 0}
        vide={
          <EtatVide
            message={filtre ? "Aucune vente pour ces critères." : MESSAGES_VIDES[vue]}
            action={
              !filtre &&
              vue === "toutes" &&
              peutSaisir && (
                <Button asChild>
                  <Link href="/ventes/nouvelle">Saisir la première vente</Link>
                </Button>
              )
            }
          />
        }
      >
        {(donnees) => (
          <div className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>N°</TableHead>
                  <TableHead>{vue === "dons" ? "Bénéficiaire" : "Client"}</TableHead>
                  <TableHead className="hidden lg:table-cell">Règlement</TableHead>
                  <TableHead numerique>Montant FCFA</TableHead>
                  <TableHead numerique className="hidden md:table-cell">
                    Reste FCFA
                  </TableHead>
                  <TableHead>État</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donnees.items.map((vente) => {
                  const etat = etatVente(vente);
                  const annule = vente.statut === "ANNULE";
                  const sansReste = annule || /^0+(\.0+)?$/.test(vente.reste_a_payer);
                  return (
                    <TableRow
                      key={vente.id}
                      className="cursor-pointer"
                      onClick={() => modifier({ vente: vente.id, page })}
                    >
                      <TableCell className="whitespace-nowrap text-texte-2">
                        {formaterDate(vente.date_vente)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        <button
                          type="button"
                          className={cn("text-left", annule && "line-through")}
                          onClick={(evenement) => {
                            evenement.stopPropagation();
                            modifier({ vente: vente.id, page });
                          }}
                        >
                          {vente.numero}
                        </button>
                      </TableCell>
                      <TableCell>{vente.client ?? CLIENT_COMPTOIR}</TableCell>
                      <TableCell className="hidden text-texte-2 lg:table-cell">
                        {vente.est_don
                          ? ""
                          : vente.comptes.length > 0
                            ? vente.comptes.join(", ")
                            : "À crédit"}
                      </TableCell>
                      <TableCell numerique className={cn(annule && "text-texte-2")}>
                        {vente.est_don ? "" : formaterMontantSeul(vente.montant_total)}
                      </TableCell>
                      <TableCell numerique className="hidden md:table-cell">
                        {sansReste ? "" : formaterMontantSeul(vente.reste_a_payer)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={etat.variante}>{etat.libelle}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination
              page={donnees.page}
              pagesTotal={donnees.pages_total}
              total={donnees.total}
              onPage={(numero) => modifier({ page: numero })}
            />
          </div>
        )}
      </EtatRequete>

      <Panneau
        ouvert={venteId !== null}
        onOuvertChange={(ouvert) => !ouvert && modifier({ vente: null, page })}
        titre={
          detail.data ? `${detail.data.est_don ? "Don" : "Vente"} ${detail.data.numero}` : "Vente"
        }
      >
        <EtatRequete requete={detail} chargement={<SqueletteFormulaire champs={5} />}>
          {(vente) => <DetailVente vente={vente} />}
        </EtatRequete>
      </Panneau>
    </Page>
  );
}
