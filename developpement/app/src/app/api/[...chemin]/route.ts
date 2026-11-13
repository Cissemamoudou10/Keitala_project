import type { NextRequest } from "next/server";

import { relayerVersApi } from "@/lib/serveur/proxy-api";

// Proxy /api/* → FastAPI /api/v1/*. Lit la requête : exécuté à chaque appel, jamais mis en cache.
async function relayer(requete: NextRequest, contexte: RouteContext<"/api/[...chemin]">) {
  const { chemin } = await contexte.params;
  return relayerVersApi(requete, chemin);
}

export const GET = relayer;
export const POST = relayer;
export const PUT = relayer;
export const PATCH = relayer;
export const DELETE = relayer;
