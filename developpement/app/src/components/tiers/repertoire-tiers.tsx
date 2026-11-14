"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Page } from "@/components/coquille/page";
import { EtatRequete } from "@/components/etats/etat-requete";
import { EtatVide } from "@/components/etats/etat-vide";
import { SqueletteTableau } from "@/components/etats/squelettes";
import {
  CLE_TIERS,
  FormulaireTiers,
  libelleType,
  Soldes,
  type Tiers,
} from "@/components/tiers/formulaire-tiers";
import { Button } from "@/components/ui/button";
import { ChampRecherche } from "@/components/ui/champ-recherche";
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
import { formaterMontant, formaterTelephone } from "@/lib/formats";
import { notifier } from "@/lib/notifications";
import { useParametresAdresse } from "@/lib/parametres-adresse";
import { usePeut } from "@/lib/session";

type TypeFiltre = "client" | "fournisseur";
type PageTiers = {
  items: Tiers[];
  total: number;
  page: number;
  taille: number;
  pages_total: number;
};
type Edition = { mode: "creation" } | { mode: "fiche"; tiers: Tiers };

const estNul = (montant: string) => /^0+(\.0+)?$/.test(montant);

/** Répertoire des clients et fournisseurs (US-REF-01). */
export function RepertoireTiers() {
  const ecrire = usePeut("ecrire");
  const clientRequetes = useQueryClient();
  const { lire, modifier, page } = useParametresAdresse();
  const type = (
    ["client", "fournisseur"].includes(lire("type")) ? lire("type") : null
  ) as TypeFiltre | null;
  const recherche = lire("recherche");
  const [edition, setEdition] = React.useState<Edition | null>(null);

  const requete = useQuery({
    queryKey: [...CLE_TIERS, { type, recherche, page }],
    queryFn: ({ signal }) =>
      appelerApi<PageTiers>("tiers", { parametres: { type, recherche, page }, signal }),
    placeholderData: (precedent) => precedent,
  });

  const ouvrirFiche = async (id: string) => {
    try {
      const tiers = await clientRequetes.fetchQuery({
        queryKey: [...CLE_TIERS, id],
        queryFn: () => appelerApi<Tiers>(`tiers/${id}`),
      });
      setEdition({ mode: "fiche", tiers });
    } catch {
      notifier.erreur("La fiche n'a pas pu être ouverte. Réessayez.");
    }
  };

  const ajouter = ecrire && (
    <Button variant="principal" onClick={() => setEdition({ mode: "creation" })}>
      <Plus />
      {type === "fournisseur"
        ? "Nouveau fournisseur"
        : type === "client"
          ? "Nouveau client"
          : "Nouveau client ou fournisseur"}
    </Button>
  );

  return (
    <Page
      titre="Clients et fournisseurs"
      description="Coordonnées, et ce qui reste à payer de part et d'autre."
      action={ajouter}
    >
      <div className="flex flex-col gap-4">
        <Onglets
          libelleAccessible="Type de tiers"
          actif={type ?? "tous"}
          onChange={(valeur) => modifier({ type: valeur === "tous" ? null : valeur })}
          onglets={[
            { valeur: "tous" as const, libelle: "Tous" },
            { valeur: "client" as const, libelle: "Clients" },
            { valeur: "fournisseur" as const, libelle: "Fournisseurs" },
          ]}
        />
        <ChampRecherche
          libelle="Chercher (nom ou téléphone)"
          valeur={recherche}
          onChange={(valeur) => modifier({ recherche: valeur })}
        />
      </div>

      <EtatRequete
        requete={requete}
        chargement={<SqueletteTableau lignes={6} colonnes={4} />}
        estVide={(donnees) => donnees.total === 0}
        vide={
          <EtatVide
            message={
              recherche
                ? `Personne ne correspond à « ${recherche} ».`
                : type === "fournisseur"
                  ? "Aucun fournisseur enregistré."
                  : type === "client"
                    ? "Aucun client enregistré."
                    : "Aucun client ni fournisseur enregistré."
            }
            action={recherche ? undefined : ajouter}
          />
        }
      >
        {(donnees) => (
          <div className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead className="hidden md:table-cell">Téléphone</TableHead>
                  {!type && <TableHead className="hidden lg:table-cell">Type</TableHead>}
                  {type !== "fournisseur" && <TableHead numerique>Créance</TableHead>}
                  {type !== "client" && <TableHead numerique>Dette</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {donnees.items.map((tiers) => (
                  <TableRow
                    key={tiers.id}
                    className="cursor-pointer"
                    onClick={() => setEdition({ mode: "fiche", tiers })}
                  >
                    <TableCell>
                      <button
                        type="button"
                        className="text-left font-medium"
                        onClick={(evenement) => {
                          evenement.stopPropagation();
                          setEdition({ mode: "fiche", tiers });
                        }}
                      >
                        {tiers.nom}
                      </button>
                    </TableCell>
                    <TableCell className="hidden text-texte-2 tabular-nums md:table-cell">
                      {tiers.telephone ? formaterTelephone(tiers.telephone) : ""}
                    </TableCell>
                    {!type && (
                      <TableCell className="hidden text-texte-2 lg:table-cell">
                        {libelleType(tiers)}
                      </TableCell>
                    )}
                    {/* On n'affiche que l'exception : un montant en attente (charte, principe 8) */}
                    {type !== "fournisseur" && (
                      <TableCell numerique>
                        {estNul(tiers.solde_creance) ? "" : formaterMontant(tiers.solde_creance)}
                      </TableCell>
                    )}
                    {type !== "client" && (
                      <TableCell numerique>
                        {estNul(tiers.solde_dette) ? "" : formaterMontant(tiers.solde_dette)}
                      </TableCell>
                    )}
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

      <Panneau
        ouvert={edition !== null}
        onOuvertChange={(ouvert) => !ouvert && setEdition(null)}
        titre={edition?.mode === "fiche" ? edition.tiers.nom : "Nouveau client ou fournisseur"}
        description={edition?.mode === "fiche" ? libelleType(edition.tiers) : undefined}
      >
        {edition?.mode === "creation" && (
          <FormulaireTiers
            typeParDefaut={type}
            onOuvrir={ouvrirFiche}
            onTermine={() => setEdition(null)}
          />
        )}
        {edition?.mode === "fiche" &&
          (ecrire ? (
            <FormulaireTiers
              key={edition.tiers.id}
              tiers={edition.tiers}
              typeParDefaut={type}
              onOuvrir={ouvrirFiche}
              onTermine={() => setEdition(null)}
            />
          ) : (
            <FicheTiers tiers={edition.tiers} />
          ))}
      </Panneau>
    </Page>
  );
}

/** Fiche en lecture seule (Consultant). */
function FicheTiers({ tiers }: { tiers: Tiers }) {
  const lignes: [string, string][] = [
    ["Téléphone", tiers.telephone ? formaterTelephone(tiers.telephone) : "Non renseigné"],
    ["Adresse", tiers.adresse ?? "Non renseignée"],
  ];
  return (
    <div className="flex flex-col gap-8">
      <Soldes tiers={tiers} />
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3">
        {lignes.map(([terme, valeur]) => (
          <React.Fragment key={terme}>
            <dt className="text-texte-2">{terme}</dt>
            <dd>{valeur}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}
