import type { NextRequest } from "next/server";

/**
 * Relais du navigateur vers FastAPI (conception technique, section 2).
 * Le navigateur n'appelle que /api/... ; seul le serveur Next connaît API_URL.
 * Fichier serveur uniquement : ne jamais l'importer depuis un composant client.
 */

/** Cookie HttpOnly du jeton d'accès, posé par la connexion (Sprint 1, US-AUTH-01). */
export const COOKIE_ACCES = "keitala_acces";

const DELAI_MAXIMAL_MS = 30_000;
const METHODES_SANS_CORPS = new Set(["GET", "HEAD"]);
// En-têtes de réponse utiles au navigateur (les exports PDF et Excel utiliseront le second)
const ENTETES_REPONSE_RELAYES = ["content-type", "content-disposition"];

function urlApi(): string | null {
  const url = process.env.API_URL;
  if (url) return url.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" ? null : "http://localhost:8000";
}

function erreur(statut: number, code: string, message: string): Response {
  return Response.json(
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

  const cible = `${base}/api/v1/${chemin.map(encodeURIComponent).join("/")}${requete.nextUrl.search}`;
  const methode = requete.method.toUpperCase();

  const entetes = new Headers({ accept: "application/json" });
  const typeContenu = requete.headers.get("content-type");
  if (typeContenu) entetes.set("content-type", typeContenu);
  const jeton = requete.cookies.get(COOKIE_ACCES)?.value;
  if (jeton) entetes.set("authorization", `Bearer ${jeton}`);

  let reponse: Response;
  try {
    reponse = await fetch(cible, {
      method: methode,
      headers: entetes,
      body: METHODES_SANS_CORPS.has(methode) ? undefined : await requete.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(DELAI_MAXIMAL_MS),
    });
  } catch (cause) {
    const lecture = METHODES_SANS_CORPS.has(methode);
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
  return new Response(reponse.body, { status: reponse.status, headers: entetesReponse });
}
