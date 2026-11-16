"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { nomComplet } from "@/components/articles/types";
import { Page } from "@/components/coquille/page";
import { CLE_CONTROLES, type NombreAControler } from "@/components/controles/pieces-a-controler";
import { EtatRequete } from "@/components/etats/etat-requete";
import { SqueletteChiffresCles } from "@/components/etats/squelettes";
import { GraphiqueVentes } from "@/components/pilotage/graphique-ventes";
import { SousNavigationPilotage } from "@/components/pilotage/sous-navigation-pilotage";
import { Badge } from "@/components/ui/badge";
import { appelerApi } from "@/lib/api";
import { formaterDate, formaterMontant, formaterQuantite } from "@/lib/formats";
import { usePeut } from "@/lib/session";
import { cn } from "@/lib/utils";

type ArticleResume = {
  id: string;
  code_sku: string;
  designation: string;
  contenance: string | null;
  unite_base: string;
};

export type Indicateurs = {
  ca_jour: string;
  ca_mois: string;
  valeur_stock: string;
  solde_global: string;
  comptes: { id: number; nom: string; type: string; solde: string }[];
  total_creances: string;
  total_dettes: string;
  articles_sous_seuil: number;
  ordres_en_cours: number;
  ventes_30_jours: { date: string; montant: string }[];
  stocks_bas: { article: ArticleResume; stock_actuel: string; stock_minimum: string }[];
  impayes_anciens: {
    id: string;
    numero: string;
    client: string | null;
    date_vente: string;
    reste_a_payer: string;
  }[];
};

export const CLE_PILOTAGE = ["pilotage"] as const;

function ChiffreCle({
  libelle,
  valeur,
  href,
  alerte,
}: {
  libelle: string;
  valeur: string;
  href?: string;
  alerte?: string;
}) {
  const contenu = (
    <>
      <h2 className="text-texte-2">{libelle}</h2>
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-chiffre-cle font-semibold tabular-nums">{valeur}</span>
        {alerte && <Badge variant="danger">{alerte}</Badge>}
      </p>
    </>
  );
  const classes = "flex flex-col gap-2 rounded-md border border-bordure p-4";
  return href ? (
    <Link href={href} className={cn(classes, "transition-colors hover:bg-fond-survol")}>
      {contenu}
    </Link>
  ) : (
    <article className={classes}>{contenu}</article>
  );
}

/**
 * Tableau de bord (US-DASH-01, charte section 11) : six chiffres clés, les soldes, un
 * graphique (ventes sur 30 jours, un seul ton), puis les listes courtes « À traiter ».
 */
export function TableauDeBord() {
  const controler = usePeut("controler");
  const requete = useQuery({
    queryKey: [...CLE_PILOTAGE, "indicateurs"],
    queryFn: ({ signal }) => appelerApi<Indicateurs>("tableau-de-bord/indicateurs", { signal }),
  });
  const aControler = useQuery({
    queryKey: [...CLE_CONTROLES, "nombre"],
    queryFn: ({ signal }) => appelerApi<NombreAControler>("controles/nombre", { signal }),
    enabled: controler,
  });

  return (
    <Page titre="Tableau de bord" description="L'essentiel du jour, en un coup d'œil.">
      <SousNavigationPilotage />
      <EtatRequete requete={requete} chargement={<SqueletteChiffresCles nombre={6} />}>
        {(d) => (
          <div className="flex flex-col gap-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ChiffreCle
                libelle="Ventes du jour"
                valeur={formaterMontant(d.ca_jour)}
                href="/ventes"
              />
              <ChiffreCle libelle="Ventes du mois" valeur={formaterMontant(d.ca_mois)} />
              <ChiffreCle
                libelle="Trésorerie"
                valeur={formaterMontant(d.solde_global)}
                href="/tresorerie"
              />
              <ChiffreCle
                libelle="Créances clients"
                valeur={formaterMontant(d.total_creances)}
                href="/ventes?vue=a_encaisser"
              />
              <ChiffreCle
                libelle="Valeur du stock"
                valeur={formaterMontant(d.valeur_stock)}
                href="/stocks"
              />
              <ChiffreCle
                libelle="Articles sous le seuil"
                valeur={String(d.articles_sous_seuil)}
                href="/stocks?sous_seuil=1"
                alerte={d.articles_sous_seuil > 0 ? "À réapprovisionner" : undefined}
              />
            </div>

            <dl className="grid gap-x-8 gap-y-2 rounded-md bg-fond-doux p-4 sm:grid-cols-2 lg:grid-cols-3">
              {d.comptes.map((c) => (
                <div key={c.id} className="flex justify-between gap-4 tabular-nums">
                  <dt className="truncate text-texte-2">{c.nom}</dt>
                  <dd>{formaterMontant(c.solde)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 tabular-nums">
                <dt className="text-texte-2">Dettes fournisseurs</dt>
                <dd>
                  <Link href="/achats?vue=a_payer" className="hover:underline">
                    {formaterMontant(d.total_dettes)}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between gap-4 tabular-nums">
                <dt className="text-texte-2">Ordres de fabrication en cours</dt>
                <dd>
                  <Link href="/production" className="hover:underline">
                    {d.ordres_en_cours}
                  </Link>
                </dd>
              </div>
              {controler && aControler.data && (
                <div className="flex justify-between gap-4 tabular-nums">
                  <dt className="text-texte-2">Pièces à contrôler</dt>
                  <dd>
                    <Link href="/administration/controles" className="hover:underline">
                      {aControler.data.total}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>

            <GraphiqueVentes jours={d.ventes_30_jours} />

            <div className="grid gap-6 lg:grid-cols-2">
              <section aria-label="Stocks bas" className="flex flex-col gap-2">
                <h2 className="text-titre-section font-semibold">À traiter : stocks bas</h2>
                {d.stocks_bas.length === 0 ? (
                  <p className="text-texte-2">Aucun article sous son seuil.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-bordure">
                    {d.stocks_bas.map((s) => (
                      <li
                        key={s.article.id}
                        className="flex justify-between gap-4 py-2 tabular-nums"
                      >
                        <span>{nomComplet(s.article)}</span>
                        <span className="text-texte-2">
                          {formaterQuantite(s.stock_actuel, s.article.unite_base)} · seuil{" "}
                          {formaterQuantite(s.stock_minimum, s.article.unite_base)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section aria-label="Impayés anciens" className="flex flex-col gap-2">
                <h2 className="text-titre-section font-semibold">À traiter : impayés anciens</h2>
                {d.impayes_anciens.length === 0 ? (
                  <p className="text-texte-2">Aucune créance en attente.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-bordure">
                    {d.impayes_anciens.map((i) => (
                      <li key={i.id}>
                        <Link
                          href={`/ventes?vente=${i.id}`}
                          className="flex justify-between gap-4 py-2 tabular-nums hover:bg-fond-survol"
                        >
                          <span className="flex flex-col">
                            <span>{i.client}</span>
                            <span className="text-xs text-texte-2">
                              {i.numero} · {formaterDate(i.date_vente)}
                            </span>
                          </span>
                          <span>{formaterMontant(i.reste_a_payer)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        )}
      </EtatRequete>
    </Page>
  );
}
