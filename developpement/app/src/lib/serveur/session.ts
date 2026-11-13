/**
 * Cookies de session posés par le serveur Next (conception technique, section 2).
 * HttpOnly : le JavaScript de la page ne lit jamais les jetons.
 * Fichier serveur uniquement : ne jamais l'importer depuis un composant client.
 */

type CookiesEcrivables = {
  set: (nom: string, valeur: string, options: Record<string, unknown>) => unknown;
  delete: (nom: string) => unknown;
};

export const COOKIE_ACCES = "keitala_acces";
export const COOKIE_RAFRAICHISSEMENT = "keitala_rafraichissement";

/** Réponse de /auth/login et /auth/refresh de l'API. */
export type JetonsApi = {
  jeton_acces: string;
  jeton_rafraichissement: string;
  duree_acces: number;
  duree_rafraichissement: number;
  utilisateur: unknown;
};

function options(dureeSecondes: number) {
  return {
    httpOnly: true,
    // En développement, l'app est servie en http://localhost
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: dureeSecondes,
  };
}

export function poserCookiesSession(cookies: CookiesEcrivables, jetons: JetonsApi): void {
  cookies.set(COOKIE_ACCES, jetons.jeton_acces, options(jetons.duree_acces));
  cookies.set(
    COOKIE_RAFRAICHISSEMENT,
    jetons.jeton_rafraichissement,
    options(jetons.duree_rafraichissement),
  );
}

export function effacerCookiesSession(cookies: CookiesEcrivables): void {
  cookies.delete(COOKIE_ACCES);
  cookies.delete(COOKIE_RAFRAICHISSEMENT);
}

export function urlApi(): string | null {
  const url = process.env.API_URL;
  if (url) return url.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" ? null : "http://localhost:8000";
}

/** Demande de nouveaux jetons à l'API ; null si le jeton de rafraîchissement est refusé. */
export async function rafraichirJetons(
  base: string,
  jetonRafraichissement: string,
): Promise<JetonsApi | null> {
  const reponse = await fetch(`${base}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jeton_rafraichissement: jetonRafraichissement }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  return reponse.ok ? ((await reponse.json()) as JetonsApi) : null;
}
