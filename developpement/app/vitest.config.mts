import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Tests unitaires et de composants (Vitest + Testing Library). Les parcours de bout en
// bout sont dans e2e/ (Playwright).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Les dates relatives et l'affichage ne doivent pas dépendre du poste
    env: { TZ: "UTC" },
  },
});
