import { expect, test } from "@playwright/test";

import { connecter } from "./outils";

// Sprint 8 : tableau de bord, marges, exports (US-DASH-01 à 03).

test("le tableau de bord montre les chiffres clés, les ventes sur 30 jours et l'à-traiter", async ({
  page,
}) => {
  await connecter(page, "CONSULTANT");
  await page.goto("/tableau-de-bord");

  for (const libelle of [
    "Ventes du jour",
    "Ventes du mois",
    "Trésorerie",
    "Créances clients",
    "Valeur du stock",
    "Articles sous le seuil",
  ]) {
    await expect(page.getByRole("heading", { level: 2, name: libelle })).toBeVisible();
  }
  await expect(page.getByText("Caisse Principale (Espèces)")).toBeVisible();
  await expect(page.getByRole("img", { name: /Ventes des 30 derniers jours/ })).toBeVisible();
  await page.getByText("Voir les valeurs en tableau").click();
  await expect(page.getByRole("columnheader", { name: "Ventes FCFA" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "À traiter : stocks bas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "À traiter : impayés anciens" })).toBeVisible();
});

test("marges par article, puis export Excel", async ({ page }) => {
  await connecter(page, "CONSULTANT");
  await page.goto("/tableau-de-bord");
  await page.getByRole("link", { name: "Marges" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord\/marges$/);
  // Les parcours de vente ont laissé des ventes : au moins un article et la ligne Total
  await expect(page.getByRole("columnheader", { name: "Marge FCFA" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Total", exact: true })).toBeVisible();

  const telechargement = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exporter Excel" }).click();
  const fichier = await telechargement;
  expect(fichier.suggestedFilename()).toMatch(/^marges-\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test("les grands tableaux s'exportent en Excel", async ({ page }) => {
  await connecter(page, "GESTIONNAIRE");
  for (const [adresse, prefixe] of [
    ["/stocks", "etat-des-stocks"],
    ["/tresorerie/journal", "journal-tresorerie"],
    ["/ventes", "ventes"],
  ]) {
    await page.goto(adresse);
    const telechargement = page.waitForEvent("download");
    await page.getByRole("link", { name: "Exporter Excel" }).click();
    expect((await telechargement).suggestedFilename()).toContain(prefixe);
    await expect(page.getByRole("button", { name: "Imprimer ou PDF" })).toBeVisible();
  }
});
