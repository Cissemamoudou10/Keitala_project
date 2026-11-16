"use client";

import { useQuery } from "@tanstack/react-query";

import { nomComplet } from "@/components/articles/types";
import { Page } from "@/components/coquille/page";
import { EtatRequete } from "@/components/etats/etat-requete";
import { EtatVide } from "@/components/etats/etat-vide";
import { SqueletteTableau } from "@/components/etats/squelettes";
import { SousNavigationPilotage } from "@/components/pilotage/sous-navigation-pilotage";
import { CLE_PILOTAGE } from "@/components/tableau-de-bord/tableau-de-bord";
import { FiltresDates } from "@/components/tresorerie/filtres";
import { Exports } from "@/components/ui/exports";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { appelerApi } from "@/lib/api";
import {
  formaterDate,
  formaterMontantSeul,
  formaterPourcentage,
  formaterQuantite,
} from "@/lib/formats";
import { useParametresAdresse } from "@/lib/parametres-adresse";
import { cn } from "@/lib/utils";

type Ligne = {
  article: { id: string; designation: string; contenance: string | null; unite_base: string };
  quantite_vendue: string;
  chiffre_affaires: string;
  cout_de_revient: string;
  marge: string;
  taux_marge: string | null;
};

type Rapport = {
  articles: Ligne[];
  chiffre_affaires: string;
  cout_de_revient: string;
  marge: string;
  taux_marge: string | null;
};

const negatif = (valeur: string) => valeur.startsWith("-");

/**
 * Marges par article (US-DASH-02) : chiffre d'affaires, coût de revient (coût moyen au
 * moment de chaque vente), marge brute en FCFA et en %. Dons et ventes annulées exclus.
 */
export function Marges() {
  const { lire, modifier } = useParametresAdresse();
  const du = lire("du");
  const au = lire("au");
  const requete = useQuery({
    queryKey: [...CLE_PILOTAGE, "marges", { du, au }],
    queryFn: ({ signal }) =>
      appelerApi<Rapport>("tableau-de-bord/marges", {
        parametres: { du: du || null, au: au || null },
        signal,
      }),
    placeholderData: (precedent) => precedent,
  });

  return (
    <Page
      titre="Tableau de bord"
      description="Marge brute par article vendu : les produits les plus rentables d'abord."
      action={<Exports fichier="marges" parametres={{ du, au }} />}
    >
      <SousNavigationPilotage />
      {/* À l'impression, les filtres disparaissent : la période reste écrite */}
      <p className="hidden print:block">
        Période : {du ? `du ${formaterDate(du)}` : "depuis le début"}
        {au ? ` au ${formaterDate(au)}` : " à aujourd'hui"}
      </p>
      <div className="flex flex-wrap items-end gap-4 print:hidden">
        <FiltresDates du={du} au={au} onChange={modifier} />
      </div>
      <EtatRequete
        requete={requete}
        chargement={<SqueletteTableau lignes={8} colonnes={6} />}
        estVide={(r) => r.articles.length === 0}
        vide={<EtatVide message="Aucune vente sur cette période." />}
      >
        {(r) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Article</TableHead>
                <TableHead numerique>Vendu</TableHead>
                <TableHead numerique>CA FCFA</TableHead>
                <TableHead numerique className="hidden md:table-cell">
                  Coût de revient
                </TableHead>
                <TableHead numerique>Marge FCFA</TableHead>
                <TableHead numerique>Marge</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.articles.map((m) => (
                <TableRow key={m.article.id}>
                  <TableCell>{nomComplet(m.article)}</TableCell>
                  <TableCell numerique>
                    {formaterQuantite(m.quantite_vendue, m.article.unite_base)}
                  </TableCell>
                  <TableCell numerique>{formaterMontantSeul(m.chiffre_affaires)}</TableCell>
                  <TableCell numerique className="hidden md:table-cell">
                    {formaterMontantSeul(m.cout_de_revient)}
                  </TableCell>
                  <TableCell numerique className={cn(negatif(m.marge) && "text-danger")}>
                    {formaterMontantSeul(m.marge)}
                  </TableCell>
                  <TableCell numerique className={cn(negatif(m.marge) && "text-danger")}>
                    {m.taux_marge === null ? "" : formaterPourcentage(m.taux_marge)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                <TableCell numerique />
                <TableCell numerique>{formaterMontantSeul(r.chiffre_affaires)}</TableCell>
                <TableCell numerique className="hidden md:table-cell">
                  {formaterMontantSeul(r.cout_de_revient)}
                </TableCell>
                <TableCell numerique>{formaterMontantSeul(r.marge)}</TableCell>
                <TableCell numerique>
                  {r.taux_marge === null ? "" : formaterPourcentage(r.taux_marge)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </EtatRequete>
    </Page>
  );
}
