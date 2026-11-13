import { NextResponse } from "next/server";

import { effacerCookiesSession } from "@/lib/serveur/session";

// Déconnexion : les jetons étant sans état côté API, effacer les cookies suffit.
export async function POST() {
  const sortie = new NextResponse(null, { status: 204 });
  effacerCookiesSession(sortie.cookies);
  return sortie;
}
