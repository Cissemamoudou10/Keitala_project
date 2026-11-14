import { readFileSync } from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const enCI = Boolean(process.env.CI);

// Mot de passe des comptes de test : variable d'environnement, sinon .env.example
// (source unique, partagée avec la commande API `comptes_e2e`).
process.env.E2E_MOT_DE_PASSE ??= /^E2E_MOT_DE_PASSE=(.*)$/m
  .exec(readFileSync(path.join(__dirname, ".env.example"), "utf8"))?.[1]
  ?.trim();

/**
 * Parcours de bout en bout, sur la pile complète : l'API (avec les comptes de test) doit
 * tourner. En local, Playwright utilise le Chrome du poste (aucun navigateur à
 * télécharger) et un serveur de développement ; en CI, son Chromium et l'application
 * compilée.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: enCI,
  // En local, `next dev` compile chaque page à sa première visite : plus de temps, et peu
  // de parcours simultanés (au-delà, les premières compilations saturent le serveur)
  workers: enCI ? undefined : 4,
  timeout: enCI ? 30_000 : 60_000,
  expect: { timeout: enCI ? 5_000 : 10_000 },
  retries: enCI ? 1 : 0,
  reporter: enCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: enCI ? undefined : "chrome",
    locale: "fr-FR",
    timezoneId: "Africa/Bamako",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "bureau",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    // Largeur minimale exigée par la charte (section 6)
    {
      name: "tablette",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
  ],
  webServer: {
    // En CI, pnpm est installé par l'action ; en local, il passe par corepack
    command: enCI ? `pnpm exec next start -p ${PORT}` : `corepack pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/tableau-de-bord`,
    reuseExistingServer: !enCI,
    timeout: 180_000,
  },
});
