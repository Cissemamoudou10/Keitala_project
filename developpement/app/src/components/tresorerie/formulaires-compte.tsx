"use client";

import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { ChampMontant } from "@/components/saisie/champ-montant";
import { Button } from "@/components/ui/button";
import { Champ } from "@/components/ui/champ";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appelerApi, ErreurApi } from "@/lib/api";
import { formaterMontant } from "@/lib/formats";
import { LIBELLES_TYPES_COMPTE, type TypeCompte } from "@/lib/libelles";
import { montantEnLettres } from "@/lib/nombres-en-lettres";
import { notifier } from "@/lib/notifications";

export type CompteTresorerie = {
  id: number;
  code: string;
  nom: string;
  type: TypeCompte;
  operateur: string | null;
  solde_actuel: string;
  est_actif: boolean;
  date_mise_a_jour: string;
  solde_ouverture_saisi: boolean;
};

export const CLE_COMPTES = ["tresorerie", "comptes"] as const;

function messageDe(erreur: unknown): string {
  return erreur instanceof ErreurApi
    ? erreur.message
    : "Une erreur inattendue est survenue. Réessayez.";
}

function Alerte({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
      {message}
    </p>
  );
}

// --- Nouveau compte ------------------------------------------------------------------

const TYPES = Object.keys(LIBELLES_TYPES_COMPTE) as TypeCompte[];

const schemaCreation = z
  .object({
    nom: z.string().trim().min(2, "Saisissez le nom du compte (2 caractères au moins)."),
    type: z.enum(TYPES as [TypeCompte, ...TypeCompte[]]),
    operateur: z.string().trim(),
  })
  .refine((v) => v.type !== "MOBILE_MONEY" || v.operateur.length >= 2, {
    path: ["operateur"],
    message: "Indiquez l'opérateur (ex. Orange Money).",
  });

export function FormulaireNouveauCompte({ onTermine }: { onTermine: () => void }) {
  const clientRequetes = useQueryClient();
  const [erreur, setErreur] = React.useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schemaCreation>>({
    resolver: zodResolver(schemaCreation),
    defaultValues: { nom: "", type: "BANQUE", operateur: "" },
  });
  const mobileMoney = useWatch({ control, name: "type" }) === "MOBILE_MONEY";

  const enregistrer = handleSubmit(async (valeurs) => {
    setErreur(null);
    try {
      const compte = await appelerApi<CompteTresorerie>("tresorerie/comptes", {
        methode: "POST",
        corps: { ...valeurs, operateur: mobileMoney ? valeurs.operateur : null },
      });
      await clientRequetes.invalidateQueries({ queryKey: CLE_COMPTES });
      notifier.succes(`Compte « ${compte.nom} » ajouté`);
      onTermine();
    } catch (cause) {
      if (cause instanceof ErreurApi && cause.details?.champ === "nom") {
        setError("nom", { message: cause.message }, { shouldFocus: true });
      } else {
        setErreur(messageDe(cause));
      }
    }
  });

  return (
    <form onSubmit={enregistrer} noValidate className="flex flex-col gap-6">
      <Champ libelle="Type de compte">
        {(controle) => (
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger {...controle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {LIBELLES_TYPES_COMPTE[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}
      </Champ>
      {mobileMoney && (
        <Champ
          libelle="Opérateur"
          erreur={errors.operateur?.message}
          aide="Un compte par opérateur. Les montants se saisissent à la main."
        >
          {(controle) => <Input {...controle} {...register("operateur")} />}
        </Champ>
      )}
      <Champ
        libelle="Nom du compte"
        erreur={errors.nom?.message}
        aide="Tel qu'il apparaîtra dans les règlements, ex. « Banque BDM »."
      >
        {(controle) => <Input autoComplete="off" {...controle} {...register("nom")} />}
      </Champ>
      <Alerte message={erreur} />
      <div>
        <Button type="submit" variant="principal" enCours={isSubmitting}>
          Ajouter le compte
        </Button>
      </div>
    </form>
  );
}

// --- Modifier un compte --------------------------------------------------------------

const schemaModification = z.object({
  nom: z.string().trim().min(2, "Saisissez le nom du compte (2 caractères au moins)."),
});

export function FormulaireModificationCompte({
  compte,
  onTermine,
}: {
  compte: CompteTresorerie;
  onTermine: () => void;
}) {
  const clientRequetes = useQueryClient();
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [changementStatut, setChangementStatut] = React.useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schemaModification>>({
    resolver: zodResolver(schemaModification),
    defaultValues: { nom: compte.nom },
  });

  const envoyer = async (corps: Record<string, unknown>, message: string) => {
    setErreur(null);
    try {
      await appelerApi<CompteTresorerie>(`tresorerie/comptes/${compte.id}`, {
        methode: "PUT",
        corps,
      });
      await clientRequetes.invalidateQueries({ queryKey: CLE_COMPTES });
      notifier.succes(message);
      onTermine();
    } catch (cause) {
      setErreur(messageDe(cause));
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={handleSubmit((valeurs) => envoyer(valeurs, `Compte « ${valeurs.nom} » renommé`))}
        noValidate
        className="flex flex-col gap-6"
      >
        <Champ libelle="Nom du compte" erreur={errors.nom?.message}>
          {(controle) => <Input autoComplete="off" {...controle} {...register("nom")} />}
        </Champ>
        <div>
          <Button type="submit" variant="principal" enCours={isSubmitting}>
            Enregistrer le nom
          </Button>
        </div>
      </form>
      <Alerte message={erreur} />
      <section className="flex flex-col gap-3 border-t border-bordure pt-6">
        <h3 className="font-semibold">Utilisation du compte</h3>
        <p className="text-texte-2">
          {compte.est_actif
            ? "Un compte désactivé n'est plus proposé pour les règlements. Son historique est conservé."
            : "Ce compte est désactivé : il n'est plus proposé pour les règlements."}
        </p>
        <div>
          <Button
            enCours={changementStatut}
            libelleEnCours="Enregistrement…"
            onClick={async () => {
              setChangementStatut(true);
              await envoyer(
                { est_actif: !compte.est_actif },
                compte.est_actif
                  ? `Compte « ${compte.nom} » désactivé`
                  : `Compte « ${compte.nom} » réactivé`,
              );
              setChangementStatut(false);
            }}
          >
            {compte.est_actif ? "Désactiver le compte" : "Réactiver le compte"}
          </Button>
        </div>
      </section>
    </div>
  );
}

// --- Solde d'ouverture ---------------------------------------------------------------

/**
 * Saisie unique du solde réel à la mise en service (US-REF-03). Irréversible : une
 * fenêtre montre le montant en chiffres et en toutes lettres avant l'enregistrement
 * (charte, section 9).
 */
export function FormulaireSoldeOuverture({
  compte,
  onTermine,
}: {
  compte: CompteTresorerie;
  onTermine: () => void;
}) {
  const clientRequetes = useQueryClient();
  const [montant, setMontant] = React.useState("");
  const [erreurChamp, setErreurChamp] = React.useState<string | null>(null);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [confirmation, setConfirmation] = React.useState(false);
  const [enCours, setEnCours] = React.useState(false);

  const verifier = (evenement: React.FormEvent) => {
    evenement.preventDefault();
    if (!montant || /^0+$/.test(montant)) {
      setErreurChamp("Saisissez le solde réel du compte, en FCFA.");
      return;
    }
    setErreurChamp(null);
    setConfirmation(true);
  };

  const enregistrer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      await appelerApi<CompteTresorerie>(`tresorerie/comptes/${compte.id}/solde-ouverture`, {
        methode: "POST",
        corps: { montant },
      });
      await clientRequetes.invalidateQueries({ queryKey: CLE_COMPTES });
      notifier.succes(`Solde d'ouverture de « ${compte.nom} » enregistré`);
      setConfirmation(false);
      onTermine();
    } catch (cause) {
      setConfirmation(false);
      setErreur(messageDe(cause));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form onSubmit={verifier} noValidate className="flex flex-col gap-6">
      <Champ
        libelle="Solde réel aujourd'hui"
        erreur={erreurChamp ?? undefined}
        aide="Comptez les espèces, ou relevez le solde sur le relevé ou le téléphone."
      >
        {(controle) => (
          <ChampMontant autoFocus value={montant} onChange={setMontant} {...controle} />
        )}
      </Champ>
      <Alerte message={erreur} />
      <div>
        <Button type="submit" variant="principal">
          Vérifier le montant
        </Button>
      </div>

      <Dialog open={confirmation} onOpenChange={(ouvert) => !enCours && setConfirmation(ouvert)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solde d&apos;ouverture de « {compte.nom} »</DialogTitle>
            <DialogDescription>
              Ce montant ne pourra plus être modifié. Vérifiez-le avant d&apos;enregistrer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            <span className="text-chiffre-cle font-semibold tabular-nums">
              {formaterMontant(montant)}
            </span>
            <span className="text-texte-2">{montantEnLettres(montant)}</span>
          </div>
          <DialogFooter>
            <Button onClick={() => setConfirmation(false)} disabled={enCours}>
              Corriger le montant
            </Button>
            <Button variant="principal" enCours={enCours} onClick={enregistrer}>
              Enregistrer le solde d&apos;ouverture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
