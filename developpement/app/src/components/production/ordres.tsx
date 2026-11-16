"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { nomComplet, type Article } from "@/components/articles/types";
import { Page } from "@/components/coquille/page";
import { EtatRequete } from "@/components/etats/etat-requete";
import { EtatVide } from "@/components/etats/etat-vide";
import { SqueletteTableau } from "@/components/etats/squelettes";
import { useRecettes } from "@/components/production/recettes";
import { SousNavigationProduction } from "@/components/production/sous-navigation-production";
import {
  CLE_PRODUCTION,
  ETATS_OF,
  LIBELLES_TYPE_OF,
  type OrdreDetail,
  type PageOrdres,
  type StatutOf,
} from "@/components/production/types";
import { ChampQuantite } from "@/components/saisie/champ-quantite";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Champ } from "@/components/ui/champ";
import { Input } from "@/components/ui/input";
import { Onglets } from "@/components/ui/onglets";
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
import { diviserDecimaux, estInferieur, multiplierDecimaux } from "@/lib/decimal";
import { formaterDate, formaterQuantite } from "@/lib/formats";
import { notifier } from "@/lib/notifications";
import { useParametresAdresse } from "@/lib/parametres-adresse";
import { usePeut } from "@/lib/session";

type Vue = "en_cours" | "termines" | "tous";
const STATUTS: Record<Vue, StatutOf | null> = {
  en_cours: "EN_COURS",
  termines: "TERMINE",
  tous: null,
};

/** Ordres de fabrication (US-PROD-02) : en cours d'abord, lancement en un panneau. */
export function Ordres() {
  const { lire, modifier, page } = useParametresAdresse();
  const peutPiloter = usePeut("piloter_production");
  const vue: Vue = (["termines", "tous"] as const).find((v) => v === lire("vue")) ?? "en_cours";
  const [lancement, setLancement] = React.useState(false);

  const requete = useQuery({
    queryKey: [...CLE_PRODUCTION, "ordres", { vue, page }],
    queryFn: ({ signal }) =>
      appelerApi<PageOrdres>("production/ordres", {
        parametres: { statut: STATUTS[vue], page },
        signal,
      }),
    placeholderData: (precedent) => precedent,
  });

  return (
    <Page
      titre="Production"
      description="Ordres de fabrication : transformation, puis conditionnement."
      action={
        peutPiloter && (
          <Button variant="principal" onClick={() => setLancement(true)}>
            <Plus />
            Nouvel ordre
          </Button>
        )
      }
    >
      <SousNavigationProduction />
      <Onglets
        libelleAccessible="Ordres à afficher"
        onglets={[
          { valeur: "en_cours", libelle: "En cours" },
          { valeur: "termines", libelle: "Terminés" },
          { valeur: "tous", libelle: "Tous" },
        ]}
        actif={vue}
        onChange={(valeur) => modifier({ vue: valeur === "en_cours" ? null : valeur })}
      />
      <EtatRequete
        requete={requete}
        chargement={<SqueletteTableau lignes={6} colonnes={6} />}
        estVide={(donnees) => donnees.total === 0}
        vide={
          <EtatVide
            message={
              vue === "en_cours"
                ? "Aucun ordre en cours."
                : vue === "termines"
                  ? "Aucun ordre terminé."
                  : "Aucun ordre de fabrication."
            }
          />
        }
      >
        {(donnees) => (
          <div className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Recette</TableHead>
                  <TableHead className="hidden md:table-cell">Étape</TableHead>
                  <TableHead numerique>Prévu</TableHead>
                  <TableHead numerique className="hidden md:table-cell">
                    Produit
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">Lancé le</TableHead>
                  <TableHead>État</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donnees.items.map((ordre) => {
                  const etat = ETATS_OF[ordre.statut];
                  return (
                    <TableRow key={ordre.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        <Link
                          href={`/production/ordres/${ordre.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {ordre.numero}
                        </Link>
                      </TableCell>
                      <TableCell>{ordre.recette}</TableCell>
                      <TableCell className="hidden text-texte-2 md:table-cell">
                        {LIBELLES_TYPE_OF[ordre.type_of]}
                      </TableCell>
                      <TableCell numerique>
                        {formaterQuantite(ordre.quantite_prevue, ordre.produit.unite_base)}
                      </TableCell>
                      <TableCell numerique className="hidden md:table-cell">
                        {formaterQuantite(ordre.quantite_produite, ordre.produit.unite_base)}
                      </TableCell>
                      <TableCell className="hidden text-texte-2 lg:table-cell">
                        {ordre.date_lancement ? formaterDate(ordre.date_lancement) : ""}
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
        ouvert={lancement}
        onOuvertChange={setLancement}
        titre="Nouvel ordre de fabrication"
        description="Les besoins sont calculés d'après la recette ; rien ne sort du stock avant la clôture."
      >
        {lancement && <FormulaireLancement />}
      </Panneau>
    </Page>
  );
}

function FormulaireLancement() {
  const router = useRouter();
  const clientRequetes = useQueryClient();
  const recettes = useRecettes();
  const [recetteId, setRecetteId] = React.useState<string | null>(null);
  const [quantite, setQuantite] = React.useState("");
  const [observations, setObservations] = React.useState("");
  const [erreurs, setErreurs] = React.useState<{
    recette?: string;
    quantite?: string;
    general?: string;
  }>({});
  const [enCours, setEnCours] = React.useState(false);

  const recette = recettes.data?.find((r) => r.id === recetteId);
  // Stock du moment de chaque composant, pour signaler un manque avant de lancer
  const stocks = useQueries({
    queries: (recette?.composants ?? []).map((c) => ({
      queryKey: ["articles", c.article.id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        appelerApi<Article>(`articles/${c.article.id}`, { signal }),
    })),
  });
  const quantiteValide = /^\d+([.,]\d{1,3})?$/.test(quantite) && !/^0+([.,]0*)?$/.test(quantite);
  const besoins =
    recette && quantiteValide
      ? recette.composants.map((c, index) => {
          // Besoin = quantité de la recette × quantité visée ÷ quantité de base
          const parUnite = multiplierDecimaux(c.quantite, quantite.replace(",", "."), 6) ?? "0";
          const besoin = diviserDecimaux(parUnite, recette.quantite_base_produite, 3) ?? "0";
          const stock = stocks[index]?.data;
          const manque =
            stock && !stock.autoriser_stock_negatif && estInferieur(stock.stock_actuel, besoin)
              ? stock.stock_actuel
              : null;
          return { composant: c, besoin, manque };
        })
      : [];

  const envoyer = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    const nouvelles: typeof erreurs = {};
    if (!recette) nouvelles.recette = "Choisissez la recette.";
    if (!quantiteValide) nouvelles.quantite = "Saisissez la quantité visée.";
    setErreurs(nouvelles);
    if (Object.keys(nouvelles).length > 0) return;
    setEnCours(true);
    try {
      const ordre = await appelerApi<OrdreDetail>("production/ordres", {
        methode: "POST",
        corps: {
          recette_id: recetteId,
          quantite_prevue: quantite.replace(",", "."),
          observations: observations.trim() || null,
        },
      });
      await clientRequetes.invalidateQueries({ queryKey: CLE_PRODUCTION });
      notifier.succes(`Ordre ${ordre.numero} lancé`);
      router.push(`/production/ordres/${ordre.id}`);
    } catch (cause) {
      setErreurs({
        general: cause instanceof ErreurApi ? cause.message : "Une erreur inattendue est survenue.",
      });
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form onSubmit={envoyer} noValidate className="flex flex-col gap-5">
      <Champ libelle="Recette" erreur={erreurs.recette}>
        {(controle) => (
          <Select value={recetteId ?? ""} onValueChange={setRecetteId}>
            <SelectTrigger {...controle}>
              <SelectValue placeholder="Choisir la recette" />
            </SelectTrigger>
            <SelectContent>
              {(recettes.data ?? []).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nom_recette} ({LIBELLES_TYPE_OF[r.type_of].toLowerCase()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Champ>
      <Champ
        libelle={recette ? `Quantité visée de ${nomComplet(recette.produit)}` : "Quantité visée"}
        erreur={erreurs.quantite}
      >
        {(controle) => (
          <div className="flex items-center gap-2">
            <ChampQuantite
              {...controle}
              quantite={quantite}
              onQuantiteChange={setQuantite}
              uniteId={null}
              onUniteChange={() => {}}
              uniteBase={recette?.produit.unite_base ?? ""}
              unites={[]}
            />
            <span className="text-texte-2">{recette?.produit.unite_base}</span>
          </div>
        )}
      </Champ>
      {besoins.length > 0 && (
        <section
          aria-label="Besoins prévus"
          className="flex flex-col gap-2 rounded-md bg-fond-doux p-4"
        >
          <h3 className="font-medium">Besoins prévus</h3>
          {besoins.map(({ composant, besoin, manque }) => (
            <p key={composant.article.id} className="flex flex-col tabular-nums">
              <span className="flex justify-between gap-4">
                <span>{nomComplet(composant.article)}</span>
                <span>{formaterQuantite(besoin, composant.article.unite_base)}</span>
              </span>
              {manque !== null && (
                <span className="text-xs text-danger">
                  Il n&apos;en reste que {formaterQuantite(manque, composant.article.unite_base)} :
                  l&apos;ordre peut être lancé, mais la clôture demandera ce qui sera consommé.
                </span>
              )}
            </p>
          ))}
        </section>
      )}
      <Champ libelle="Observations" facultatif>
        {(controle) => (
          <Input
            {...controle}
            autoComplete="off"
            maxLength={2000}
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
          />
        )}
      </Champ>
      {erreurs.general && (
        <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
          {erreurs.general}
        </p>
      )}
      <div>
        <Button type="submit" variant="principal" enCours={enCours} libelleEnCours="Lancement…">
          Lancer l&apos;ordre
        </Button>
      </div>
    </form>
  );
}
