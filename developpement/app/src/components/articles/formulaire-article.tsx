"use client";

import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { CLE_ARTICLES, nomComplet, type Article } from "@/components/articles/types";
import { ChampMontant } from "@/components/saisie/champ-montant";
import { Button } from "@/components/ui/button";
import { CaseACocher } from "@/components/ui/case-a-cocher";
import { Champ } from "@/components/ui/champ";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appelerApi } from "@/lib/api";
import { enSaisie } from "@/lib/decimal";
import { appliquerErreurApi } from "@/lib/erreurs-formulaire";
import { formaterMontant, formaterQuantite } from "@/lib/formats";
import { FAMILLES, LIBELLES_FAMILLES, UNITES_DE_BASE, type Famille } from "@/lib/libelles";
import { notifier } from "@/lib/notifications";
import { usePeut } from "@/lib/session";

const schema = z.object({
  designation: z.string().trim().min(2, "Saisissez le nom de l'article (2 caractères au moins)."),
  code_sku: z
    .string()
    .trim()
    .min(2, "Saisissez le code de l'article.")
    .regex(/^[A-Za-z0-9-]+$/, "Lettres, chiffres et tirets seulement (ex. KN-SOJ-CAF200)."),
  famille: z.enum(FAMILLES as [Famille, ...Famille[]]),
  contenance: z.string().trim().max(50),
  unite_base: z.string().trim().min(1, "Indiquez l'unité de base (ex. kg, sachet)."),
  stock_minimum: z
    .string()
    .trim()
    .regex(/^\d+([.,]\d{1,3})?$/, "Nombre positif, 3 décimales au plus (ex. 250 ou 12,5)."),
  prix_vente_standard: z.string(),
  autoriser_stock_negatif: z.boolean(),
});

type Valeurs = z.infer<typeof schema>;
const CHAMPS = Object.keys(schema.shape) as (keyof Valeurs)[];

function valeursDe(article: Article | undefined, famille: Famille): Valeurs {
  return {
    designation: article?.designation ?? "",
    code_sku: article?.code_sku ?? "",
    famille: article?.famille ?? famille,
    contenance: article?.contenance ?? "",
    unite_base: article?.unite_base ?? "",
    // « 250.000 » → « 250 » ; la virgule est la notation affichée (charte, section 8)
    stock_minimum: article ? enSaisie(article.stock_minimum) : "0",
    prix_vente_standard: article ? article.prix_vente_standard.replace(/\.\d*$/, "") : "",
    autoriser_stock_negatif: article?.autoriser_stock_negatif ?? false,
  };
}

/** Création ou modification d'un article (US-STK-01). Stock et coût moyen : jamais saisis. */
export function FormulaireArticle({
  article,
  familleParDefaut,
  onTermine,
}: {
  article?: Article;
  familleParDefaut: Famille;
  onTermine: (article: Article) => void;
}) {
  const creation = article === undefined;
  const parametrer = usePeut("parametrer");
  const clientRequetes = useQueryClient();
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [changementStatut, setChangementStatut] = React.useState(false);
  const initiales = React.useMemo(
    () => valeursDe(article, familleParDefaut),
    [article, familleParDefaut],
  );

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: initiales });
  const uniteBase = useWatch({ control, name: "unite_base" }) || "unité de base";

  const envoyer = async (corps: Record<string, unknown>, message: (a: Article) => string) => {
    setErreur(null);
    try {
      const resultat = await appelerApi<Article>(creation ? "articles" : `articles/${article.id}`, {
        methode: creation ? "POST" : "PUT",
        corps,
      });
      await clientRequetes.invalidateQueries({ queryKey: CLE_ARTICLES });
      notifier.succes(message(resultat));
      onTermine(resultat);
    } catch (cause) {
      setErreur(appliquerErreurApi(cause, setError, CHAMPS));
    }
  };

  const enregistrer = handleSubmit(async (valeurs) => {
    const normalisees: Record<string, unknown> = {
      ...valeurs,
      code_sku: valeurs.code_sku.toUpperCase(),
      stock_minimum: valeurs.stock_minimum.replace(",", "."),
      prix_vente_standard: valeurs.prix_vente_standard || "0",
    };
    // En modification, seuls les champs changés partent (le reste est inchangé côté API)
    const corps = creation
      ? normalisees
      : Object.fromEntries(
          Object.entries(normalisees).filter(
            ([champ, valeur]) =>
              valeur !== valeursDe(article, familleParDefaut)[champ as keyof Valeurs],
          ),
        );
    if (!parametrer) delete corps.autoriser_stock_negatif;
    await envoyer(corps, (a) =>
      creation ? `Article « ${nomComplet(a)} » créé` : `Article « ${nomComplet(a)} » enregistré`,
    );
  });

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={enregistrer} noValidate className="flex flex-col gap-6">
        <Champ libelle="Nom de l'article" erreur={errors.designation?.message}>
          {(controle) => (
            <Input
              autoComplete="off"
              autoFocus={creation}
              {...controle}
              {...register("designation")}
            />
          )}
        </Champ>
        <Champ
          libelle="Contenance"
          facultatif
          erreur={errors.contenance?.message}
          aide="Pour un produit conditionné, ex. 200 g, 1 L."
        >
          {(controle) => <Input autoComplete="off" {...controle} {...register("contenance")} />}
        </Champ>
        <Champ
          libelle="Code article"
          erreur={errors.code_sku?.message}
          aide="Unique. Lettres, chiffres et tirets, ex. KN-SOJ-CAF200."
        >
          {(controle) => (
            <Input
              autoComplete="off"
              className="uppercase"
              {...controle}
              {...register("code_sku")}
            />
          )}
        </Champ>
        <Champ libelle="Famille" erreur={errors.famille?.message}>
          {(controle) => (
            <Controller
              control={control}
              name="famille"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger {...controle}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FAMILLES.map((famille) => (
                      <SelectItem key={famille} value={famille}>
                        {LIBELLES_FAMILLES[famille]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </Champ>
        <Champ
          libelle="Unité de base"
          erreur={errors.unite_base?.message}
          aide="Stock, seuil et coût sont tenus dans cette unité. Un sac se déclare comme unité de saisie."
        >
          {(controle) => (
            <>
              <Input
                list="unites-de-base"
                autoComplete="off"
                {...controle}
                {...register("unite_base")}
              />
              <datalist id="unites-de-base">
                {UNITES_DE_BASE.map((unite) => (
                  <option key={unite} value={unite} />
                ))}
              </datalist>
            </>
          )}
        </Champ>
        <Champ
          libelle="Seuil d'alerte"
          erreur={errors.stock_minimum?.message}
          aide={`En ${uniteBase}. Sous ce niveau, l'article est signalé « Stock bas ».`}
        >
          {(controle) => (
            <Input
              inputMode="decimal"
              autoComplete="off"
              className="w-40"
              {...controle}
              {...register("stock_minimum")}
            />
          )}
        </Champ>
        <Champ
          libelle="Prix de vente"
          facultatif
          erreur={errors.prix_vente_standard?.message}
          aide={`Prix habituel par ${uniteBase}, proposé à la vente.`}
        >
          {(controle) => (
            <Controller
              control={control}
              name="prix_vente_standard"
              render={({ field }) => (
                <ChampMontant
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  {...controle}
                />
              )}
            />
          )}
        </Champ>
        {parametrer && (
          <Controller
            control={control}
            name="autoriser_stock_negatif"
            render={({ field }) => (
              <CaseACocher
                libelle="Autoriser le stock négatif"
                aide="Dérogation : les sorties restent possibles même sans stock suffisant."
                checked={field.value}
                onChange={(evenement) => field.onChange(evenement.target.checked)}
              />
            )}
          />
        )}

        {erreur && (
          <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
            {erreur}
          </p>
        )}
        <div>
          <Button type="submit" variant="principal" enCours={isSubmitting}>
            {creation ? "Créer l'article" : "Enregistrer les modifications"}
          </Button>
        </div>
      </form>

      {!creation && (
        <>
          <section className="flex flex-col gap-2 border-t border-bordure pt-6">
            <h3 className="font-semibold">Calculé par le système</h3>
            <dl className="grid grid-cols-2 gap-2 tabular-nums">
              <dt className="text-texte-2">Stock</dt>
              <dd>{formaterQuantite(article.stock_actuel, article.unite_base)}</dd>
              <dt className="text-texte-2">Coût moyen</dt>
              <dd>
                {formaterMontant(article.cout_moyen)} par {article.unite_base}
              </dd>
            </dl>
          </section>
          <section className="flex flex-col gap-3 border-t border-bordure pt-6">
            <h3 className="font-semibold">Présence au catalogue</h3>
            <p className="text-texte-2">
              {article.est_actif
                ? "Un article retiré n'est plus proposé à la saisie. Son historique est conservé."
                : "Cet article est retiré du catalogue."}
            </p>
            <div>
              <Button
                enCours={changementStatut}
                onClick={async () => {
                  setChangementStatut(true);
                  await envoyer({ est_actif: !article.est_actif }, (a) =>
                    a.est_actif
                      ? `Article « ${nomComplet(a)} » remis au catalogue`
                      : `Article « ${nomComplet(a)} » retiré du catalogue`,
                  );
                  setChangementStatut(false);
                }}
              >
                {article.est_actif ? "Retirer du catalogue" : "Remettre au catalogue"}
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
