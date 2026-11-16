import { NextResponse, type NextRequest } from "next/server";

import {
  COOKIE_ACCES,
  COOKIE_RAFRAICHISSEMENT,
  effacerCookiesSession,
  avecCleProxy,
  poserCookiesSession,
  rafraichirJetons,
  urlApi,
  type JetonsApi,
} from "@/lib/serveur/session";

/**
 * Relais du navigateur vers FastAPI (conception technique, section 2).
 * Le navigateur n'appelle que /api/... ; seul le serveur Next connaît API_URL et les jetons.
 * Fichier serveur uniquement : ne jamais l'importer depuis un composant client.
 */

export { COOKIE_ACCES };

const DELAI_MAXIMAL_MS = 30_000;
const METHODES_SANS_CORPS = new Set(["GET", "HEAD"]);
// En-têtes de réponse utiles au navigateur (les exports PDF et Excel utiliseront le second)
const ENTETES_REPONSE_RELAYES = ["content-type", "content-disposition"];
// Ces routes renvoient les jetons en clair : seules /api/auth/connexion et le proxy les appellent
const CHEMINS_INTERDITS = new Set(["auth/login", "auth/refresh"]);

function erreur(statut: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { code, message, details: null },
    { status: statut, headers: { "cache-control": "no-store" } },
  );
}

export async function relayerVersApi(requete: NextRequest, chemin: string[]): Promise<Response> {
  const base = urlApi();
  if (!base) {
    return erreur(500, "CONFIGURATION", "Le service est mal configuré. Prévenez l'administrateur.");
  }
  // Empêche de sortir de /api/v1 (ex. /api/../docs)
  if (chemin.some((segment) => segment === "." || segment === ".." || segment === "")) {
    return erreur(400, "CHEMIN_INVALIDE", "Adresse invalide.");
  }
  if (CHEMINS_INTERDITS.has(chemin.join("/"))) {
    return erreur(404, "RESSOURCE_INTROUVABLE", "L'élément demandé est introuvable.");
  }

  const cible = `${base}/api/v1/${chemin.map(encodeURIComponent).join("/")}${requete.nextUrl.search}`;
  const methode = requete.method.toUpperCase();
  const lecture = METHODES_SANS_CORPS.has(methode);
  // Lu une fois : le corps peut être renvoyé après un rafraîchissement de session
  const corps = lecture ? undefined : await requete.arrayBuffer();
  const typeContenu = requete.headers.get("content-type");

  const appeler = (jeton: string | undefined) => {
    const entetes = new Headers({ accept: "application/json" });
    if (typeContenu) entetes.set("content-type", typeContenu);
    if (jeton) entetes.set("authorization", `Bearer ${jeton}`);
    return fetch(cible, {
      method: methode,
      headers: avecCleProxy(entetes),
      body: corps,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(DELAI_MAXIMAL_MS),
    });
  };

  let jetonAcces = requete.cookies.get(COOKIE_ACCES)?.value;
  const jetonRafraichissement = requete.cookies.get(COOKIE_RAFRAICHISSEMENT)?.value;
  let nouveauxJetons: JetonsApi | null = null;
  let sessionRefusee = false;

  let reponse: Response;
  try {
    // Jeton d'accès expiré (cookie disparu) : on renouvelle avant d'appeler
    if (!jetonAcces && jetonRafraichissement) {
      nouveauxJetons = await rafraichirJetons(base, jetonRafraichissement);
      sessionRefusee = nouveauxJetons === null;
      jetonAcces = nouveauxJetons?.jeton_acces;
    }
    reponse = await appeler(jetonAcces);
    // Jeton refusé par l'API : une tentative de renouvellement, puis on rejoue la requête
    if (reponse.status === 401 && jetonRafraichissement && !nouveauxJetons && !sessionRefusee) {
      nouveauxJetons = await rafraichirJetons(base, jetonRafraichissement);
      sessionRefusee = nouveauxJetons === null;
      if (nouveauxJetons) reponse = await appeler(nouveauxJetons.jeton_acces);
    }
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "TimeoutError") {
      return erreur(
        504,
        "DELAI_DEPASSE",
        lecture
          ? "Le serveur met trop de temps à répondre. Réessayez dans un instant."
          : "Le serveur n'a pas répondu à temps. Nous ne savons pas si l'opération a été enregistrée : vérifiez avant de recommencer.",
      );
    }
    console.error("[proxy-api] API injoignable :", cause);
    return erreur(
      502,
      "API_INJOIGNABLE",
      "Le serveur ne répond pas. Vos saisies sont conservées ; réessayez dans un instant.",
    );
  }

  const entetesReponse = new Headers({ "cache-control": "no-store" });
  for (const nom of ENTETES_REPONSE_RELAYES) {
    const valeur = reponse.headers.get(nom);
    if (valeur) entetesReponse.set(nom, valeur);
  }
  const sortie = new NextResponse(reponse.body, {
    status: reponse.status,
    headers: entetesReponse,
  });
  if (nouveauxJetons) poserCookiesSession(sortie.cookies, nouveauxJetons);
  else if (sessionRefusee) effacerCookiesSession(sortie.cookies);
  return sortie;
}
