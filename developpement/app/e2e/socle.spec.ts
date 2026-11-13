import { expect, test } from "@playwright/test";

import { connecter, estTablette } from "./outils";

// Parcours du socle (Sprint 0) : accueil, navigation, page introuvable, tiroir tablette.
// Les parcours métier (vente, achat, clôture d'OF) viendront avec leurs écrans.

test.beforeEach(async ({ page }) => {
  await connecter(page, "GESTIONNAIRE");
});

test("l'accueil mène au tableau de bord", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/tableau-de-bord$/);
  await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
});

test("la navigation ouvre un module et marque l'entrée active", async ({ page, viewport }) => {
  await page.goto("/tableau-de-bord");
  if (estTablette(viewport?.width)) {
    await page.getByRole("button", { name: "Menu" }).click();
  }
  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  await navigation.getByRole("link", { name: "Ventes" }).click();

  await expect(page).toHaveURL(/\/ventes$/);
  await expect(page.getByRole("heading", { level: 1, name: "Ventes" })).toBeVisible();
  if (estTablette(viewport?.width)) {
    // Le tiroir se referme après la navigation
    await expect(navigation).toBeHidden();
  } else {
    await expect(navigation.getByRole("link", { name: "Ventes" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
});

test("une adresse inconnue affiche la page introuvable en français", async ({ page }) => {
  const reponse = await page.goto("/adresse-inconnue");
  expect(reponse?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  await page.getByRole("link", { name: "Revenir au tableau de bord" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord$/);
});

test("sur tablette, le menu s'ouvre en tiroir et se ferme avec Échap", async ({
  page,
  viewport,
}) => {
  test.skip(!estTablette(viewport?.width), "Comportement propre à la tablette");
  await page.goto("/stocks");
  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toBeVisible();

  await menu.click();
  const tiroir = page.getByRole("dialog", { name: "Menu" });
  await expect(tiroir).toBeVisible();
  // Cible tactile de 44 px au moins (charte, section 13)
  const lien = tiroir.getByRole("link", { name: "Stocks" });
  expect((await lien.boundingBox())?.height).toBeGreaterThanOrEqual(44);

  await page.keyboard.press("Escape");
  await expect(tiroir).toBeHidden();
});
