import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { connecter } from "./outils";

// Sprint 7 : recettes et ordres de fabrication (US-PROD-01 à 04).

const visible = (texte: string | null) => (texte ?? "").replace(/[  ]/g, " ");

/** Manioc acheté à 300 FCFA/kg (150 kg) et un semi-fini vide, propres au passage. */
async function preparer(page: Page) {
  const horodatage = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const creer = async (code: string, designation: string, famille: string) => {
    const reponse = await page.request.post("/api/articles", {
      data: { code_sku: `${code}-${horodatage}`, designation, famille, unite_base: "kg" },
    });
    expect(reponse.status()).toBe(201);
    return reponse.json();
  };
  const manioc = await creer("E2E-MAN", `Manioc ${horodatage}`, "MATIERE_PREMIERE");
  const vrac = await creer("E2E-ATV", `Attiéké vrac ${horodatage}`, "SEMI_FINI");
  const comptes = await (await page.request.get("/api/tresorerie/comptes")).json();
  const banque = comptes.find((c: { code: string }) => c.code === "BANQUE");
  const achat = await page.request.post("/api/achats", {
    data: {
      cle_idempotence: randomUUID(),
      fournisseur_nom_libre: "Producteur",
      lignes: [{ article_id: manioc.id, quantite: "150", prix_unitaire: "300" }],
      reglements: [{ compte_id: banque.id, montant: "45000" }],
    },
  });
  expect(achat.status()).toBe(201);
  return { manioc, vrac, horodatage };
}

test("recette, ordre lancé, sortie déclarée, clôture au coût de revient", async ({ page }) => {
  await connecter(page, "GESTIONNAIRE");
  const { manioc, vrac } = await preparer(page);
  const nomRecette = `Recette ${vrac.designation}`;

  // Recette : 250 kg de manioc pour 100 kg de vrac
  await page.goto("/production/recettes");
  await page.getByRole("button", { name: "Nouvelle recette" }).click();
  const panneau = page.getByRole("dialog", { name: "Nouvelle recette" });
  await panneau.getByRole("combobox", { name: "Semi-fini obtenu" }).fill(vrac.designation);
  await page.getByRole("option", { name: vrac.designation }).click();
  await panneau.getByLabel("Nom de la recette").fill(nomRecette);
  await panneau.getByLabel("Quantité de produit obtenue").fill("100");
  await panneau.getByRole("combobox", { name: "Composant" }).fill(manioc.designation);
  await page.getByRole("option", { name: manioc.designation }).click();
  await panneau.getByLabel("Quantité", { exact: true }).fill("250");
  await panneau.getByRole("button", { name: "Enregistrer la recette" }).click();
  await expect(page.getByRole("heading", { name: nomRecette })).toBeVisible();

  // Lancement : 80 kg visés → 200 kg de manioc prévus, il n'en reste que 150
  await page.goto("/production");
  await page.getByRole("button", { name: "Nouvel ordre" }).click();
  const lancement = page.getByRole("dialog", { name: "Nouvel ordre de fabrication" });
  await lancement.getByRole("combobox", { name: "Recette" }).click();
  await page.getByRole("option", { name: new RegExp(nomRecette) }).click();
  await lancement.getByLabel(/Quantité visée/).fill("80");
  const besoins = lancement.getByRole("region", { name: "Besoins prévus" });
  await expect(besoins).toContainText(/200\skg/);
  await expect(besoins).toContainText(/Il n'en reste que 150\skg/);
  await lancement.getByRole("button", { name: "Lancer l'ordre" }).click();

  await expect(page.getByRole("heading", { level: 1, name: /Ordre OF-/ })).toBeVisible();
  await expect(page.getByText(/Manque 50\skg pour le prévu/)).toBeVisible();

  // Sortie de l'atelier : le semi-fini de la recette est proposé
  const sortie = page.getByRole("form", { name: "Déclarer une sortie" });
  await expect(sortie.getByRole("combobox", { name: "Semi-fini obtenu" })).toHaveValue(
    vrac.designation,
  );
  await sortie.getByLabel("Quantité").fill("30");
  await sortie.getByRole("button", { name: "Déclarer la sortie" }).click();
  await expect(page.getByText(/Sortie de 30\skg déclarée/).first()).toBeVisible();

  // Clôture : consommé pré-rempli au prévu (200 kg) ; il n'en reste que 150
  const cloture = page.getByRole("region", { name: "Clôturer l'ordre" });
  const consomme = cloture.getByLabel(`Consommé : ${manioc.designation}`);
  await expect(consomme).toHaveValue("200");
  await cloture.getByRole("button", { name: "Clôturer l'ordre" }).click();
  await expect(cloture.getByText(/Il reste 150\skg\./).first()).toBeVisible();
  await consomme.fill("120");
  await expect(cloture).toContainText(/Rendement25\s%/);
  await cloture.getByRole("button", { name: "Clôturer l'ordre" }).click();
  const confirmation = page.getByRole("dialog", { name: /Clôturer l'ordre OF-/ });
  const effets = visible(await confirmation.textContent());
  expect(effets).toContain(`120 kg de ${manioc.designation} sortiront du stock`);
  expect(effets).toContain(`30 kg de ${vrac.designation} entreront en stock`);
  await confirmation.getByRole("button", { name: "Clôturer l'ordre" }).click();

  // 120 kg × 300 = 36 000 FCFA pour 30 kg → 1 200 FCFA/kg
  await expect(page.getByText("Terminé", { exact: true })).toBeVisible();
  await expect(page.getByText(/1\s200\sFCFA \/ kg/).first()).toBeVisible();
  const fiche = await (await page.request.get(`/api/articles/${vrac.id}`)).json();
  expect([fiche.stock_actuel, fiche.cout_moyen]).toEqual(["30.000", "1200.0000"]);
});

test("Super Admin : recettes oui, ordres non ; Consultant : lecture seule", async ({ page }) => {
  await connecter(page, "SUPER_ADMIN");
  await page.goto("/production/recettes");
  await expect(page.getByRole("button", { name: "Nouvelle recette" })).toBeVisible();
  await page.goto("/production");
  await expect(page.getByRole("heading", { level: 1, name: "Production" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nouvel ordre" })).toHaveCount(0);

  await connecter(page, "CONSULTANT");
  await page.goto("/production/recettes");
  await expect(page.getByRole("heading", { level: 1, name: "Production" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nouvelle recette" })).toHaveCount(0);
  await page.goto("/production");
  await expect(page.getByRole("button", { name: "Nouvel ordre" })).toHaveCount(0);
});
