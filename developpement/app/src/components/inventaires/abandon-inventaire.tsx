"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { CLE_INVENTAIRES, type InventaireDetail } from "@/components/inventaires/types";
import { Button } from "@/components/ui/button";
import { Champ } from "@/components/ui/champ";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { appelerApi, ErreurApi } from "@/lib/api";
import { notifier } from "@/lib/notifications";

/**
 * Abandon d'un inventaire ouvert par erreur (P-018, D-029) : irréversible, donc
 * confirmé avec un motif (charte, section 10). Aucun stock n'est modifié.
 */
export function AbandonInventaire({ inventaire }: { inventaire: InventaireDetail }) {
  const clientRequetes = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const [motif, setMotif] = React.useState("");
  const [erreurMotif, setErreurMotif] = React.useState<string | undefined>();
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [enCours, setEnCours] = React.useState(false);

  const abandonner = async () => {
    if (motif.trim().length < 3) {
      setErreurMotif("Indiquez pourquoi l'inventaire est abandonné.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const resultat = await appelerApi<InventaireDetail>(
        `stocks/inventaires/${inventaire.id}/abandonner`,
        { methode: "POST", corps: { motif: motif.trim() } },
      );
      clientRequetes.setQueryData([...CLE_INVENTAIRES, inventaire.id], resultat);
      await clientRequetes.invalidateQueries({ queryKey: CLE_INVENTAIRES });
      notifier.succes(`Inventaire ${resultat.numero} abandonné, sans ajustement de stock`);
      setOuvert(false);
    } catch (cause) {
      setErreur(cause instanceof ErreurApi ? cause.message : "Une erreur inattendue est survenue.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Dialog open={ouvert} onOpenChange={(valeur) => !enCours && setOuvert(valeur)}>
      <DialogTrigger asChild>
        <Button variant="discret">Abandonner l&apos;inventaire</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abandonner l&apos;inventaire {inventaire.numero}</DialogTitle>
          <DialogDescription>
            Aucun stock ne sera modifié et le comptage saisi sera perdu. L&apos;inventaire reste
            dans la liste avec son motif ; un autre pourra être ouvert.
          </DialogDescription>
        </DialogHeader>
        <Champ libelle="Motif" erreur={erreurMotif}>
          {(controle) => (
            <Input
              autoFocus
              maxLength={200}
              placeholder="Ex. ouvert par erreur sur la mauvaise famille"
              value={motif}
              onChange={(e) => {
                setMotif(e.target.value);
                setErreurMotif(undefined);
              }}
              {...controle}
            />
          )}
        </Champ>
        {erreur && (
          <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
            {erreur}
          </p>
        )}
        <DialogFooter>
          <Button onClick={() => setOuvert(false)} disabled={enCours}>
            Garder l&apos;inventaire
          </Button>
          <Button variant="danger" enCours={enCours} libelleEnCours="Abandon…" onClick={abandonner}>
            Abandonner l&apos;inventaire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
