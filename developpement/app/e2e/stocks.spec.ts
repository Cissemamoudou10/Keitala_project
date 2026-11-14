import { expect, test, type Page } from "@playwright/test";

import { connecter } from "./outils";

// Sprint 3 : inventaire et stock de départ (US-STK-04), pertes (US-STK-06), journal
// (US-STK-05), état et alertes (US-STK-02, US-STK-03).

// Un seul inventaire peut être en cours : les parcours de ce fichier passent l'un après l'autre
test.describe.configure({ mode: "serial" });

const visible = (texte: string | null) => (texte ?? "").replace(/[\u00A0\u202F]/g, " ");

/** Un seul inventaire peut être en cours : on abandonne celui qu'un passage interrompu aurait laissé. */
async function terminerInventaireEnCours(page: Page) {
  const liste = await (await page.request.get("/api/stocks/inventaires")).json();
  for (const inventaire of liste.items) {
    if (inventaire.statut === "EN_COURS") {
      await page.request.post(`/api/stocks/inventaires/${inventaire.id}/abandonner`, {
        data: { motif: "Laissé en cours par un passage interrompu" },
      });
    }
  }
}

test("un inventaire ouvert par erreur s'abandonne, sans toucher au stock", async ({
  page,
}, infoTest) => {
  test.skip(infoTest.project.name !== "bureau", "Un seul inventaire peut être en cours à la fois");
  await connecter(page, "GESTIONNAIRE");
  await terminerInventaireEnCours(page);
  const ouverture = await page.request.post("/api/stocks/inventaires", { data: {} });
  expect(ouverture.status()).toBe(201);
  const inventaire = await ouverture.json();

  await page.goto(`/stocks/inventaires/${inventaire.id}`);
  await page.getByRole("button", { name: "Abandonner l'inventaire" }).click();
  const fenetre = page.getByRole("dialog", { name: /Abandonner l'inventaire/ });
  await fenetre.getByRole("button", { name: "Abandonner l'inventaire" }).click();
  await expect(fenetre.getByText("Indiquez pourquoi l'inventaire est abandonné.")).toBeVisible();
  await fenetre.getByLabel("Motif").fill("Ouvert sur la mauvaise famille");
  await fenetre.getByRole("button", { name: "Abandonner l'inventaire" }).click();

  await expect(page.getByText(/abandonné, sans ajustement de stock/).first()).toBeVisible();
  await expect(page.getByText("Abandonné", { exact: true })).toBeVisible();
  await expect(page.getByText(/Ouvert sur la mauvaise famille/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Valider l'inventaire" })).toHaveCount(0);
});

test("stock de départ par inventaire, puis perte, visibles au journal", async ({
  page,
}, infoTest) => {
  test.skip(infoTest.project.name !== "bureau", "Un seul inventaire peut être en cours à la fois");
  const horodatage = Date.now();
  const code = `E2E-VRAC-${horodatage}`;
  // Nom unique : la base de développement garde les articles des passages précédents
  const nom = `Attiéké vrac ${horodatage}`;
  await connecter(page, "GESTIONNAIRE");
  await terminerInventaireEnCours(page);
  const creation = await page.request.post("/api/articles", {
    data: {
      code_sku: code,
      designation: nom,
      famille: "SEMI_FINI",
      unite_base: "kg",
    },
  });
  expect(creation.status()).toBe(201);
  const articleId = (await creation.json()).id;

  // Ouverture d'un inventaire des produits en vrac
  await page.goto("/stocks/inventaires");
  await page.getByRole("button", { name: "Nouvel inventaire" }).first().click();
  const panneau = page.getByRole("dialog", { name: "Nouvel inventaire" });
  await panneau.getByRole("combobox").click();
  await page.getByRole("option", { name: "Produits en vrac" }).click();
  await panneau.getByRole("button", { name: "Ouvrir l'inventaire" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Inventaire INV-/ })).toBeVisible();

  // Comptage : 120 kg ; motif et coût exigés (article sans coût moyen)
  await page.getByLabel("Chercher un article").fill(code.toLowerCase());
  await page.getByLabel(`Quantité comptée : ${nom}`).fill("120");
  await expect(page.getByRole("cell", { name: "+ 120 kg" })).toBeVisible();
  await page.getByRole("button", { name: "Valider l'inventaire" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "motif" })).toBeVisible();

  await page.getByLabel(`Motif de l'écart : ${nom}`).click();
  await page.getByRole("option", { name: "Autre" }).click();
  await page.getByLabel(`Précision : ${nom}`).fill("Stock de départ");
  await page.getByLabel(`Coût unitaire : ${nom}`).fill("400");
  await page.getByRole("button", { name: "Valider l'inventaire" }).click();
  const confirmation = page.getByRole("dialog", { name: /Valider l'inventaire/ });
  await expect(confirmation.getByText(/au journal des mouvements/)).toBeVisible();
  await confirmation.getByRole("button", { name: "Valider l'inventaire" }).click();
  await expect(page.getByText(/Inventaire INV-.* validé :/).first()).toBeVisible();

  // L'état des stocks montre la quantité et la valeur (120 kg × 400 FCFA)
  await page.goto(`/stocks?recherche=${code}`);
  const ligne = page.getByRole("row").filter({ hasText: code });
  await expect(ligne).toBeVisible();
  expect(visible(await ligne.textContent())).toContain("120 kg");
  expect(visible(await ligne.textContent())).toContain("48 000 FCFA");

  // Perte de 20 kg depuis la fiche
  await ligne.getByRole("button").first().click();
  const fiche = page.getByRole("dialog", { name: nom });
  await fiche.getByRole("textbox", { name: "Quantité perdue" }).fill("20");
  await expect(fiche.getByText(/Disponible\s:\s120\skg/)).toBeVisible();
  await fiche.getByRole("combobox", { name: "Motif" }).click();
  await page.getByRole("option", { name: "Avarie" }).click();
  await fiche.getByRole("button", { name: "Déclarer la perte" }).click();
  await expect(page.getByText(new RegExp(`Perte de 20\\skg de ${nom} enregistrée`))).toBeVisible();

  // Journal de l'article : ajustement d'inventaire puis perte
  await page.goto(`/stocks/mouvements?article=${articleId}`);
  await expect(page.getByRole("cell", { name: /Perte/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "− 20 kg" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Ajustement d'inventaire/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "+ 120 kg" })).toBeVisible();
});

test("le tableau de bord mène aux articles sous le seuil", async ({ page }) => {
  await connecter(page, "GESTIONNAIRE");
  await page.goto("/tableau-de-bord");

  await page.getByRole("link", { name: /Articles sous le seuil/ }).click();
  await expect(page).toHaveURL(/\/stocks\?sous_seuil=1$/);
  await expect(page.getByRole("button", { name: "Sous le seuil" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

for (const role of ["CONSULTANT", "SUPER_ADMIN"] as const) {
  test(`${role} : ni inventaire ni perte (saisis par le Gestionnaire)`, async ({ page }) => {
    await connecter(page, role);
    await page.goto("/stocks/inventaires");
    await expect(page.getByRole("heading", { level: 1, name: "Stocks" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nouvel inventaire" })).toHaveCount(0);

    await page.goto("/stocks?recherche=MP-SOJ-CON");
    await page.getByRole("button", { name: /Soja Consommation/ }).click();
    await expect(page.getByRole("dialog", { name: "Soja Consommation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Déclarer la perte" })).toHaveCount(0);
  });
}
