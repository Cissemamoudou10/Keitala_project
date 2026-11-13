import { notFound } from "next/navigation";

import { Catalogue } from "./catalogue";

// Catalogue des composants de base, pour contrôle visuel en développement seulement.
export default function PageComposants() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Catalogue />;
}
