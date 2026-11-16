"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import { nomComplet, type Article } from "@/components/articles/types";
import { Page } from "@/components/coquille/page";
import { EtatRequete } from "@/components/etats/etat-requete";
import { EtatVide } from "@/components/etats/etat-vide";
import { SqueletteTableau } from "@/components/etats/squelettes";
import { chercherArticles, chercherArticlesDeFamille } from "@/components/pieces/saisie";
import { SousNavigationProduction } from "@/components/production/sous-navigation-production";
import {
  CLE_PRODUCTION,
  FAMILLE_PRODUIT,
  LIBELLES_TYPE_OF,
  type Recette,
  type TypeOf,
} from "@/components/production/types";
import { ChampQuantite } from "@/components/saisie/champ-quantite";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CaseACocher } from "@/components/ui/case-a-cocher";
import { Champ } from "@/components/ui/champ";
import { ChampChoix } from "@/components/ui/champ-choix";
import { Input } from "@/components/ui/input";
import { Onglets } from "@/components/ui/onglets";
import { Panneau } from "@/components/ui/panneau";
import { appelerApi, ErreurApi } from "@/lib/api";
import { enSaisie } from "@/lib/decimal";
import { formaterQuantite } from "@/lib/formats";
import { notifier } from "@/lib/notifications";
import { usePeut } from "@/lib/session";

type ArticleChoisi = Pick<Article, "id" | "designation" | "contenance" | "unite_base">;
type Composant = { cle: string; article: ArticleChoisi | null; quantite: string };
type Edition = { mode: "creation" } | { mode: "modification"; recette: Recette };

export function useRecettes(actives = true) {
  return useQuery({
    queryKey: [...CLE_PRODUCTION, "recettes", { actives }],
    queryFn: ({ signal }) =>
      appelerApi<Recette[]>("production/recettes", { parametres: { actives }, signal }),
  });
}

/**
 * Recettes (US-PROD-01) : transformation (matières → semi-fini en vrac) et
 * conditionnement (vrac + emballages → produit fini), pour une quantité de produit.
 */
export function Recettes() {
  const peutGerer = usePeut("gerer_recettes");
  const [vue, setVue] = React.useState<"actives" | "toutes">("actives");
  const [edition, setEdition] = React.useState<Edition | null>(null);
  const requete = useRecettes(vue === "actives");

  return (
    <Page
      titre="Production"
      description="Recettes : ce qu'il faut pour obtenir une quantité de produit."
      action={
        peutGerer && (
          <Button variant="principal" onClick={() => setEdition({ mode: "creation" })}>
            <Plus />
            Nouvelle recette
          </Button>
        )
      }
    >
      <SousNavigationProduction />
      <Onglets
        libelleAccessible="Recettes à afficher"
        onglets={[
          { valeur: "actives", libelle: "Actives" },
          { valeur: "toutes", libelle: "Toutes" },
        ]}
        actif={vue}
        onChange={setVue}
      />
      <EtatRequete
        requete={requete}
        chargement={<SqueletteTableau lignes={4} colonnes={3} />}
        estVide={(recettes) => recettes.length === 0}
        vide={
          <EtatVide
            message="Aucune recette. Relevez avec l'atelier les quantités d'une recette type par produit."
            action={
              peutGerer && (
                <Button onClick={() => setEdition({ mode: "creation" })}>
                  Saisir la première recette
                </Button>
              )
            }
          />
        }
      >
        {(recettes) => (
          <ul className="grid gap-4 md:grid-cols-2">
            {recettes.map((recette) => (
              <li key={recette.id}>
                <article className="flex h-full flex-col gap-3 rounded-md border border-bordure p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col">
                      <h2 className="font-semibold">{recette.nom_recette}</h2>
                      <span className="text-xs text-texte-2">
                        {LIBELLES_TYPE_OF[recette.type_of]} ·{" "}
                        {formaterQuantite(
                          recette.quantite_base_produite,
                          recette.produit.unite_base,
                        )}{" "}
                        de {nomComplet(recette.produit)}
                      </span>
                    </div>
                    {!recette.est_active && <Badge variant="neutre">Inactive</Badge>}
                  </div>
                  <ul className="flex flex-col gap-1 text-texte-2">
                    {recette.composants.map((c) => (
                      <li key={c.article.id} className="flex justify-between gap-4 tabular-nums">
                        <span>{nomComplet(c.article)}</span>
                        <span>{formaterQuantite(c.quantite, c.article.unite_base)}</span>
                      </li>
                    ))}
                  </ul>
                  {peutGerer && (
                    <div className="mt-auto border-t border-bordure pt-2">
                      <Button
                        variant="discret"
                        onClick={() => setEdition({ mode: "modification", recette })}
                      >
                        Modifier
                      </Button>
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}
      </EtatRequete>
      <Panneau
        ouvert={edition !== null}
        onOuvertChange={(ouvert) => !ouvert && setEdition(null)}
        titre={edition?.mode === "modification" ? "Modifier la recette" : "Nouvelle recette"}
      >
        {edition && (
          <FormulaireRecette
            key={edition.mode === "modification" ? edition.recette.id : "creation"}
            recette={edition.mode === "modification" ? edition.recette : null}
            onTermine={() => setEdition(null)}
          />
        )}
      </Panneau>
    </Page>
  );
}

type Erreurs = {
  produit?: string;
  nom?: string;
  quantite?: string;
  composants?: Record<string, { article?: string; quantite?: string }>;
  general?: string;
};

function FormulaireRecette({
  recette,
  onTermine,
}: {
  recette: Recette | null;
  onTermine: () => void;
}) {
  const clientRequetes = useQueryClient();
  const [type, setType] = React.useState<TypeOf>(recette?.type_of ?? "TRANSFORMATION");
  const [produit, setProduit] = React.useState<ArticleChoisi | null>(recette?.produit ?? null);
  const [nom, setNom] = React.useState(recette?.nom_recette ?? "");
  const [quantite, setQuantite] = React.useState(
    recette ? enSaisie(recette.quantite_base_produite) : "",
  );
  const [notes, setNotes] = React.useState(recette?.notes_preparation ?? "");
  const [active, setActive] = React.useState(recette?.est_active ?? true);
  const [composants, setComposants] = React.useState<Composant[]>(
    recette?.composants.map((c) => ({
      cle: c.article.id,
      article: c.article,
      quantite: enSaisie(c.quantite),
    })) ?? [{ cle: crypto.randomUUID(), article: null, quantite: "" }],
  );
  const [erreurs, setErreurs] = React.useState<Erreurs>({});
  const [enCours, setEnCours] = React.useState(false);
  const rechercherProduit = React.useMemo(
    () => chercherArticlesDeFamille(FAMILLE_PRODUIT[type]),
    [type],
  );

  const modifierComposant = (cle: string, changement: Partial<Composant>) =>
    setComposants((avant) => avant.map((c) => (c.cle === cle ? { ...c, ...changement } : c)));

  const envoyer = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    const nouvelles: Erreurs = {};
    if (!produit) {
      nouvelles.produit =
        type === "TRANSFORMATION"
          ? "Choisissez le semi-fini (en vrac) obtenu."
          : "Choisissez le produit fini obtenu.";
    }
    if (nom.trim().length < 2) nouvelles.nom = "Donnez un nom à la recette.";
    if (!/^\d+([.,]\d+)?$/.test(quantite) || /^0+([.,]0*)?$/.test(quantite)) {
      nouvelles.quantite = "Saisissez la quantité de produit obtenue.";
    }
    const erreursComposants: NonNullable<Erreurs["composants"]> = {};
    for (const c of composants) {
      const e: { article?: string; quantite?: string } = {};
      if (!c.article) e.article = "Choisissez le composant.";
      if (!/^\d+([.,]\d+)?$/.test(c.quantite) || /^0+([.,]0*)?$/.test(c.quantite)) {
        e.quantite = "Saisissez la quantité.";
      }
      if (Object.keys(e).length > 0) erreursComposants[c.cle] = e;
    }
    if (Object.keys(erreursComposants).length > 0) nouvelles.composants = erreursComposants;
    setErreurs(nouvelles);
    if (Object.keys(nouvelles).length > 0) return;

    setEnCours(true);
    try {
      const corps = {
        type_of: type,
        article_produit_id: produit?.id,
        nom_recette: nom.trim(),
        quantite_base_produite: quantite.replace(",", "."),
        notes_preparation: notes.trim() || null,
        composants: composants.map((c) => ({
          article_id: c.article?.id,
          quantite: c.quantite.replace(",", "."),
        })),
        ...(recette ? { est_active: active } : {}),
      };
      const resultat = await appelerApi<Recette>(
        recette ? `production/recettes/${recette.id}` : "production/recettes",
        { methode: recette ? "PUT" : "POST", corps },
      );
      await clientRequetes.invalidateQueries({ queryKey: CLE_PRODUCTION });
      notifier.succes(`Recette « ${resultat.nom_recette} » enregistrée`);
      onTermine();
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
      <Champ libelle="Étape">
        {(controle) => (
          <div {...controle} role="group" aria-label="Étape" className="flex flex-wrap gap-1">
            {(["TRANSFORMATION", "CONDITIONNEMENT"] as const).map((choix) => (
              <Button
                key={choix}
                variant={type === choix ? "principal" : "secondaire"}
                aria-pressed={type === choix}
                onClick={() => {
                  setType(choix);
                  setProduit(null);
                }}
              >
                {LIBELLES_TYPE_OF[choix]}
              </Button>
            ))}
          </div>
        )}
      </Champ>
      <Champ
        libelle={type === "TRANSFORMATION" ? "Semi-fini obtenu" : "Produit fini obtenu"}
        erreur={erreurs.produit}
      >
        {(controle) => (
          <ChampChoix<ArticleChoisi>
            key={type}
            {...controle}
            valeur={produit}
            onChoix={(article) => {
              setProduit(article);
              if (article && !nom.trim()) setNom(nomComplet(article));
            }}
            libelleDe={nomComplet}
            cleDe={(a) => a.id}
            rechercher={rechercherProduit}
            cleRequete={["articles", "choix", FAMILLE_PRODUIT[type]]}
            placeholder="Rechercher le produit"
          />
        )}
      </Champ>
      <Champ libelle="Nom de la recette" erreur={erreurs.nom}>
        {(controle) => (
          <Input
            {...controle}
            autoComplete="off"
            maxLength={150}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
        )}
      </Champ>
      <Champ
        libelle="Quantité de produit obtenue"
        erreur={erreurs.quantite}
        aide="Les quantités des composants sont données pour cette quantité."
      >
        {(controle) => (
          <div className="flex items-center gap-2">
            <ChampQuantite
              {...controle}
              quantite={quantite}
              onQuantiteChange={setQuantite}
              uniteId={null}
              onUniteChange={() => {}}
              uniteBase={produit?.unite_base ?? ""}
              unites={[]}
            />
            <span className="text-texte-2">{produit?.unite_base}</span>
          </div>
        )}
      </Champ>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">Composants</legend>
        {composants.map((c, index) => {
          const e = erreurs.composants?.[c.cle] ?? {};
          return (
            <div
              key={c.cle}
              role="group"
              aria-label={`Composant ${index + 1}`}
              className="flex flex-wrap items-start gap-3 rounded-md border border-bordure p-3"
            >
              <div className="min-w-56 flex-1">
                <Champ libelle="Composant" erreur={e.article}>
                  {(controle) => (
                    <ChampChoix<ArticleChoisi>
                      {...controle}
                      valeur={c.article}
                      onChoix={(article) => modifierComposant(c.cle, { article })}
                      libelleDe={nomComplet}
                      cleDe={(a) => a.id}
                      rechercher={chercherArticles}
                      cleRequete={["articles", "choix"]}
                      placeholder="Rechercher un article"
                    />
                  )}
                </Champ>
              </div>
              <Champ libelle="Quantité" erreur={e.quantite}>
                {(controle) => (
                  <div className="flex items-center gap-2">
                    <ChampQuantite
                      {...controle}
                      quantite={c.quantite}
                      onQuantiteChange={(valeur) => modifierComposant(c.cle, { quantite: valeur })}
                      uniteId={null}
                      onUniteChange={() => {}}
                      uniteBase={c.article?.unite_base ?? ""}
                      unites={[]}
                    />
                    <span className="text-texte-2">{c.article?.unite_base}</span>
                  </div>
                )}
              </Champ>
              {composants.length > 1 && (
                <Button
                  variant="discret"
                  size="icone"
                  className="mt-7"
                  aria-label={`Retirer le composant ${index + 1}`}
                  onClick={() => setComposants((avant) => avant.filter((x) => x.cle !== c.cle))}
                >
                  <X />
                </Button>
              )}
            </div>
          );
        })}
        <div>
          <Button
            onClick={() =>
              setComposants((avant) => [
                ...avant,
                { cle: crypto.randomUUID(), article: null, quantite: "" },
              ])
            }
          >
            <Plus />
            Ajouter un composant
          </Button>
        </div>
      </fieldset>

      <Champ libelle="Notes de préparation" facultatif>
        {(controle) => (
          <Input
            {...controle}
            autoComplete="off"
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        )}
      </Champ>
      {recette && (
        <CaseACocher
          libelle="Recette active"
          aide="Une recette inactive ne sert plus à lancer d'ordre."
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
      )}
      {erreurs.general && (
        <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
          {erreurs.general}
        </p>
      )}
      <div>
        <Button type="submit" variant="principal" enCours={enCours}>
          Enregistrer la recette
        </Button>
      </div>
    </form>
  );
}
