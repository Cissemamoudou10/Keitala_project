import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { connecter } from "./outils";

// Sprint 5 : ventes, dons, créances, facture (US-VTE-01 à 06).

const visible = (texte: string | null) => (texte ?? "").replace(/[\u00A0\u202F]/g, " ");

/** Article unique, prix catalogue 500 FCFA/kg, sac de 25 kg, 200 kg en stock (achat). */
async function preparer(page: Page) {
  const horodatage = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const nomArticle = `Gari ${horodatage}`;
  const creation = await page.request.post("/api/articles", {
    data: {
      code_sku: `E2E-GAR-${horodatage}`,
      designation: nomArticle,
      famille: "PRODUIT_FINI",
      unite_base: "kg",
      prix_vente_standard: "500",
    },
  });
  expect(creation.status()).toBe(201);
  const article = await creation.json();
  const unites = await page.request.put(`/api/articles/${article.id}/unites`, {
    data: { unites: [{ libelle: "Sac 25 kg", facteur_vers_base: "25" }] },
  });
  expect(unites.ok()).toBe(true);
  const comptes = await (await page.request.get("/api/tresorerie/comptes")).json();
  const banque = comptes.find((c: { code: string }) => c.code === "BANQUE");
  const achat = await page.request.post("/api/achats", {
    data: {
      cle_idempotence: randomUUID(),
      fournisseur_nom_libre: "Atelier",
      lignes: [{ article_id: article.id, quantite: "200", prix_unitaire: "300" }],
      reglements: [{ compte_id: banque.id, montant: "60000" }],
    },
  });
  expect(achat.status()).toBe(201);
  return { article, nomArticle, horodatage };
}

async function choisirArticle(page: Page, nom: string) {
  await page.getByRole("combobox", { name: "Article" }).fill(nom);
  await page.getByRole("option", { name: new RegExp(nom) }).click();
}

async function stockDe(page: Page, id: string): Promise<string> {
  return (await (await page.request.get(`/api/articles/${id}`)).json()).stock_actuel;
}

test("vente au comptoir en sacs, payée en espèces, puis facture", async ({ page }) => {
  await connecter(page, "GESTIONNAIRE");
  const { article, nomArticle } = await preparer(page);

  await page.goto("/ventes");
  await page.getByRole("link", { name: "Nouvelle vente" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Nouvelle vente" })).toBeVisible();

  // Sac proposé d'emblée, prix catalogue du sac pré-rempli (500 × 25)
  await choisirArticle(page, nomArticle);
  await expect(page.getByRole("button", { name: "Sac 25 kg" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Prix par Sac 25 kg")).toHaveValue(/12\s500/);
  await page.getByLabel("Quantité").fill("2");
  await expect(page.getByText(/2\sSacs\s25\skg\s=\s50\skg/)).toBeVisible();
  await expect(page.getByText(/Disponible\s:\s200\skg/)).toBeVisible();

  // Encaissement pré-rempli au total, sur la caisse
  await expect(page.getByLabel("Montant reçu")).toHaveValue(/25\s000/);
  expect(
    visible(await page.getByRole("region", { name: "Récapitulatif" }).textContent()),
  ).toContain("Encaissé maintenant25 000 FCFA");

  await page.keyboard.press("Control+Enter");
  await expect(page).toHaveURL(/\/ventes\?vente=/);
  const panneau = page.getByRole("dialog", { name: /Vente FAC-/ });
  await expect(panneau.getByText("Payé", { exact: true }).first()).toBeVisible();
  await expect(panneau.getByText("Client comptoir")).toBeVisible();
  expect(await stockDe(page, article.id)).toBe("150.000");

  // Facture imprimable
  const venteId = new URL(page.url()).searchParams.get("vente");
  await page.goto(`/ventes/${venteId}/facture`);
  const facture = page.getByRole("article", { name: /Facture FAC-/ });
  await expect(facture.getByRole("heading", { name: "Facture" })).toBeVisible();
  const texte = visible(await facture.textContent());
  expect(texte).toContain("Client comptoir");
  expect(texte).toContain(nomArticle);
  expect(texte).toContain("Arrêtée la présente facture à la somme de vingt-cinq mille francs CFA");
  await expect(page.getByRole("button", { name: "Imprimer" })).toBeEnabled();
});

test("vente à crédit, encaissement de la créance, puis annulation", async ({ page }) => {
  await connecter(page, "GESTIONNAIRE");
  const { article, nomArticle, horodatage } = await preparer(page);
  const nomClient = `Boutique ${horodatage}`;
  const tiers = await page.request.post("/api/tiers", {
    data: { nom: nomClient, est_client: true },
  });
  expect(tiers.status()).toBe(201);

  await page.goto("/ventes/nouvelle");
  await page.getByRole("combobox", { name: "Client" }).fill(nomClient);
  await page.getByRole("option", { name: nomClient }).click();
  await choisirArticle(page, nomArticle);
  await page.getByRole("button", { name: "kg", exact: true }).click();
  await expect(page.getByLabel("Prix par kg")).toHaveValue("500");
  await page.getByLabel("Quantité").fill("10");
  await page.getByRole("button", { name: "Tout à crédit" }).click();
  expect(
    visible(await page.getByRole("region", { name: "Récapitulatif" }).textContent()),
  ).toContain(`Reste dû par ${nomClient}5 000 FCFA`);
  await page.getByRole("button", { name: "Enregistrer la vente" }).click();

  const panneau = page.getByRole("dialog", { name: /Vente FAC-/ });
  await expect(panneau.getByText("À crédit", { exact: true })).toBeVisible();

  // Encaissement de la créance, pré-rempli avec le reste
  const encaissement = panneau.getByRole("form", { name: "Encaisser le client" });
  await encaissement.getByRole("combobox", { name: "Compte" }).click();
  await page.getByRole("option", { name: "Wave" }).click();
  await expect(encaissement.getByLabel("Montant")).toHaveValue(/5\s000/);
  await encaissement.getByLabel("Référence").fill("WV-55");
  await encaissement.getByRole("button", { name: "Enregistrer l'encaissement" }).click();
  await expect(page.getByText(/soldée/).first()).toBeVisible();
  await expect(panneau.getByText("Payé", { exact: true }).first()).toBeVisible();

  // Annulation : effets rappelés, stock remis, encaissement retiré du compte
  await panneau.getByRole("button", { name: "Annuler la vente" }).click();
  const fenetre = page.getByRole("dialog", { name: /Annuler la vente FAC-/ });
  const effets = visible(await fenetre.textContent());
  expect(effets).toContain(`10 kg de ${nomArticle} reviendront en stock`);
  expect(effets).toContain("L'encaissement de 5 000 FCFA sera retiré de « Wave »");
  await fenetre.getByLabel("Motif").fill("Client parti sans la marchandise");
  await fenetre.getByRole("button", { name: "Annuler la vente" }).click();
  await expect(panneau.getByText("Annulé", { exact: true })).toBeVisible();
  expect(await stockDe(page, article.id)).toBe("200.000");
});

test("une vente est bloquée si le stock ne suffit pas", async ({ page }) => {
  await connecter(page, "GESTIONNAIRE");
  const { nomArticle } = await preparer(page);

  await page.goto("/ventes/nouvelle");
  await choisirArticle(page, nomArticle);
  await page.getByLabel("Quantité").fill("9");
  await expect(page.getByText(/Il reste 200\skg\. Réduisez la quantité\./)).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer la vente" }).click();
  await expect(page.getByText(new RegExp(`Il reste 200\\skg de ${nomArticle}`))).toBeVisible();
  await expect(page).toHaveURL(/\/ventes\/nouvelle$/);
  await page
    .getByRole("button", { name: "Recommencer à zéro" })
    .click({ timeout: 2000 })
    .catch(() => {});
});

test("un don sort le stock sans rien encaisser", async ({ page }) => {
  await connecter(page, "GESTIONNAIRE");
  const { article, nomArticle, horodatage } = await preparer(page);
  const beneficiaire = `École ${horodatage}`;

  await page.goto("/ventes/nouvelle");
  await page.getByRole("checkbox", { name: /Don \/ échantillon/ }).check();
  await expect(page.getByRole("heading", { level: 1, name: "Nouveau don" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Règlement" })).toHaveCount(0);
  await choisirArticle(page, nomArticle);
  await page.getByRole("button", { name: "kg", exact: true }).click();
  await page.getByLabel("Quantité").fill("3");
  await page.getByRole("button", { name: "Enregistrer le don" }).click();
  await expect(page.getByText("Indiquez qui reçoit le don.")).toBeVisible();
  await page.getByLabel("Bénéficiaire").fill(beneficiaire);
  await page.getByLabel("Motif").fill("Dégustation");
  await page.getByRole("button", { name: "Enregistrer le don" }).click();

  const panneau = page.getByRole("dialog", { name: /Don DON-/ });
  await expect(panneau.getByText("Don", { exact: true })).toBeVisible();
  await expect(panneau.getByText(beneficiaire)).toBeVisible();
  await expect(panneau.getByRole("link", { name: "Imprimer la facture" })).toHaveCount(0);
  expect(await stockDe(page, article.id)).toBe("197.000");

  await page.goto(`/ventes?vue=dons&recherche=${encodeURIComponent(beneficiaire)}`);
  await expect(page.getByRole("cell", { name: beneficiaire })).toBeVisible();
});

for (const role of ["CONSULTANT", "SUPER_ADMIN"] as const) {
  test(`${role} : consulte les ventes sans en saisir`, async ({ page }) => {
    await connecter(page, role);
    await page.goto("/ventes");
    await expect(page.getByRole("heading", { level: 1, name: "Ventes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nouvelle vente" })).toHaveCount(0);

    await page.goto("/ventes/nouvelle");
    await expect(page.getByRole("heading", { level: 1, name: "Accès refusé" })).toBeVisible();
  });
}
