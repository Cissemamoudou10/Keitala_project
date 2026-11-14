"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { DetailAchat } from "@/components/achats/detail-achat";
import {
  CLE_ACHATS,
  etatPaiement,
  estNul,
  type AchatDetail,
  type PageAchats,
} from "@/components/achats/types";
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
import { appelerApi } from "@/lib/api";
import { formaterDate, formaterMontantSeul } from "@/lib/formats";
import { useParametresAdresse } from "@/lib/parametres-adresse";
import { usePeut } from "@/lib/session";
import { cn } from "@/lib/utils";

type Vue = "tous" | "a_payer";

/**
 * Historique des achats (US-ACH-02) et dettes fournisseurs (US-ACH-03) : filtres par
 * période et par fournisseur, fiche détaillée dans un panneau sans quitter la liste.
 */
export function HistoriqueAchats() {
  const { lire, modifier, page } = useParametresAdresse();
  const peutSaisir = usePeut("saisir_achat");
  const vue: Vue = lire("vue") === "a_payer" ? "a_payer" : "tous";
  const recherche = lire("recherche");
  const du = lire("du") || null;
  const au = lire("au") || null;
  const achatId = lire("achat") || null;

  const requete = useQuery({
    queryKey: [...CLE_ACHATS, "liste", { vue, recherche, du, au, page }],
    queryFn: ({ signal }) =>
      appelerApi<PageAchats>("achats", {
        parametres: { a_payer: vue === "a_payer" || null, recherche, du, au, page },
        signal,
      }),
    placeholderData: (precedent) => precedent,
  });
  const detail = useQuery({
    queryKey: [...CLE_ACHATS, achatId],
    queryFn: ({ signal }) => appelerApi<AchatDetail>(`achats/${achatId}`, { signal }),
    enabled: achatId !== null,
  });
  const filtre = vue === "a_payer" || recherche || du || au;

  return (
    <Page
      titre="Achats"
      description="Réceptions de marchandises et dettes fournisseurs."
      action={
        peutSaisir && (
          <Button asChild variant="principal">
            <Link href="/achats/nouveau">
              <Plus />
              Nouvel achat
            </Link>
          </Button>
        )
      }
    >
      <Onglets
        libelleAccessible="Achats à afficher"
        onglets={[
          { valeur: "tous", libelle: "Tous les achats" },
          { valeur: "a_payer", libelle: "À payer" },
        ]}
        actif={vue}
        onChange={(valeur) => modifier({ vue: valeur === "tous" ? null : valeur })}
      />
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full max-w-xs">
          <ChampRecherche
            libelle="Rechercher un achat"
            placeholder="N° d'achat, facture ou fournisseur"
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
            message={
              vue === "a_payer" && !recherche && !du && !au
                ? "Aucune dette fournisseur : tous les achats sont payés."
                : filtre
                  ? "Aucun achat pour ces critères."
                  : "Aucun achat enregistré pour l'instant."
            }
            action={
              !filtre &&
              peutSaisir && (
                <Button asChild>
                  <Link href="/achats/nouveau">Saisir le premier achat</Link>
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
                  <TableHead>Fournisseur</TableHead>
                  <TableHead className="hidden lg:table-cell">Règlement</TableHead>
                  <TableHead numerique>Montant FCFA</TableHead>
                  <TableHead numerique className="hidden md:table-cell">
                    Reste FCFA
                  </TableHead>
                  <TableHead>État</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donnees.items.map((achat) => {
                  const etat = etatPaiement(achat);
                  const annule = achat.statut === "ANNULE";
                  return (
                    <TableRow
                      key={achat.id}
                      className="cursor-pointer"
                      onClick={() => modifier({ achat: achat.id, page })}
                    >
                      <TableCell className="whitespace-nowrap text-texte-2">
                        {formaterDate(achat.date_achat)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        <button
                          type="button"
                          className={cn("text-left", annule && "line-through")}
                          onClick={(evenement) => {
                            evenement.stopPropagation();
                            modifier({ achat: achat.id, page });
                          }}
                        >
                          {achat.numero}
                        </button>
                        {achat.numero_facture_fournisseur && (
                          <span className="block text-xs text-texte-2">
                            {achat.numero_facture_fournisseur}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{achat.fournisseur ?? "—"}</TableCell>
                      <TableCell className="hidden text-texte-2 lg:table-cell">
                        {achat.comptes.length > 0 ? achat.comptes.join(", ") : "À crédit"}
                      </TableCell>
                      <TableCell numerique className={cn(annule && "text-texte-2")}>
                        {formaterMontantSeul(achat.montant_total)}
                      </TableCell>
                      <TableCell numerique className="hidden md:table-cell">
                        {annule || estNul(achat.reste_a_payer)
                          ? ""
                          : formaterMontantSeul(achat.reste_a_payer)}
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
        ouvert={achatId !== null}
        onOuvertChange={(ouvert) => !ouvert && modifier({ achat: null, page })}
        titre={detail.data ? `Achat ${detail.data.numero}` : "Achat"}
      >
        <EtatRequete requete={detail} chargement={<SqueletteFormulaire champs={5} />}>
          {(achat) => <DetailAchat achat={achat} />}
        </EtatRequete>
      </Panneau>
    </Page>
  );
}
