"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { CaseACocher } from "@/components/ui/case-a-cocher";
import { Champ } from "@/components/ui/champ";
import { Input } from "@/components/ui/input";
import { appelerApi, ErreurApi } from "@/lib/api";
import { appliquerErreurApi } from "@/lib/erreurs-formulaire";
import { formaterMontant, formaterTelephone } from "@/lib/formats";
import { notifier } from "@/lib/notifications";

export type Tiers = {
  id: string;
  code_tiers: string | null;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  est_client: boolean;
  est_fournisseur: boolean;
  est_actif: boolean;
  date_creation: string;
  solde_creance: string;
  solde_dette: string;
};

export const CLE_TIERS = ["tiers"] as const;

type Semblable = { id: string; nom: string; telephone: string | null };

const schema = z
  .object({
    nom: z.string().trim().min(2, "Saisissez le nom (2 caractères au moins)."),
    telephone: z.string().trim().max(50),
    adresse: z.string().trim().max(500),
    est_client: z.boolean(),
    est_fournisseur: z.boolean(),
  })
  .refine((v) => v.est_client || v.est_fournisseur, {
    path: ["est_client"],
    message: "Cochez « Client », « Fournisseur », ou les deux.",
  });

type Valeurs = z.infer<typeof schema>;
const CHAMPS = ["nom", "telephone", "adresse", "est_client", "est_fournisseur"] as const;

const estNul = (montant: string) => /^0+(\.0+)?$/.test(montant);

/** Libellé du rôle commercial : « Client », « Fournisseur » ou « Client et fournisseur ». */
export function libelleType(tiers: Pick<Tiers, "est_client" | "est_fournisseur">): string {
  if (tiers.est_client && tiers.est_fournisseur) return "Client et fournisseur";
  return tiers.est_client ? "Client" : "Fournisseur";
}

/** Créance et dette en cours (US-REF-01) ; rien si tout est réglé. */
export function Soldes({ tiers }: { tiers: Tiers }) {
  const lignes: [string, string][] = [];
  if (!estNul(tiers.solde_creance)) lignes.push(["Reste dû par le client", tiers.solde_creance]);
  if (!estNul(tiers.solde_dette)) lignes.push(["Reste dû au fournisseur", tiers.solde_dette]);
  if (lignes.length === 0) return <p className="text-texte-2">Aucun montant en attente.</p>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 tabular-nums">
      {lignes.map(([terme, montant]) => (
        <React.Fragment key={terme}>
          <dt className="text-texte-2">{terme}</dt>
          <dd className="font-semibold">{formaterMontant(montant)}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function FormulaireTiers({
  tiers,
  typeParDefaut,
  onOuvrir,
  onTermine,
}: {
  tiers?: Tiers;
  typeParDefaut: "client" | "fournisseur" | null;
  /** Ouvre la fiche d'un tiers semblable déjà présent. */
  onOuvrir: (id: string) => void;
  onTermine: () => void;
}) {
  const creation = tiers === undefined;
  const clientRequetes = useQueryClient();
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [semblables, setSemblables] = React.useState<Semblable[] | null>(null);
  const [changementStatut, setChangementStatut] = React.useState(false);

  const initiales: Valeurs = {
    nom: tiers?.nom ?? "",
    telephone: tiers?.telephone ?? "",
    adresse: tiers?.adresse ?? "",
    est_client: tiers?.est_client ?? typeParDefaut !== "fournisseur",
    est_fournisseur: tiers?.est_fournisseur ?? typeParDefaut === "fournisseur",
  };
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Valeurs>({ resolver: zodResolver(schema), defaultValues: initiales });

  const envoyer = async (corps: Record<string, unknown>, message: (t: Tiers) => string) => {
    setErreur(null);
    try {
      const resultat = await appelerApi<Tiers>(creation ? "tiers" : `tiers/${tiers.id}`, {
        methode: creation ? "POST" : "PUT",
        corps,
      });
      await clientRequetes.invalidateQueries({ queryKey: CLE_TIERS });
      notifier.succes(message(resultat));
      onTermine();
    } catch (cause) {
      if (cause instanceof ErreurApi && cause.code === "DOUBLON_PROBABLE") {
        setSemblables((cause.details?.tiers as Semblable[] | undefined) ?? []);
        return;
      }
      setErreur(appliquerErreurApi(cause, setError, CHAMPS));
    }
  };

  const enregistrer = (confirmerDoublon: boolean) =>
    handleSubmit(async (valeurs) => {
      if (creation) {
        await envoyer(
          { ...valeurs, confirmer_doublon: confirmerDoublon },
          (t) => `${t.nom} ajouté`,
        );
        return;
      }
      // Seuls les champs changés partent
      const corps = Object.fromEntries(
        Object.entries(valeurs).filter(
          ([champ, valeur]) => valeur !== initiales[champ as keyof Valeurs],
        ),
      );
      await envoyer(corps, (t) => `Fiche de ${t.nom} enregistrée`);
    });

  return (
    <div className="flex flex-col gap-8">
      {!creation && <Soldes tiers={tiers} />}
      <form onSubmit={enregistrer(false)} noValidate className="flex flex-col gap-6">
        <Champ libelle="Nom" erreur={errors.nom?.message} aide="Personne ou entreprise.">
          {(controle) => (
            <Input autoComplete="off" autoFocus={creation} {...controle} {...register("nom")} />
          )}
        </Champ>
        <Champ
          libelle="Téléphone"
          facultatif
          erreur={errors.telephone?.message}
          aide="Ex. 76 12 34 56"
        >
          {(controle) => (
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="off"
              {...controle}
              {...register("telephone")}
            />
          )}
        </Champ>
        <Champ libelle="Adresse" facultatif erreur={errors.adresse?.message}>
          {(controle) => <Input autoComplete="off" {...controle} {...register("adresse")} />}
        </Champ>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-libelle font-medium">Il s&apos;agit d&apos;un</legend>
          <Controller
            control={control}
            name="est_client"
            render={({ field }) => (
              <CaseACocher
                libelle="Client"
                aide="Il vous achète des produits."
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
              />
            )}
          />
          <Controller
            control={control}
            name="est_fournisseur"
            render={({ field }) => (
              <CaseACocher
                libelle="Fournisseur"
                aide="Vous lui achetez des marchandises."
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
              />
            )}
          />
          {errors.est_client?.message && (
            <p className="text-libelle text-danger">{errors.est_client.message}</p>
          )}
        </fieldset>

        {semblables && (
          <div role="alert" className="flex flex-col gap-3 rounded-md bg-attention-fond p-4">
            <p className="text-attention">
              Un client ou fournisseur semblable existe déjà. S&apos;agit-il du même ?
            </p>
            <ul className="flex flex-col gap-2">
              {semblables.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{s.nom}</span>
                    {s.telephone && (
                      <span className="text-texte-2"> · {formaterTelephone(s.telephone)}</span>
                    )}
                  </span>
                  <Button onClick={() => onOuvrir(s.id)}>Ouvrir la fiche</Button>
                </li>
              ))}
            </ul>
            <div>
              <Button variant="discret" enCours={isSubmitting} onClick={enregistrer(true)}>
                Non, en créer un nouveau
              </Button>
            </div>
          </div>
        )}

        {erreur && (
          <p role="alert" className="rounded-md bg-danger-fond px-3 py-2 text-danger">
            {erreur}
          </p>
        )}
        {!semblables && (
          <div>
            <Button type="submit" variant="principal" enCours={isSubmitting}>
              {creation ? "Ajouter" : "Enregistrer les modifications"}
            </Button>
          </div>
        )}
      </form>

      {!creation && (
        <section className="flex flex-col gap-3 border-t border-bordure pt-6">
          <h3 className="font-semibold">Présence au répertoire</h3>
          <p className="text-texte-2">
            {tiers.est_actif
              ? "Une fiche désactivée n'est plus proposée à la saisie. Son historique est conservé."
              : "Cette fiche est désactivée."}
          </p>
          <div>
            <Button
              enCours={changementStatut}
              onClick={async () => {
                setChangementStatut(true);
                await envoyer({ est_actif: !tiers.est_actif }, (t) =>
                  t.est_actif ? `Fiche de ${t.nom} réactivée` : `Fiche de ${t.nom} désactivée`,
                );
                setChangementStatut(false);
              }}
            >
              {tiers.est_actif ? "Désactiver la fiche" : "Réactiver la fiche"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
