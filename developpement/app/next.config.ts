import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // L'accueil mène au tableau de bord ; la connexion s'intercalera au Sprint 1 (US-AUTH-01).
  // Redirection déclarée ici plutôt que par redirect() dans une page : sans rendu inutile.
  async redirects() {
    return [{ source: "/", destination: "/tableau-de-bord", permanent: false }];
  },
};

export default nextConfig;
