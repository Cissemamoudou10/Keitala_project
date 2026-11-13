"use client";

import * as React from "react";
import { Controller, useForm, type UseFormSetError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

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
import { LIBELLES_ROLES, type Role } from "@/lib/droits";
import { notifier } from "@/lib/notifications";
import { CLE_SESSION, type Utilisateur } from "@/lib/session";

const ROLES = Object.keys(LIBELLES_ROLES) as Role[];

const champsCommuns = {
  nom_complet: z.string().trim().min(2, "Saisissez le nom complet (2 caractères au moins)."),
  email: z.email("Adresse email invalide : vérifiez la saisie (ex. nom@keitala.ml)."),
  role: z.enum(ROLES as [Role, ...Role[]], "Choisissez un rôle."),
};
const motDePasse = z.string().min(8, "Le mot de passe doit faire 8 caractères au moins.");

const schemaCreation = z.object({ ...champsCommuns, mot_de_passe: motDePasse });
// En modification, le mot de passe n'est changé que s'il est saisi (réinitialisation)
const schemaModification = z.object({
  ...champsCommuns,
  mot_de_passe: z.union([z.literal(""), motDePasse]),
});

type Valeurs = z.infer<typeof schemaCreation>;

/** Reporte une erreur de l'API sous le champ concerné ; sinon renvoie le message général. */
function repartirErreur(erreur: unknown, setError: UseFormSetError<Valeurs>): string | null {
  if (!(erreur instanceof ErreurApi)) return "Une erreur inattendue est survenue. Réessayez.";
  const champ = erreur.details?.champ;
  if (typeof champ === "string" && champ in champsCommuns) {
    setError(champ as keyof Valeurs, { message: erreur.message }, { shouldFocus: true });
    return null;
  }
  if (erreur.code === "DONNEES_INVALIDES" && erreur.details) {
    for (const [nom, messages] of Object.entries(erreur.details)) {
      if (nom in schemaCreation.shape && Array.isArray(messages)) {
        setError(nom as keyof Valeurs, { message: String(messages[0]) });
      }
    }
    return erreur.message;
  }
  return erreur.message;
}

export function FormulaireUtilisateur({
  utilisateur,
  moi,
  onTermine,
}: {
  /** Absent : création d'un compte. */
  utilisateur?: Utilisateur;
  /** Utilisateur connecté (il ne peut pas désactiver son propre compte). */
  moi: Utilisateur;
  onTermine: () => void;
}) {
  const creation = utilisateur === undefined;
  const clientRequetes = useQueryClient();
  const [erreurGenerale, setErreurGenerale] = React.useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Valeurs>({
    resolver: zodResolver(creation ? schemaCreation : schemaModification),
    defaultValues: {
      nom_complet: utilisateur?.nom_complet ?? "",
      email: utilisateur?.email ?? "",
      role: utilisateur?.role ?? "GESTIONNAIRE",
      mot_de_passe: "",
    },
  });

  const rafraichir = async (modifie: Utilisateur) => {
    await clientRequetes.invalidateQueries({ queryKey: ["utilisateurs"] });
    if (modifie.id === moi.id) await clientRequetes.invalidateQueries({ queryKey: CLE_SESSION });
  };

  const enregistrer = handleSubmit(async (valeurs) => {
    setErreurGenerale(null);
    // En modification, seuls les champs changés partent : un email existant n'est pas
    // revalidé, et l'API n'applique que ce que l'administrateur a voulu changer
    const corps: Record<string, string> = {};
    for (const champ of ["nom_complet", "email", "role"] as const) {
      if (creation || valeurs[champ] !== utilisateur[champ]) corps[champ] = valeurs[champ];
    }
    if (valeurs.mot_de_passe) corps.mot_de_passe = valeurs.mot_de_passe;
    try {
      const resultat = creation
        ? await appelerApi<Utilisateur>("utilisateurs", { methode: "POST", corps })
        : await appelerApi<Utilisateur>(`utilisateurs/${utilisateur.id}`, {
            methode: "PUT",
            corps,
          });
      await rafraichir(resultat);
      notifier.succes(
        creation
          ? `Compte de ${resultat.nom_complet} créé`
          : `Compte de ${resultat.nom_complet} enregistré`,
      );
      onTermine();
    } catch (erreur) {
      setErreurGenerale(repartirErreur(erreur, setError));
    }
  });

  const changerStatut = useMutation({
    mutationFn: (est_actif: boolean) =>
      appelerApi<Utilisateur>(`utilisateurs/${utilisateur?.id}`, {
        methode: "PUT",
        corps: { est_actif },
      }),
    onSuccess: async (resultat) => {
      await rafraichir(resultat);
      notifier.succes(
        resultat.est_actif
          ? `Compte de ${resultat.nom_complet} réactivé`
          : `Compte de ${resultat.nom_complet} désactivé`,
      );
      onTermine();
    },
    onError: (erreur) => setErreurGenerale(repartirErreur(erreur, setError)),
  });

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={enregistrer} noValidate className="flex flex-col gap-6">
        <Champ libelle="Nom complet" erreur={errors.nom_complet?.message}>
          {(controle) => (
            <Input autoComplete="off" autoFocus {...controle} {...register("nom_complet")} />
          )}
        </Champ>
        <Champ
          libelle="Adresse email"
          erreur={errors.email?.message}
          aide="Elle sert à se connecter."
        >
          {(controle) => (
            <Input
              type="email"
              inputMode="email"
              autoComplete="off"
              {...controle}
              {...register("email")}
            />
          )}
        </Champ>
        <Champ libelle="Rôle" erreur={errors.role?.message}>
          {(controle) => (
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger {...controle} onBlur={field.onBlur}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {LIBELLES_ROLES[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </Champ>
        <Champ
          libelle={creation ? "Mot de passe" : "Nouveau mot de passe"}
          facultatif={!creation}
          erreur={errors.mot_de_passe?.message}
          aide={
            creation
              ? "8 caractères au moins. Communiquez-le à la personne de vive voix."
              : "Pour réinitialiser le mot de passe. Laissez vide pour ne pas le changer."
          }
        >
          {(controle) => (
            <Input
              type="password"
              autoComplete="new-password"
              {...controle}
              {...register("mot_de_passe")}
            />
          )}
        </Champ>

        {erreurGenerale && (
          <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
            {erreurGenerale}
          </p>
        )}

        <div>
          <Button type="submit" variant="principal" enCours={isSubmitting}>
            {creation ? "Créer le compte" : "Enregistrer les modifications"}
          </Button>
        </div>
      </form>

      {!creation && (
        <section className="flex flex-col gap-3 border-t border-bordure pt-6">
          <h3 className="font-semibold">Accès au compte</h3>
          {utilisateur.id === moi.id ? (
            <p className="text-texte-2">Vous ne pouvez pas désactiver votre propre compte.</p>
          ) : (
            <>
              <p className="text-texte-2">
                {utilisateur.est_actif
                  ? "Un compte désactivé ne peut plus se connecter. Son historique est conservé."
                  : "Ce compte est désactivé : la personne ne peut pas se connecter."}
              </p>
              <div>
                <Button
                  enCours={changerStatut.isPending}
                  onClick={() => changerStatut.mutate(!utilisateur.est_actif)}
                >
                  {utilisateur.est_actif ? "Désactiver le compte" : "Réactiver le compte"}
                </Button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
