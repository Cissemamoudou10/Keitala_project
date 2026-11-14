import Link from "next/link";
import { Users } from "lucide-react";

import { Page } from "@/components/coquille/page";
import { Button } from "@/components/ui/button";

// Écran provisoire : saisie au Sprint 5 (suivi/AVANCEMENT.md). Les clients sont déjà
// gérés dans le répertoire des tiers (US-REF-01).
export default function PageVentes() {
  return (
    <Page titre="Ventes" description="Ventes au comptoir, dons et créances clients.">
      <div className="flex flex-col items-start gap-4">
        <p className="text-texte-2">La saisie sera disponible prochainement.</p>
        <Button asChild>
          <Link href="/tiers?type=client">
            <Users />
            Voir les clients
          </Link>
        </Button>
      </div>
    </Page>
  );
}
