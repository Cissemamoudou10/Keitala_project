import { NextResponse, type NextRequest } from "next/server";

import { avecCleProxy, poserCookiesSession, urlApi, type JetonsApi } from "@/lib/serveur/session";

/**
 * Connexion (US-AUTH-01) : transmet les identifiants à l'API et dépose les jetons dans
 * des cookies HttpOnly. Le navigateur ne reçoit que le profil, jamais les jetons.
 */
export async function POST(requete: NextRequest) {
  const base = urlApi();
  if (!base) {
    return NextResponse.json(
      { code: "CONFIGURATION", message: "Le service est mal configuré.", details: null },
      { status: 500 },
    );
  }

  let reponse: Response;
  try {
    reponse = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: avecCleProxy(
        new Headers({ "content-type": "application/json", accept: "application/json" }),
      ),
      body: await requete.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (cause) {
    console.error("[connexion] API injoignable :", cause);
    return NextResponse.json(
      {
        code: "API_INJOIGNABLE",
        message: "Le serveur ne répond pas. Réessayez dans un instant.",
        details: null,
      },
      { status: 502 },
    );
  }

  const contenu: unknown = await reponse.json().catch(() => null);
  if (!reponse.ok) {
    // Erreur de l'API au format commun (identifiants incorrects, compte désactivé…)
    return NextResponse.json(contenu, { status: reponse.status });
  }

  const jetons = contenu as JetonsApi;
  const sortie = NextResponse.json({ utilisateur: jetons.utilisateur });
  poserCookiesSession(sortie.cookies, jetons);
  return sortie;
}
