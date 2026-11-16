"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formaterMontant } from "@/lib/formats";
import { montantEnLettres } from "@/lib/nombres-en-lettres";

/** Montant élevé relu en chiffres et en toutes lettres avant l'enregistrement (charte). */
export function ConfirmationMontant({
  ouvert,
  onOuvertChange,
  titre,
  montant,
  action,
  enCours,
  onConfirmer,
}: {
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
  /** « Confirmer un achat de » : le montant est ajouté à la suite. */
  titre: string;
  montant: string;
  /** Libellé du bouton, ex. « Enregistrer l'achat ». */
  action: string;
  enCours: boolean;
  onConfirmer: () => void;
}) {
  return (
    <Dialog open={ouvert} onOpenChange={(valeur) => !enCours && onOuvertChange(valeur)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {titre} {formaterMontant(montant)}
          </DialogTitle>
          <DialogDescription>Relisez le montant avant d&apos;enregistrer.</DialogDescription>
        </DialogHeader>
        <p className="text-lg font-medium first-letter:uppercase">{montantEnLettres(montant)}</p>
        <DialogFooter>
          <Button onClick={() => onOuvertChange(false)} disabled={enCours}>
            Corriger
          </Button>
          <Button
            variant="principal"
            enCours={enCours}
            libelleEnCours="Enregistrement…"
            onClick={onConfirmer}
          >
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
