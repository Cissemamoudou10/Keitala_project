/**
 * Client d'appel de l'API depuis le navigateur. Passe toujours par le proxy /api.
 * Les montants et quantités arrivent en chaînes décimales : ne pas les convertir en nombres.
 */

/** Erreur au format commun de l'API : `message` est en français, prêt à afficher. */
export class ErreurApi extends Error {
  readonly code: string;
  /** Statut HTTP ; 0 si la requête n'a pas abouti (connexion coupée). */
  readonly statut: number;
  readonly details: Record<string, unknown> | null;

  constructor(
    code: string,
    message: string,
    statut: number,
    details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "ErreurApi";
    this.code = code;
    this.statut = statut;
    this.details = details;
  }
}

type Methode = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type OptionsAppel = {
  methode?: Methode;
  corps?: unknown;
  /** Paramètres d'adresse (filtres, page, taille) ; les valeurs vides sont ignorées. */
  parametres?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
};

function construireAdresse(chemin: string, parametres: OptionsAppel["parametres"]): string {
  const recherche = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(parametres ?? {})) {
    if (valeur !== null && valeur !== undefined && valeur !== "")
      recherche.set(cle, String(valeur));
  }
  const suite = recherche.size > 0 ? `?${recherche}` : "";
  return `/api/${chemin.replace(/^\/+/, "")}${suite}`;
}

function estErreurFormatee(
  valeur: unknown,
): valeur is { code: string; message: string; details?: Record<string, unknown> | null } {
  return (
    typeof valeur === "object" &&
    valeur !== null &&
    typeof (valeur as { code?: unknown }).code === "string" &&
    typeof (valeur as { message?: unknown }).message === "string"
  );
}

export async function appelerApi<T>(chemin: string, options: OptionsAppel = {}): Promise<T> {
  const { methode = "GET", corps, parametres, signal } = options;

  let reponse: Response;
  try {
    reponse = await fetch(construireAdresse(chemin, parametres), {
      method: methode,
      headers: corps === undefined ? undefined : { "content-type": "application/json" },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    // Pour une écriture, on ne sait pas si le serveur a reçu la demande (charte, section 10)
    const message =
      methode === "GET"
        ? "Connexion perdue. Réessayez quand la connexion revient."
        : "La connexion a été coupée. Nous ne savons pas si l'opération a été enregistrée : vérifiez avant de recommencer.";
    throw new ErreurApi("CONNEXION_PERDUE", message, 0);
  }

  if (reponse.status === 204) return undefined as T;

  const contenu: unknown = await reponse.json().catch(() => null);
  if (!reponse.ok) {
    if (estErreurFormatee(contenu)) {
      throw new ErreurApi(contenu.code, contenu.message, reponse.status, contenu.details ?? null);
    }
    throw new ErreurApi(
      "ERREUR_INATTENDUE",
      "Une erreur inattendue est survenue. Réessayez dans un instant.",
      reponse.status,
    );
  }
  return contenu as T;
}
