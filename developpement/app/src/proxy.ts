import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_ACCES, COOKIE_RAFRAICHISSEMENT } from "@/lib/serveur/session";

/**
 * Vérification rapide de session avant d'afficher un écran (Next 16 « proxy », ex-middleware).
 * Sans aucun cookie de session : direction la connexion, en gardant la page demandée.
 * Ce n'est qu'un confort : la vraie vérification est faite par l'API à chaque appel.
 */
export function proxy(requete: NextRequest) {
  const { cookies, nextUrl } = requete;
  if (cookies.has(COOKIE_ACCES) || cookies.has(COOKIE_RAFRAICHISSEMENT)) {
    return NextResponse.next();
  }
  const connexion = new URL("/connexion", requete.url);
  if (nextUrl.pathname !== "/") {
    connexion.searchParams.set("suite", `${nextUrl.pathname}${nextUrl.search}`);
  }
  return NextResponse.redirect(connexion);
}

export const config = {
  // Tout sauf : l'API et les fichiers de Next, la connexion, le catalogue de développement
  matcher: ["/((?!api|_next|favicon.ico|connexion|composants).*)"],
};
