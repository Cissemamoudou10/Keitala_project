"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, X } from "lucide-react";

import { nomComplet, type Article } from "@/components/articles/types";
import { Page } from "@/components/coquille/page";
import { EtatRequete } from "@/components/etats/etat-requete";
import { SqueletteTableau } from "@/components/etats/squelettes";
import { AnnulationPiece } from "@/components/pieces/detail-piece";
import { chercherArticlesDeFamille, dateDuJour } from "@/components/pieces/saisie";
import {
  CLE_PRODUCTION,
  ETATS_OF,
  LIBELLES_TYPE_OF,
  type OrdreDetail,
} from "@/components/production/types";
import { ChampQuantite } from "@/components/saisie/champ-quantite";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Champ } from "@/components/ui/champ";
import { ChampChoix } from "@/components/ui/champ-choix";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { appelerApi, ErreurApi } from "@/lib/api";
import {
  additionnerDecimaux,
  diviserDecimaux,
  enSaisie,
  estInferieur,
  multiplierDecimaux,
} from "@/lib/decimal";
import {
  formaterDate,
  formaterMontant,
  formaterPourcentage,
  formaterQuantite,
} from "@/lib/formats";
import { notifier } from "@/lib/notifications";
import { usePeut } from "@/lib/session";

type ArticleChoisi = Pick<Article, "id" | "designation" | "contenance" | "unite_base">;

const NUL = /^0+([.,]0*)?$/;
const QUANTITE = /^\d+([.,]\d{1,3})?$/;

function messageDe(cause: unknown): string {
  return cause instanceof ErreurApi ? cause.message : "Une erreur inattendue est survenue.";
}

/** Fiche d'un ordre de fabrication (US-PROD-02 à 04). */
export function FicheOrdre({ id }: { id: string }) {
  const requete = useQuery({
    queryKey: [...CLE_PRODUCTION, "ordres", id],
    queryFn: ({ signal }) => appelerApi<OrdreDetail>(`production/ordres/${id}`, { signal }),
  });
  return (
    <EtatRequete
      requete={requete}
      chargement={
        <Page titre="Ordre de fabrication">
          <SqueletteTableau lignes={5} colonnes={4} />
        </Page>
      }
    >
      {(ordre) => <Contenu ordre={ordre} />}
    </EtatRequete>
  );
}

function useEnregistrer(id: string) {
  const clientRequetes = useQueryClient();
  return async (ordre: OrdreDetail) => {
    clientRequetes.setQueryData([...CLE_PRODUCTION, "ordres", id], ordre);
    await Promise.all(
      [CLE_PRODUCTION, ["articles"], ["stocks"]].map((queryKey) =>
        clientRequetes.invalidateQueries({ queryKey }),
      ),
    );
  };
}

function Contenu({ ordre }: { ordre: OrdreDetail }) {
  const peutPiloter = usePeut("piloter_production");
  const enregistrer = useEnregistrer(ordre.id);
  const enCours = ordre.statut === "EN_COURS";
  const termine = ordre.statut === "TERMINE";
  const etat = ETATS_OF[ordre.statut];
  const unite = ordre.produit.unite_base;

  return (
    <Page
      titre={`Ordre ${ordre.numero}`}
      description={`${LIBELLES_TYPE_OF[ordre.type_of]} · ${ordre.recette} · ${formaterQuantite(ordre.quantite_prevue, unite)} prévus`}
      action={
        <Button asChild variant="discret">
          <Link href="/production">
            <ArrowLeft />
            Ordres de fabrication
          </Link>
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={etat.variante}>{etat.libelle}</Badge>
        <span className="text-texte-2">
          {ordre.date_lancement && `Lancé le ${formaterDate(ordre.date_lancement)}`}
          {ordre.date_cloture && ` · clôturé le ${formaterDate(ordre.date_cloture)}`} · par{" "}
          {ordre.responsable}
        </span>
      </div>
      {ordre.observations && (
        <p className="rounded-md bg-fond-doux px-3 py-2 whitespace-pre-line text-texte-2">
          {ordre.observations}
        </p>
      )}

      {termine && (
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1 rounded-md bg-fond-doux p-4">
            <dt className="text-texte-2">Coût des consommations</dt>
            <dd className="text-chiffre-cle font-semibold tabular-nums">
              {formaterMontant(ordre.cout_total ?? "0")}
            </dd>
          </div>
          <div className="flex flex-col gap-1 rounded-md bg-fond-doux p-4">
            <dt className="text-texte-2">Coût de revient</dt>
            <dd className="text-chiffre-cle font-semibold tabular-nums">
              {formaterMontant(ordre.sorties[0]?.cout_unitaire ?? "0")} / {unite}
            </dd>
          </div>
          <div className="flex flex-col gap-1 rounded-md bg-fond-doux p-4">
            <dt className="text-texte-2">
              {ordre.rendement !== null ? "Rendement" : "Pertes déclarées"}
            </dt>
            <dd className="text-chiffre-cle font-semibold tabular-nums">
              {ordre.rendement !== null
                ? formaterPourcentage(multiplierDecimaux(ordre.rendement, "100", 1) ?? "0")
                : formaterQuantite(ordre.quantite_pertes, unite)}
            </dd>
          </div>
        </dl>
      )}

      <section aria-label="Composants" className="flex flex-col gap-3">
        <h2 className="text-titre-section font-semibold">Composants</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Composant</TableHead>
              <TableHead numerique>Prévu</TableHead>
              <TableHead numerique>{termine ? "Consommé" : "En stock"}</TableHead>
              {termine && <TableHead numerique>Coût moyen</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordre.consommations.map((c) => (
              <TableRow key={c.article.id}>
                <TableCell>
                  <span className="flex flex-col">
                    <span>{nomComplet(c.article)}</span>
                    {!NUL.test(c.manque) && (
                      <span className="text-xs text-danger">
                        Manque {formaterQuantite(c.manque, c.article.unite_base)} pour le prévu
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell numerique>
                  {formaterQuantite(c.quantite_prevue, c.article.unite_base)}
                </TableCell>
                <TableCell numerique>
                  {formaterQuantite(
                    termine ? c.quantite_consommee : c.stock_actuel,
                    c.article.unite_base,
                  )}
                </TableCell>
                {termine && <TableCell numerique>{formaterMontant(c.cout_unitaire)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section aria-label="Sorties de l'atelier" className="flex flex-col gap-3">
        <h2 className="text-titre-section font-semibold">Sorties de l&apos;atelier</h2>
        {ordre.sorties.length === 0 ? (
          <p className="text-texte-2">
            Aucune sortie déclarée. Déclarez ce qui sort de l&apos;atelier au fil des jours.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-bordure">
            {ordre.sorties.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 py-2 tabular-nums">
                <span className="flex flex-col">
                  <span>{nomComplet(s.article)}</span>
                  <span className="text-xs text-texte-2">
                    {formaterDate(s.date_production)}
                    {termine && ` · ${formaterMontant(s.cout_unitaire)} / ${s.article.unite_base}`}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {formaterQuantite(s.quantite, s.article.unite_base)}
                  {enCours && peutPiloter && (
                    <RetirerSortie ordre={ordre} sortieId={s.id} onEnregistre={enregistrer} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {enCours && peutPiloter && <DeclarerSortie ordre={ordre} onEnregistre={enregistrer} />}
      </section>

      {enCours && peutPiloter && (
        <>
          <ClotureOrdre key={ordre.sorties.length} ordre={ordre} onEnregistre={enregistrer} />
          <div>
            <AnnulationPiece
              piece={ordre}
              adresse={`production/ordres/${ordre.id}/annuler`}
              onEnregistre={enregistrer}
              effets={["Aucun stock n'a encore bougé : l'ordre sera seulement marqué « Annulé »."]}
              libelles={{
                action: "Annuler l'ordre",
                garder: "Garder l'ordre",
                description: "L'ordre restera dans la liste avec son motif.",
                motifManquant: "Indiquez pourquoi l'ordre est annulé.",
                annule: (numero) => `Ordre ${numero} annulé`,
              }}
            />
          </div>
        </>
      )}
    </Page>
  );
}

function RetirerSortie({
  ordre,
  sortieId,
  onEnregistre,
}: {
  ordre: OrdreDetail;
  sortieId: number;
  onEnregistre: (ordre: OrdreDetail) => Promise<void>;
}) {
  const [enCours, setEnCours] = React.useState(false);
  return (
    <Button
      variant="discret"
      size="icone"
      enCours={enCours}
      libelleEnCours="…"
      aria-label="Retirer cette sortie"
      title="Retirer cette sortie (déclarée par erreur)"
      onClick={async () => {
        setEnCours(true);
        try {
          await onEnregistre(
            await appelerApi<OrdreDetail>(
              `production/ordres/${ordre.id}/sorties/${sortieId}/retirer`,
              { methode: "POST" },
            ),
          );
        } catch (cause) {
          notifier.erreur(messageDe(cause));
        } finally {
          setEnCours(false);
        }
      }}
    >
      <X />
    </Button>
  );
}

function DeclarerSortie({
  ordre,
  onEnregistre,
}: {
  ordre: OrdreDetail;
  onEnregistre: (ordre: OrdreDetail) => Promise<void>;
}) {
  // Conditionnement : le produit fini de la recette ; transformation : un semi-fini
  const fixe = ordre.type_of === "CONDITIONNEMENT";
  const [article, setArticle] = React.useState<ArticleChoisi | null>(ordre.produit);
  const [quantite, setQuantite] = React.useState("");
  const [jour, setJour] = React.useState(dateDuJour());
  const [erreurs, setErreurs] = React.useState<{ article?: string; quantite?: string }>({});
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [enCours, setEnCours] = React.useState(false);
  const rechercher = React.useMemo(() => chercherArticlesDeFamille("SEMI_FINI"), []);

  const envoyer = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    const nouvelles: typeof erreurs = {};
    if (!article) nouvelles.article = "Choisissez ce qui est sorti.";
    if (!QUANTITE.test(quantite) || NUL.test(quantite)) {
      nouvelles.quantite = "Saisissez la quantité sortie.";
    }
    setErreurs(nouvelles);
    if (Object.keys(nouvelles).length > 0) return;
    setEnCours(true);
    setErreur(null);
    try {
      await onEnregistre(
        await appelerApi<OrdreDetail>(`production/ordres/${ordre.id}/sorties`, {
          methode: "POST",
          corps: {
            article_id: article?.id,
            quantite: quantite.replace(",", "."),
            date_production: jour || null,
          },
        }),
      );
      notifier.succes(
        `Sortie de ${formaterQuantite(quantite.replace(",", "."), article?.unite_base)} déclarée`,
      );
      setQuantite("");
    } catch (cause) {
      setErreur(messageDe(cause));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form
      onSubmit={envoyer}
      noValidate
      aria-label="Déclarer une sortie"
      className="flex flex-col gap-4 rounded-md border border-bordure p-4"
    >
      <h3 className="font-semibold">Déclarer une sortie</h3>
      <div className="flex flex-wrap items-start gap-4">
        {!fixe && (
          <div className="min-w-56 flex-1">
            <Champ libelle="Semi-fini obtenu" erreur={erreurs.article}>
              {(controle) => (
                <ChampChoix<ArticleChoisi>
                  {...controle}
                  valeur={article}
                  onChoix={setArticle}
                  libelleDe={nomComplet}
                  cleDe={(a) => a.id}
                  rechercher={rechercher}
                  cleRequete={["articles", "choix", "SEMI_FINI"]}
                  placeholder="Rechercher un semi-fini"
                />
              )}
            </Champ>
          </div>
        )}
        <Champ
          libelle={fixe ? `Quantité de ${nomComplet(ordre.produit)}` : "Quantité"}
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
                uniteBase={article?.unite_base ?? ""}
                unites={[]}
              />
              <span className="text-texte-2">{article?.unite_base}</span>
            </div>
          )}
        </Champ>
        <Champ libelle="Date">
          {(controle) => (
            <Input
              {...controle}
              type="date"
              max={dateDuJour()}
              className="w-44"
              value={jour}
              onChange={(e) => setJour(e.target.value)}
            />
          )}
        </Champ>
      </div>
      {erreur && (
        <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
          {erreur}
        </p>
      )}
      <div>
        <Button type="submit" enCours={enCours}>
          Déclarer la sortie
        </Button>
      </div>
    </form>
  );
}

function ClotureOrdre({
  ordre,
  onEnregistre,
}: {
  ordre: OrdreDetail;
  onEnregistre: (ordre: OrdreDetail) => Promise<void>;
}) {
  // Consommations réelles pré-remplies avec le prévu, modifiables (US-PROD-04)
  const [reelles, setReelles] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(ordre.consommations.map((c) => [c.article.id, enSaisie(c.quantite_prevue)])),
  );
  const [pertes, setPertes] = React.useState("");
  const [observations, setObservations] = React.useState("");
  const [erreurs, setErreurs] = React.useState<Record<string, string>>({});
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [confirmation, setConfirmation] = React.useState(false);
  const [enCours, setEnCours] = React.useState(false);

  const produit = additionnerDecimaux(ordre.sorties.map((s) => s.quantite)) ?? "0";
  const consomme =
    additionnerDecimaux(
      ordre.consommations.map((c) => (reelles[c.article.id] || "0").replace(",", ".")),
    ) ?? "0";
  const rendement =
    ordre.type_of === "TRANSFORMATION" && !NUL.test(consomme)
      ? diviserDecimaux(produit, consomme, 4)
      : null;

  const valider = () => {
    const nouvelles: Record<string, string> = {};
    for (const c of ordre.consommations) {
      const valeur = reelles[c.article.id] ?? "";
      if (!QUANTITE.test(valeur)) nouvelles[c.article.id] = "Saisissez la quantité (0 si rien).";
      else if (estInferieur(c.stock_actuel, valeur.replace(",", "."))) {
        nouvelles[c.article.id] =
          `Il reste ${formaterQuantite(c.stock_actuel, c.article.unite_base)}.`;
      }
    }
    if (pertes && !QUANTITE.test(pertes)) nouvelles.pertes = "Quantité invalide.";
    setErreurs(nouvelles);
    if (ordre.sorties.length === 0) {
      setErreur("Déclarez d'abord ce qui est sorti de l'atelier.");
      return;
    }
    setErreur(null);
    if (Object.keys(nouvelles).length === 0) setConfirmation(true);
  };

  const cloturer = async () => {
    setEnCours(true);
    try {
      const resultat = await appelerApi<OrdreDetail>(`production/ordres/${ordre.id}/cloturer`, {
        methode: "POST",
        corps: {
          consommations: ordre.consommations.map((c) => ({
            article_id: c.article.id,
            quantite: (reelles[c.article.id] || "0").replace(",", "."),
          })),
          pertes: pertes ? pertes.replace(",", ".") : "0",
          observations: observations.trim() || null,
        },
      });
      await onEnregistre(resultat);
      notifier.succes(`Ordre ${resultat.numero} clôturé`);
      setConfirmation(false);
    } catch (cause) {
      setConfirmation(false);
      setErreur(messageDe(cause));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section
      aria-label="Clôturer l'ordre"
      className="flex flex-col gap-4 rounded-md border border-bordure p-4"
    >
      <h2 className="text-titre-section font-semibold">Clôturer l&apos;ordre</h2>
      <p className="text-texte-2">
        Indiquez ce qui a réellement été consommé : les composants sortiront du stock et les
        produits y entreront, au coût de revient.
      </p>
      <div className="flex flex-col gap-3">
        {ordre.consommations.map((c) => (
          <Champ
            key={c.article.id}
            libelle={`Consommé : ${nomComplet(c.article)}`}
            erreur={erreurs[c.article.id]}
          >
            {(controle) => (
              <div className="flex items-center gap-2">
                <ChampQuantite
                  {...controle}
                  quantite={reelles[c.article.id] ?? ""}
                  onQuantiteChange={(valeur) =>
                    setReelles((avant) => ({ ...avant, [c.article.id]: valeur }))
                  }
                  uniteId={null}
                  onUniteChange={() => {}}
                  uniteBase={c.article.unite_base}
                  unites={[]}
                  disponible={c.stock_actuel}
                />
                <span className="text-texte-2">{c.article.unite_base}</span>
              </div>
            )}
          </Champ>
        ))}
      </div>
      <Champ
        libelle="Pertes (déchets, triage)"
        facultatif
        erreur={erreurs.pertes}
        aide={`En ${ordre.produit.unite_base} de ${nomComplet(ordre.produit)}.`}
      >
        {(controle) => (
          <ChampQuantite
            {...controle}
            quantite={pertes}
            onQuantiteChange={setPertes}
            uniteId={null}
            onUniteChange={() => {}}
            uniteBase={ordre.produit.unite_base}
            unites={[]}
          />
        )}
      </Champ>
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
      <div className="flex flex-col gap-1 rounded-md bg-fond-doux p-4 tabular-nums">
        <p className="flex justify-between">
          <span className="text-texte-2">Produit (sorties déclarées)</span>
          <span>{formaterQuantite(produit, ordre.produit.unite_base)}</span>
        </p>
        {rendement !== null && (
          <p className="flex justify-between">
            <span className="text-texte-2">Rendement</span>
            <span className="font-medium">
              {formaterPourcentage(multiplierDecimaux(rendement, "100", 1) ?? "0")}
            </span>
          </p>
        )}
      </div>
      {erreur && (
        <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
          {erreur}
        </p>
      )}
      <div>
        <Button variant="principal" onClick={valider}>
          Clôturer l&apos;ordre
        </Button>
      </div>
      <Dialog open={confirmation} onOpenChange={(valeur) => !enCours && setConfirmation(valeur)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clôturer l&apos;ordre {ordre.numero}</DialogTitle>
            <DialogDescription>
              Une fois clôturé, l&apos;ordre ne se modifie plus.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-texte-2">
            {ordre.consommations
              .filter((c) => !NUL.test(reelles[c.article.id] || "0"))
              .map((c) => (
                <li key={c.article.id}>
                  {formaterQuantite(
                    (reelles[c.article.id] || "0").replace(",", "."),
                    c.article.unite_base,
                  )}{" "}
                  de {nomComplet(c.article)} sortiront du stock.
                </li>
              ))}
            {ordre.sorties.map((s) => (
              <li key={s.id}>
                {formaterQuantite(s.quantite, s.article.unite_base)} de {nomComplet(s.article)}{" "}
                entreront en stock.
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setConfirmation(false)} disabled={enCours}>
              Corriger
            </Button>
            <Button
              variant="principal"
              enCours={enCours}
              libelleEnCours="Clôture…"
              onClick={cloturer}
            >
              Clôturer l&apos;ordre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
