import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const enCI = Boolean(process.env.CI);

/**
 * Parcours de bout en bout. En local, Playwright utilise le Chrome installé sur le
 * poste (aucun navigateur à télécharger) et un serveur de développement ; en CI, son
 * Chromium et l'application compilée.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: enCI,
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
