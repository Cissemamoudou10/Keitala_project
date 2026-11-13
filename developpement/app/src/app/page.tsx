import { redirect } from "next/navigation";

// La connexion s'intercalera ici au Sprint 1 (US-AUTH-01).
export default function Accueil() {
  redirect("/tableau-de-bord");
}
