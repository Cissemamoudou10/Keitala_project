import Link from "next/link";

import { Button } from "@/components/ui/button";

// Remplace la page 404 anglaise de Next.js.
export default function Introuvable() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-titre-section font-semibold">Page introuvable</h1>
      <p className="text-texte-2">Cette adresse ne correspond à aucun écran.</p>
      <Button variant="principal" asChild>
        <Link href="/tableau-de-bord">Revenir au tableau de bord</Link>
      </Button>
    </main>
  );
}
