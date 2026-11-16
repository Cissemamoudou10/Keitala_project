"use client";

import { useQuery } from "@tanstack/react-query";

import { Page } from "@/components/coquille/page";
import { Exports } from "@/components/ui/exports";
import { EtatRequete } from "@/components/etats/etat-requete";
import { EtatVide } from "@/components/etats/etat-vide";
import { SqueletteTableau } from "@/components/etats/squelettes";
import { FiltreCompte, FiltresDates } from "@/components/tresorerie/filtres";
import { SousNavigationTresorerie } from "@/components/tresorerie/sous-navigation-tresorerie";
import { CLE_TRESORERIE, type PageEcritures } from "@/components/tresorerie/types";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { appelerApi } from "@/lib/api";
import { formaterDateHeure, formaterDateRelative, formaterMontantSeul } from "@/lib/formats";
import { LIBELLES_FLUX } from "@/lib/libelles";
import { useParametresAdresse } from "@/lib/parametres-adresse";

/** Journal des entrées et sorties de chaque compte, avec la pièce d'origine (US-TRES-01). */
export function JournalTresorerie() {
  const { lire, modifier, page } = useParametresAdresse();
  const compte = lire("compte");
  const du = lire("du");
  const au = lire("au");

  const requete = useQuery({
    queryKey: [...CLE_TRESORERIE, "journal", { compte, du, au, page }],
    queryFn: ({ signal }) =>
      appelerApi<PageEcritures>("tresorerie/journal", {
        parametres: { compte_id: compte || null, du: du || null, au: au || null, page },
        signal,
      }),
    placeholderData: (precedent) => precedent,
  });

  return (
    <Page
      titre="Trésorerie"
      description="Chaque entrée et chaque sortie d'argent, avec sa pièce."
      action={<Exports fichier="journal" parametres={{ compte_id: compte, du, au }} />}
    >
      <SousNavigationTresorerie />
      <div className="flex flex-wrap items-end gap-4">
        <FiltreCompte valeur={compte} onChange={(valeur) => modifier({ compte: valeur })} />
        <FiltresDates du={du} au={au} onChange={modifier} />
      </div>
      <EtatRequete
        requete={requete}
        chargement={<SqueletteTableau lignes={8} colonnes={6} />}
        estVide={(donnees) => donnees.total === 0}
        vide={
          <EtatVide
            message={
              compte || du || au
                ? "Aucune écriture pour ces critères."
                : "Aucune écriture pour l'instant : elles apparaîtront avec les ventes, les achats et les dépenses."
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
                  {!compte && <TableHead>Compte</TableHead>}
                  <TableHead>Opération</TableHead>
                  <TableHead numerique>Entrée FCFA</TableHead>
                  <TableHead numerique>Sortie FCFA</TableHead>
                  <TableHead numerique className="hidden md:table-cell">
                    Solde après
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">Auteur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donnees.items.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-texte-2">
                      <span title={formaterDateHeure(e.date_transaction)}>
                        {formaterDateRelative(e.date_transaction)}
                      </span>
                    </TableCell>
                    {!compte && <TableCell>{e.compte}</TableCell>}
                    <TableCell>
                      <span className="flex flex-col">
                        <span>{e.libelle}</span>
                        <span className="text-xs text-texte-2">
                          {LIBELLES_FLUX[e.type_flux]}
                          {e.piece && ` · ${e.piece}`}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell numerique>
                      {e.sens === "CREDIT" ? `+ ${formaterMontantSeul(e.montant)}` : ""}
                    </TableCell>
                    <TableCell numerique>
                      {e.sens === "DEBIT" ? `− ${formaterMontantSeul(e.montant)}` : ""}
                    </TableCell>
                    <TableCell numerique className="hidden md:table-cell">
                      {formaterMontantSeul(e.solde_apres)}
                    </TableCell>
                    <TableCell className="hidden text-texte-2 lg:table-cell">{e.auteur}</TableCell>
                  </TableRow>
                ))}
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
    </Page>
  );
}
