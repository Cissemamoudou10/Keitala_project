"use client";

import { FormulaireAchat, lireBrouillonAchat } from "@/components/achats/formulaire-achat";
import { AccesRefuse } from "@/components/coquille/acces-refuse";
import { SqueletteFormulaire } from "@/components/etats/squelettes";
import { useEstHydrate, usePeut, useSession } from "@/lib/session";

/** Attend l'hydratation : le brouillon et le rôle ne sont connus que dans le navigateur. */
export function NouvelAchat() {
  const hydrate = useEstHydrate();
  const session = useSession();
  const peutSaisir = usePeut("saisir_achat");
  if (!hydrate || !session.data) return <SqueletteFormulaire champs={6} />;
  if (!peutSaisir) return <AccesRefuse />;
  return <FormulaireAchat brouillon={lireBrouillonAchat()} />;
}
