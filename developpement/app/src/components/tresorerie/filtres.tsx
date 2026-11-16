"use client";

import { useQuery } from "@tanstack/react-query";

import { CLE_COMPTES, type CompteTresorerie } from "@/components/tresorerie/formulaires-compte";
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
import { formaterMontant } from "@/lib/formats";

const TOUS = "tous";

export function useComptes() {
  return useQuery({
    queryKey: CLE_COMPTES,
    queryFn: ({ signal }) => appelerApi<CompteTresorerie[]>("tresorerie/comptes", { signal }),
  });
}

/** Filtre « Compte » d'une liste ; valeur dans l'adresse, vide = tous. */
export function FiltreCompte({
  valeur,
  onChange,
}: {
  valeur: string;
  onChange: (valeur: string | null) => void;
}) {
  const comptes = useComptes();
  return (
    <Champ libelle="Compte">
      {(controle) => (
        <Select
          value={valeur || TOUS}
          onValueChange={(choix) => onChange(choix === TOUS ? null : choix)}
        >
          <SelectTrigger {...controle} className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TOUS}>Tous les comptes</SelectItem>
            {(comptes.data ?? []).map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Champ>
  );
}

/** Filtres « Du » et « Au » d'une liste ; valeurs dans l'adresse. */
export function FiltresDates({
  du,
  au,
  onChange,
}: {
  du: string;
  au: string;
  onChange: (valeurs: { du?: string; au?: string }) => void;
}) {
  return (
    <>
      <Champ libelle="Du">
        {(controle) => (
          <Input
            type="date"
            value={du}
            onChange={(e) => onChange({ du: e.target.value })}
            className="w-44"
            {...controle}
          />
        )}
      </Champ>
      <Champ libelle="Au">
        {(controle) => (
          <Input
            type="date"
            value={au}
            onChange={(e) => onChange({ au: e.target.value })}
            className="w-44"
            {...controle}
          />
        )}
      </Champ>
    </>
  );
}

/** Choix d'un compte dans un formulaire, avec son solde (ou le solde après l'opération). */
export function ChoixCompte({
  libelle,
  comptes,
  valeur,
  onChange,
  erreur,
  soldeApres,
}: {
  libelle: string;
  comptes: CompteTresorerie[];
  valeur: number | null;
  onChange: (compteId: number) => void;
  erreur?: string;
  /** Solde du compte choisi une fois l'opération faite, ou null si pas encore calculable. */
  soldeApres?: string | null;
}) {
  const compte = comptes.find((c) => c.id === valeur);
  return (
    <Champ
      libelle={libelle}
      erreur={erreur}
      aide={
        compte
          ? soldeApres
            ? `Solde après : ${formaterMontant(soldeApres)}`
            : `Solde : ${formaterMontant(compte.solde_actuel)}`
          : undefined
      }
    >
      {(controle) => (
        <Select
          value={valeur === null ? "" : String(valeur)}
          onValueChange={(choix) => onChange(Number(choix))}
        >
          <SelectTrigger {...controle} className="w-72">
            <SelectValue placeholder="Choisir le compte" />
          </SelectTrigger>
          <SelectContent>
            {comptes.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Champ>
  );
}
