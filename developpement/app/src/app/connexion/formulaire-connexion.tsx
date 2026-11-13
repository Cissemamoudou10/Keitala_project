"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Champ } from "@/components/ui/champ";
import { Input } from "@/components/ui/input";
import { suiteSure } from "@/lib/droits";

const schema = z.object({
  email: z.string().trim().min(1, "Saisissez votre adresse email."),
  mot_de_passe: z.string().min(1, "Saisissez votre mot de passe."),
});

type Identifiants = z.infer<typeof schema>;

const MESSAGE_RESEAU = "Le serveur ne répond pas. Vérifiez la connexion et réessayez.";

async function messageDeRefus(reponse: Response): Promise<string> {
  const corps = (await reponse.json().catch(() => null)) as { message?: unknown } | null;
  return typeof corps?.message === "string" ? corps.message : MESSAGE_RESEAU;
}

export function FormulaireConnexion() {
  const router = useRouter();
  const parametres = useSearchParams();
  const clientRequetes = useQueryClient();
  const [erreur, setErreur] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Identifiants>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", mot_de_passe: "" },
  });

  const envoyer = handleSubmit(async (identifiants) => {
    setErreur(null);
    let reponse: Response;
    try {
      reponse = await fetch("/api/auth/connexion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(identifiants),
      });
    } catch {
      setErreur(MESSAGE_RESEAU);
      return;
    }
    if (!reponse.ok) {
      // Le formulaire reste rempli : on corrige sans tout ressaisir
      setErreur(await messageDeRefus(reponse));
      return;
    }
    // Oublie toute session précédente (autre utilisateur sur le même poste)
    clientRequetes.clear();
    router.replace(suiteSure(parametres.get("suite")));
  });

  return (
    <form onSubmit={envoyer} noValidate className="flex flex-col gap-6">
      <Champ libelle="Adresse email" erreur={errors.email?.message}>
        {(controle) => (
          <Input
            type="email"
            autoComplete="username"
            inputMode="email"
            autoFocus
            {...controle}
            {...register("email")}
          />
        )}
      </Champ>
      <Champ
        libelle="Mot de passe"
        erreur={errors.mot_de_passe?.message}
        aide="Mot de passe oublié : demandez à l'administrateur de le réinitialiser."
      >
        {(controle) => (
          <Input
            type="password"
            autoComplete="current-password"
            {...controle}
            {...register("mot_de_passe")}
          />
        )}
      </Champ>

      {erreur && (
        <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
          {erreur}
        </p>
      )}

      <Button
        type="submit"
        variant="principal"
        className="w-full"
        enCours={isSubmitting}
        libelleEnCours="Connexion…"
      >
        Se connecter
      </Button>
    </form>
  );
}
