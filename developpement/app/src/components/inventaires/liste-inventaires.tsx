"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { SousNavigationStocks } from "@/components/articles/sous-navigation-stocks";
import { Page } from "@/components/coquille/page";
import { EtatRequete } from "@/components/etats/etat-requete";
import { EtatVide } from "@/components/etats/etat-vide";
import { SqueletteTableau } from "@/components/etats/squelettes";
import {
  CLE_INVENTAIRES,
  type InventaireDetail,
  type PageInventaires,
} from "@/components/inventaires/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Champ } from "@/components/ui/champ";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Panneau } from "@/components/ui/panneau";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { appelerApi, ErreurApi } from "@/lib/api";
import { formaterDate } from "@/lib/formats";
import { FAMILLES, LIBELLES_FAMILLES, type Famille } from "@/lib/libelles";
import { useParametresAdresse } from "@/lib/parametres-adresse";
import { usePeut } from "@/lib/session";

const TOUTES = "toutes";

/** Inventaires physiques (US-STK-04) : liste et ouverture. */
export function ListeInventaires() {
  const saisirStock = usePeut("saisir_stock");
  const { modifier, page } = useParametresAdresse();
  const [ouverture, setOuverture] = React.useState(false);

  const requete = useQuery({
    queryKey: [...CLE_INVENTAIRES, { page }],
    queryFn: ({ signal }) =>
      appelerApi<PageInventaires>("stocks/inventaires", { parametres: { page }, signal }),
    placeholderData: (precedent) => precedent,
  });

  const nouvelInventaire = saisirStock && (
    <Button variant="principal" onClick={() => setOuverture(true)}>
      <Plus />
      Nouvel inventaire
    </Button>
  );

  return (
    <Page
      titre="Stocks"
      description="Comptages physiques : ils alignent le stock sur la réalité, et donnent le stock de départ."
      action={nouvelInventaire}
    >
      <SousNavigationStocks />
      <EtatRequete
        requete={requete}
        chargement={<SqueletteTableau lignes={4} colonnes={4} />}
        estVide={(donnees) => donnees.total === 0}
        vide={
          <EtatVide
            message="Aucun inventaire. Le premier sert à saisir le stock de départ."
            action={nouvelInventaire}
          />
        }
      >
        {(donnees) => (
          <div className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numéro</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Familles</TableHead>
                  <TableHead numerique>Écarts</TableHead>
                  <TableHead>
                    <span className="sr-only">État</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donnees.items.map((inventaire) => (
                  <TableRow key={inventaire.id}>
                    <TableCell>
                      <Link
                        href={`/stocks/inventaires/${inventaire.id}`}
                        className="font-medium tabular-nums"
                      >
                        {inventaire.numero}
                      </Link>
                    </TableCell>
                    <TableCell className="text-texte-2">
                      {formaterDate(inventaire.date_inventaire)}
                    </TableCell>
                    <TableCell>
                      {inventaire.famille ? LIBELLES_FAMILLES[inventaire.famille] : "Toutes"}
                    </TableCell>
                    <TableCell numerique>
                      {inventaire.nombre_ecarts} / {inventaire.nombre_lignes}
                    </TableCell>
                    <TableCell>
                      {inventaire.statut === "EN_COURS" && <Badge variant="info">En cours</Badge>}
                    </TableCell>
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
        ouvert={ouverture}
        onOuvertChange={setOuverture}
        titre="Nouvel inventaire"
        description="Le stock théorique est figé à l'ouverture."
      >
        {ouverture && <FormulaireOuverture />}
      </Panneau>
    </Page>
  );
}

function FormulaireOuverture() {
  const router = useRouter();
  const [famille, setFamille] = React.useState<Famille | typeof TOUTES>(TOUTES);
  const [observations, setObservations] = React.useState("");
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [enCours, setEnCours] = React.useState(false);

  const ouvrir = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const inventaire = await appelerApi<InventaireDetail>("stocks/inventaires", {
        methode: "POST",
        corps: {
          famille: famille === TOUTES ? null : famille,
          observations: observations.trim() || null,
        },
      });
      router.push(`/stocks/inventaires/${inventaire.id}`);
    } catch (cause) {
      setErreur(cause instanceof ErreurApi ? cause.message : "Une erreur inattendue est survenue.");
      setEnCours(false);
    }
  };

  return (
    <form onSubmit={ouvrir} noValidate className="flex flex-col gap-6">
      <Champ libelle="Articles à compter">
        {(controle) => (
          <Select value={famille} onValueChange={(v) => setFamille(v as Famille)}>
            <SelectTrigger {...controle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TOUTES}>Toutes les familles</SelectItem>
              {FAMILLES.map((f) => (
                <SelectItem key={f} value={f}>
                  {LIBELLES_FAMILLES[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Champ>
      <Champ libelle="Observations" facultatif aide="Ex. stock de départ, comptage de fin de mois.">
        {(controle) => (
          <Input
            autoComplete="off"
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            {...controle}
          />
        )}
      </Champ>
      {erreur && (
        <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
          {erreur}
        </p>
      )}
      <div>
        <Button type="submit" variant="principal" enCours={enCours} libelleEnCours="Ouverture…">
          Ouvrir l&apos;inventaire
        </Button>
      </div>
    </form>
  );
}
