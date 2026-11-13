import Link from "next/link";

import { Page } from "@/components/coquille/page";
import { Button } from "@/components/ui/button";

/** Écran affiché quand le rôle ne permet pas d'ouvrir une page (S1-T2). */
export function AccesRefuse() {
  return (
    <Page titre="Accès refusé">
      <div className="flex flex-col items-start gap-4">
        <p className="text-texte-2">
          Votre compte n&apos;a pas les droits pour cet écran. Si vous en avez besoin, demandez-les
          à l&apos;administrateur.
        </p>
        <Button variant="principal" asChild>
          <Link href="/tableau-de-bord">Revenir au tableau de bord</Link>
        </Button>
      </div>
    </Page>
  );
}
