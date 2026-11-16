"use client";

import { AccesRefuse } from "@/components/coquille/acces-refuse";
import { SqueletteFormulaire } from "@/components/etats/squelettes";
import { FormulaireVente, lireBrouillonVente } from "@/components/ventes/formulaire-vente";
import { useEstHydrate, usePeut, useSession } from "@/lib/session";

/** Attend l'hydratation : le brouillon et le rôle ne sont connus que dans le navigateur. */
export function NouvelleVente() {
  const hydrate = useEstHydrate();
  const session = useSession();
  const peutSaisir = usePeut("saisir_vente");
  if (!hydrate || !session.data) return <SqueletteFormulaire champs={6} />;
  if (!peutSaisir) return <AccesRefuse />;
  return <FormulaireVente brouillon={lireBrouillonVente()} />;
}
