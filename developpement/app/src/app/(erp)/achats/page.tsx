import Link from "next/link";
import { Users } from "lucide-react";

import { Page } from "@/components/coquille/page";
import { Button } from "@/components/ui/button";

// Écran provisoire : saisie au Sprint 4 (suivi/AVANCEMENT.md). Les fournisseurs sont déjà
// gérés dans le répertoire des tiers (US-REF-01).
export default function PageAchats() {
  return (
    <Page titre="Achats" description="Réceptions de marchandises et dettes fournisseurs.">
      <div className="flex flex-col items-start gap-4">
        <p className="text-texte-2">La saisie sera disponible prochainement.</p>
        <Button asChild>
          <Link href="/tiers?type=fournisseur">
            <Users />
            Voir les fournisseurs
          </Link>
        </Button>
      </div>
    </Page>
  );
}
