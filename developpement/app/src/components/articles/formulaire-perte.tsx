"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { CLE_ARTICLES, nomComplet, type Article } from "@/components/articles/types";
import { ChampQuantite, quantiteEnBase } from "@/components/saisie/champ-quantite";
import { Button } from "@/components/ui/button";
import { Champ } from "@/components/ui/champ";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appelerApi, ErreurApi } from "@/lib/api";
import { estInferieur } from "@/lib/decimal";
import { formaterQuantite } from "@/lib/formats";
import { LIBELLES_MOTIFS, type MotifEcart } from "@/lib/libelles";
import { notifier } from "@/lib/notifications";

const MOTIFS = Object.keys(LIBELLES_MOTIFS) as MotifEcart[];

/**
 * Sortie pour perte ou avarie hors inventaire (US-STK-06) : article, quantité, motif
 * obligatoire. Mouvement « Perte » au journal, sans effet sur la trésorerie.
 */
export function FormulairePerte({
  article,
  onTermine,
}: {
  article: Article;
  onTermine: () => void;
}) {
  const clientRequetes = useQueryClient();
  const [quantite, setQuantite] = React.useState("");
  const [uniteId, setUniteId] = React.useState<number | null>(null);
  const [motif, setMotif] = React.useState<MotifEcart | "">("");
  const [commentaire, setCommentaire] = React.useState("");
  const [erreurs, setErreurs] = React.useState<{ quantite?: string; motif?: string }>({});
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [enCours, setEnCours] = React.useState(false);

  const enBase = quantiteEnBase(quantite, uniteId, article.unites);
  // Le stock disponible bloque la saisie, sauf dérogation au stock négatif
  const depasse =
    !article.autoriser_stock_negatif &&
    enBase !== null &&
    estInferieur(article.stock_actuel, enBase) === true;

  const envoyer = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    const nouvelles: typeof erreurs = {};
    if (enBase === null || /^0+(\.0+)?$/.test(enBase)) {
      nouvelles.quantite = "Saisissez la quantité perdue.";
    }
    if (!motif) nouvelles.motif = "Choisissez le motif de la perte.";
    setErreurs(nouvelles);
    if (Object.keys(nouvelles).length > 0 || depasse) return;

    setEnCours(true);
    setErreur(null);
    try {
      await appelerApi("stocks/pertes", {
        methode: "POST",
        corps: {
          article_id: article.id,
          quantite: quantite.replace(",", "."),
          unite_id: uniteId,
          motif,
          commentaire: commentaire.trim() || null,
        },
      });
      await clientRequetes.invalidateQueries({ queryKey: CLE_ARTICLES });
      await clientRequetes.invalidateQueries({ queryKey: ["stocks"] });
      notifier.succes(
        `Perte de ${formaterQuantite(enBase ?? "0", article.unite_base)} de ${nomComplet(article)} enregistrée`,
      );
      onTermine();
    } catch (cause) {
      setErreur(cause instanceof ErreurApi ? cause.message : "Une erreur inattendue est survenue.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form onSubmit={envoyer} noValidate className="flex flex-col gap-5">
      <Champ libelle="Quantité perdue" erreur={erreurs.quantite}>
        {(controle) => (
          <ChampQuantite
            {...controle}
            quantite={quantite}
            onQuantiteChange={setQuantite}
            uniteId={uniteId}
            onUniteChange={setUniteId}
            uniteBase={article.unite_base}
            unites={article.unites}
            disponible={article.autoriser_stock_negatif ? undefined : article.stock_actuel}
          />
        )}
      </Champ>
      <Champ libelle="Motif" erreur={erreurs.motif}>
        {(controle) => (
          <Select value={motif} onValueChange={(valeur) => setMotif(valeur as MotifEcart)}>
            <SelectTrigger {...controle}>
              <SelectValue placeholder="Choisir le motif" />
            </SelectTrigger>
            <SelectContent>
              {MOTIFS.filter((m) => m !== "ERREUR_COMPTAGE").map((m) => (
                <SelectItem key={m} value={m}>
                  {LIBELLES_MOTIFS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Champ>
      <Champ libelle="Précision" facultatif aide="Ex. sacs mouillés pendant l'orage.">
        {(controle) => (
          <Input
            autoComplete="off"
            maxLength={200}
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
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
        <Button type="submit" enCours={enCours} disabled={depasse}>
          Déclarer la perte
        </Button>
      </div>
    </form>
  );
}
