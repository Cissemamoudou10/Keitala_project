"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { CLE_ARTICLES, type Article } from "@/components/articles/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appelerApi, ErreurApi } from "@/lib/api";
import { enSaisie, multiplierDecimaux } from "@/lib/decimal";
import { formaterConversion } from "@/lib/formats";
import { notifier } from "@/lib/notifications";

type Ligne = { cle: string; id?: number; libelle: string; facteur: string };

const FACTEUR_VALIDE = /^\d+([.,]\d{1,4})?$/;

function lignesDe(article: Article): Ligne[] {
  return article.unites.map((unite) => ({
    cle: String(unite.id),
    id: unite.id,
    libelle: unite.libelle,
    // « 50.0000 » → « 50 » ; virgule affichée
    facteur: enSaisie(unite.facteur_vers_base),
  }));
}

/**
 * Unités de saisie d'un article (US-REF-02) : « Sac 50 kg = 50 kg ». Un sac n'est pas un
 * article : stock, seuil et coût restent en unité de base.
 */
export function EditeurUnites({
  article,
  modifiable,
  onEnregistre,
}: {
  article: Article;
  modifiable: boolean;
  onEnregistre: (article: Article) => void;
}) {
  const clientRequetes = useQueryClient();
  const [lignes, setLignes] = React.useState<Ligne[]>(() => lignesDe(article));
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [enCours, setEnCours] = React.useState(false);
  const compteur = React.useRef(0);

  const changer = (cle: string, valeurs: Partial<Ligne>) =>
    setLignes((actuelles) => actuelles.map((l) => (l.cle === cle ? { ...l, ...valeurs } : l)));

  const enregistrer = async () => {
    setErreur(null);
    if (lignes.some((l) => !l.libelle.trim())) {
      setErreur("Donnez un nom à chaque unité, ex. « Sac 50 kg ».");
      return;
    }
    if (
      lignes.some(
        (l) => !FACTEUR_VALIDE.test(l.facteur.trim()) || /^0+([.,]0*)?$/.test(l.facteur.trim()),
      )
    ) {
      setErreur(
        `Indiquez pour chaque unité combien elle vaut en ${article.unite_base} (nombre positif).`,
      );
      return;
    }
    setEnCours(true);
    try {
      const resultat = await appelerApi<Article>(`articles/${article.id}/unites`, {
        methode: "PUT",
        corps: {
          unites: lignes.map((l) => ({
            ...(l.id !== undefined ? { id: l.id } : {}),
            libelle: l.libelle.trim(),
            facteur_vers_base: l.facteur.trim().replace(",", "."),
          })),
        },
      });
      await clientRequetes.invalidateQueries({ queryKey: CLE_ARTICLES });
      setLignes(lignesDe(resultat));
      notifier.succes("Unités de saisie enregistrées");
      onEnregistre(resultat);
    } catch (cause) {
      setErreur(cause instanceof ErreurApi ? cause.message : "Une erreur inattendue est survenue.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 border-t border-bordure pt-6">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">Unités de saisie</h3>
        <p className="text-texte-2">
          Pour saisir en sacs, cartons ou bidons. Le stock reste tenu en {article.unite_base}.
        </p>
      </div>

      {lignes.length === 0 && (
        <p className="text-texte-2">Saisie en {article.unite_base} seulement.</p>
      )}

      <ul className="flex flex-col gap-3">
        {lignes.map((ligne) => {
          const exemple =
            FACTEUR_VALIDE.test(ligne.facteur.trim()) && ligne.libelle.trim()
              ? multiplierDecimaux("3", ligne.facteur.trim().replace(",", "."), 3)
              : null;
          return (
            <li key={ligne.cle} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="Nom de l'unité"
                  placeholder="ex. Sac 50 kg"
                  value={ligne.libelle}
                  disabled={!modifiable}
                  onChange={(e) => changer(ligne.cle, { libelle: e.target.value })}
                  className="w-44"
                />
                <span className="text-texte-2">=</span>
                <Input
                  aria-label={`Valeur en ${article.unite_base}`}
                  inputMode="decimal"
                  value={ligne.facteur}
                  disabled={!modifiable}
                  onChange={(e) => changer(ligne.cle, { facteur: e.target.value })}
                  className="w-24 tabular-nums"
                />
                <span className="text-texte-2">{article.unite_base}</span>
                {modifiable && (
                  <Button
                    variant="discret"
                    onClick={() =>
                      setLignes((actuelles) => actuelles.filter((l) => l.cle !== ligne.cle))
                    }
                  >
                    Retirer
                  </Button>
                )}
              </div>
              {exemple && (
                <span className="text-xs text-texte-2 tabular-nums">
                  Ex. {formaterConversion("3", ligne.libelle.trim(), exemple, article.unite_base)}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {erreur && (
        <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
          {erreur}
        </p>
      )}
      {modifiable && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="discret"
            onClick={() => {
              compteur.current += 1;
              setLignes((actuelles) => [
                ...actuelles,
                { cle: `nouvelle-${compteur.current}`, libelle: "", facteur: "" },
              ]);
            }}
          >
            <Plus />
            Ajouter une unité
          </Button>
          <Button enCours={enCours} onClick={enregistrer}>
            Enregistrer les unités
          </Button>
        </div>
      )}
    </section>
  );
}
