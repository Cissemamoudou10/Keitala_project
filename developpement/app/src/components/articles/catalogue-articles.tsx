"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { History, Plus } from "lucide-react";

import { EditeurUnites } from "@/components/articles/editeur-unites";
import { FormulaireArticle } from "@/components/articles/formulaire-article";
import { FormulairePerte } from "@/components/articles/formulaire-perte";
import { SousNavigationStocks } from "@/components/articles/sous-navigation-stocks";
import {
  CLE_ARTICLES,
  nomComplet,
  type Article,
  type PageArticles,
} from "@/components/articles/types";
import { Page } from "@/components/coquille/page";
import { Exports } from "@/components/ui/exports";
import { EtatRequete } from "@/components/etats/etat-requete";
import { EtatVide } from "@/components/etats/etat-vide";
import { SqueletteTableau } from "@/components/etats/squelettes";
import { Badge } from "@/components/ui/badge";
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
import { formaterMontant, formaterQuantite } from "@/lib/formats";
import { FAMILLES, LIBELLES_FAMILLES, type Famille } from "@/lib/libelles";
import { useParametresAdresse } from "@/lib/parametres-adresse";
import { usePeut } from "@/lib/session";

type Edition = { mode: "creation" } | { mode: "fiche"; article: Article };

type EtatGlobal = {
  familles: {
    famille: Famille;
    nombre_articles: number;
    valeur: string;
    nombre_sous_seuil: number;
  }[];
  valeur_totale: string;
  nombre_sous_seuil: number;
};

/**
 * État des stocks (US-STK-02, US-STK-03) et catalogue des articles (US-STK-01, US-REF-02) :
 * onglets par famille, recherche, filtre « Sous le seuil » ; quantité, coût moyen, valeur.
 */
export function CatalogueArticles() {
  const ecrire = usePeut("ecrire");
  const saisirStock = usePeut("saisir_stock");
  const { lire, modifier, page } = useParametresAdresse();
  const famille = (FAMILLES as string[]).includes(lire("famille"))
    ? (lire("famille") as Famille)
    : null;
  const recherche = lire("recherche");
  const sousSeuil = lire("sous_seuil") === "1";
  const [edition, setEdition] = React.useState<Edition | null>(null);

  const familles = useQuery({
    queryKey: [...CLE_ARTICLES, "familles"],
    queryFn: ({ signal }) => appelerApi<Record<Famille, number>>("articles/familles", { signal }),
  });
  const etat = useQuery({
    queryKey: [...CLE_ARTICLES, "etat-global"],
    queryFn: ({ signal }) => appelerApi<EtatGlobal>("stocks/etat-global", { signal }),
  });
  const requete = useQuery({
    queryKey: [...CLE_ARTICLES, { famille, recherche, sousSeuil, page }],
    queryFn: ({ signal }) =>
      appelerApi<PageArticles>("articles", {
        parametres: { famille, recherche, sous_seuil: sousSeuil || null, page },
        signal,
      }),
    placeholderData: (precedent) => precedent,
  });

  const total = familles.data ? Object.values(familles.data).reduce((a, b) => a + b, 0) : undefined;
  const nouvelArticle = ecrire && (
    <Button variant="principal" onClick={() => setEdition({ mode: "creation" })}>
      <Plus />
      Nouvel article
    </Button>
  );

  return (
    <Page
      titre="Stocks"
      description="Ce qui est en stock, ce que cela vaut, et ce qui manque."
      action={
        <div className="flex flex-wrap gap-2">
          <Exports fichier="stocks" parametres={{ famille }} />
          {nouvelArticle}
        </div>
      }
    >
      <SousNavigationStocks />
      {etat.data && (
        <p className="flex flex-wrap gap-x-6 gap-y-1 text-texte-2">
          <span>
            Valeur du stock :{" "}
            <span className="font-semibold text-texte tabular-nums">
              {formaterMontant(etat.data.valeur_totale)}
            </span>
          </span>
          {etat.data.nombre_sous_seuil > 0 && (
            <span>
              <span className="font-semibold text-danger tabular-nums">
                {etat.data.nombre_sous_seuil}
              </span>{" "}
              {etat.data.nombre_sous_seuil > 1 ? "articles sous le seuil" : "article sous le seuil"}
            </span>
          )}
        </p>
      )}
      <div className="flex flex-col gap-4">
        <Onglets
          libelleAccessible="Famille d'articles"
          actif={famille ?? "TOUTES"}
          onChange={(valeur) => modifier({ famille: valeur === "TOUTES" ? null : valeur })}
          onglets={[
            { valeur: "TOUTES" as const, libelle: "Toutes", nombre: total },
            ...FAMILLES.map((f) => ({
              valeur: f,
              libelle: LIBELLES_FAMILLES[f],
              nombre: familles.data?.[f],
            })),
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <ChampRecherche
            libelle="Chercher un article (nom ou code)"
            valeur={recherche}
            onChange={(valeur) => modifier({ recherche: valeur })}
          />
          <Button
            variant="discret"
            aria-pressed={sousSeuil}
            className="aria-pressed:bg-fond-actif"
            onClick={() => modifier({ sous_seuil: sousSeuil ? null : "1" })}
          >
            Sous le seuil
          </Button>
        </div>
      </div>

      <EtatRequete
        requete={requete}
        chargement={<SqueletteTableau lignes={8} colonnes={4} />}
        estVide={(donnees) => donnees.total === 0}
        vide={
          <EtatVide
            message={
              sousSeuil
                ? "Aucun article sous le seuil : les stocks sont suffisants."
                : recherche
                  ? `Aucun article ne correspond à « ${recherche} ».`
                  : famille
                    ? `Aucun article dans « ${LIBELLES_FAMILLES[famille]} ».`
                    : "Le catalogue est vide."
            }
            action={recherche || sousSeuil ? undefined : nouvelArticle}
          />
        }
      >
        {(donnees) => (
          <div className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Article</TableHead>
                  {!famille && <TableHead className="hidden lg:table-cell">Famille</TableHead>}
                  <TableHead numerique>Stock</TableHead>
                  <TableHead numerique className="hidden md:table-cell">
                    Seuil
                  </TableHead>
                  <TableHead numerique className="hidden lg:table-cell">
                    Coût moyen
                  </TableHead>
                  <TableHead numerique>Valeur</TableHead>
                  <TableHead>
                    <span className="sr-only">État</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donnees.items.map((article) => (
                  <TableRow
                    key={article.id}
                    className="cursor-pointer"
                    onClick={() => setEdition({ mode: "fiche", article })}
                  >
                    <TableCell>
                      <button
                        type="button"
                        className="flex flex-col text-left"
                        onClick={(evenement) => {
                          evenement.stopPropagation();
                          setEdition({ mode: "fiche", article });
                        }}
                      >
                        <span className="font-medium">{nomComplet(article)}</span>
                        <span className="text-xs text-texte-2 tabular-nums">
                          {article.code_sku}
                        </span>
                      </button>
                    </TableCell>
                    {!famille && (
                      <TableCell className="hidden text-texte-2 lg:table-cell">
                        {LIBELLES_FAMILLES[article.famille]}
                      </TableCell>
                    )}
                    <TableCell numerique>
                      {formaterQuantite(article.stock_actuel, article.unite_base)}
                    </TableCell>
                    <TableCell numerique className="hidden text-texte-2 md:table-cell">
                      {formaterQuantite(article.stock_minimum, article.unite_base)}
                    </TableCell>
                    <TableCell numerique className="hidden text-texte-2 lg:table-cell">
                      {formaterMontant(article.cout_moyen)}
                    </TableCell>
                    <TableCell numerique>{formaterMontant(article.valeur_stock)}</TableCell>
                    <TableCell>
                      {/* On ne signale que l'exception (charte, principe 8) */}
                      {article.en_alerte && <Badge variant="danger">Stock bas</Badge>}
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
        ouvert={edition !== null}
        onOuvertChange={(ouvert) => !ouvert && setEdition(null)}
        titre={edition?.mode === "fiche" ? nomComplet(edition.article) : "Nouvel article"}
        description={edition?.mode === "fiche" ? edition.article.code_sku : undefined}
      >
        {edition?.mode === "creation" && (
          <FormulaireArticle
            familleParDefaut={famille ?? "PRODUIT_FINI"}
            // Après la création, on reste sur la fiche pour déclarer les unités de saisie
            onTermine={(article) => setEdition({ mode: "fiche", article })}
          />
        )}
        {edition?.mode === "fiche" &&
          (ecrire ? (
            <div key={edition.article.id} className="flex flex-col gap-8">
              <FormulaireArticle
                article={edition.article}
                familleParDefaut={edition.article.famille}
                onTermine={() => setEdition(null)}
              />
              <EditeurUnites
                article={edition.article}
                modifiable
                onEnregistre={(article) => setEdition({ mode: "fiche", article })}
              />
              {saisirStock && (
                <section className="flex flex-col gap-4 border-t border-bordure pt-6">
                  <h3 className="font-semibold">Déclarer une perte</h3>
                  <FormulairePerte article={edition.article} onTermine={() => setEdition(null)} />
                </section>
              )}
              <LienMouvements article={edition.article} />
            </div>
          ) : (
            <FicheArticle article={edition.article} />
          ))}
      </Panneau>
    </Page>
  );
}

/** Fiche en lecture seule (Consultant, US-AUTH-03 : aucune action). */
function FicheArticle({ article }: { article: Article }) {
  const lignes: [string, string][] = [
    ["Famille", LIBELLES_FAMILLES[article.famille]],
    ["Unité de base", article.unite_base],
    ["Stock", formaterQuantite(article.stock_actuel, article.unite_base)],
    ["Seuil d'alerte", formaterQuantite(article.stock_minimum, article.unite_base)],
    ["Prix de vente", formaterMontant(article.prix_vente_standard)],
    ["Coût moyen", formaterMontant(article.cout_moyen)],
  ];
  return (
    <div className="flex flex-col gap-8">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 tabular-nums">
        {lignes.map(([terme, valeur]) => (
          <React.Fragment key={terme}>
            <dt className="text-texte-2">{terme}</dt>
            <dd>{valeur}</dd>
          </React.Fragment>
        ))}
      </dl>
      <EditeurUnites article={article} modifiable={false} onEnregistre={() => undefined} />
      <LienMouvements article={article} />
    </div>
  );
}

function LienMouvements({ article }: { article: Article }) {
  return (
    <div className="border-t border-bordure pt-6">
      <Button variant="discret" asChild>
        <Link href={`/stocks/mouvements?article=${article.id}`}>
          <History />
          Voir les mouvements de cet article
        </Link>
      </Button>
    </div>
  );
}
