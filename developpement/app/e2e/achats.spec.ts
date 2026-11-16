import { expect, test, type Page } from "@playwright/test";

import { connecter } from "./outils";

// Sprint 4 : achats (US-ACH-01 à 04). Paiements sur le compte bancaire : il peut être à
// découvert (D-030), alors que la caisse de la base e2e peut être vide.

const visible = (texte: string | null) => (texte ?? "").replace(/[  ]/g, " ");

/** Article et fournisseur uniques : la base e2e garde les passages précédents. */
async function preparer(page: Page) {
  const horodatage = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const nomArticle = `Arachide coque ${horodatage}`;
  const creation = await page.request.post("/api/articles", {
    data: {
      code_sku: `E2E-ARA-${horodatage}`,
      designation: nomArticle,
      famille: "MATIERE_PREMIERE",
      unite_base: "kg",
    },
  });
  expect(creation.status()).toBe(201);
  const article = await creation.json();
  const unites = await page.request.put(`/api/articles/${article.id}/unites`, {
    data: { unites: [{ libelle: "Sac 50 kg", facteur_vers_base: "50" }] },
  });
  expect(unites.ok()).toBe(true);
  const nomFournisseur = `Coopérative ${horodatage}`;
  const tiers = await page.request.post("/api/tiers", {
    data: { nom: nomFournisseur, est_fournisseur: true },
  });
  expect(tiers.status()).toBe(201);
  return { article, nomArticle, nomFournisseur };
}

async function choisir(page: Page, libelle: string, texte: string, option: RegExp | string) {
  await page.getByRole("combobox", { name: libelle }).fill(texte);
  await page.getByRole("option", { name: option }).click();
}

async function choisirCompte(page: Page, index: number, compte: string) {
  await page.getByRole("combobox", { name: "Compte" }).nth(index).click();
  await page.getByRole("option", { name: compte }).click();
}

test("achat en sacs payé en partie, dette payée, puis achat annulé", async ({ page }) => {
  await connecter(page, "GESTIONNAIRE");
  const { article, nomArticle, nomFournisseur } = await preparer(page);

  await page.goto("/achats");
  await page.getByRole("link", { name: "Nouvel achat" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Nouvel achat" })).toBeVisible();

  // Fournisseur et article par recherche ; le sac est proposé d'emblée
  await choisir(page, "Fournisseur", nomFournisseur, nomFournisseur);
  await page.getByLabel("N° de facture ou bordereau").fill("BL-77");
  await choisir(page, "Article", nomArticle, new RegExp(nomArticle));
  await expect(page.getByRole("button", { name: "Sac 50 kg" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel("Quantité").fill("3");
  await expect(page.getByText(/3\sSacs\s50\skg\s=\s150\skg/)).toBeVisible();
  await page.getByLabel("Prix par Sac 50 kg").fill("12500");
  await expect(page.getByText("Montant :")).toHaveText(/37\s500\sFCFA/);

  // Paiement pré-rempli au total ; on n'en paie qu'une partie : le reste est dû
  await choisirCompte(page, 0, "Compte Bancaire");
  const montantPaye = page.getByLabel("Montant payé");
  await expect(montantPaye).toHaveValue(/37\s500/);
  await montantPaye.fill("20000");
  const recapitulatif = page.getByRole("region", { name: "Récapitulatif" });
  expect(visible(await recapitulatif.textContent())).toContain(
    `Reste dû à ${nomFournisseur}17 500 FCFA`,
  );

  await page.keyboard.press("Control+Enter");
  await expect(page).toHaveURL(/\/achats\?achat=/);
  const panneau = page.getByRole("dialog", { name: /Achat ACH-/ });
  await expect(panneau.getByText("Partiel", { exact: true })).toBeVisible();
  await expect(panneau.getByText("BL-77")).toBeVisible();

  // Stock en kg, coût moyen au kg (12 500 ÷ 50)
  const fiche = await (await page.request.get(`/api/articles/${article.id}`)).json();
  expect([fiche.stock_actuel, fiche.cout_moyen]).toEqual(["150.000", "250.0000"]);

  // Paiement de la dette : pré-rempli avec le reste
  const paiement = panneau.getByRole("form", { name: "Payer le fournisseur" });
  await paiement.getByRole("combobox", { name: "Compte" }).click();
  await page.getByRole("option", { name: "Compte Bancaire" }).click();
  await expect(paiement.getByLabel("Montant")).toHaveValue(/17\s500/);
  await paiement.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText(/soldé/).first()).toBeVisible();
  // L'étiquette d'état, en tête de la fiche (« Payé » figure aussi dans les totaux)
  await expect(panneau.getByText("Payé", { exact: true }).first()).toBeVisible();
  await expect(paiement).toHaveCount(0);

  // Annulation : effets rappelés, motif exigé
  await panneau.getByRole("button", { name: "Annuler l'achat" }).click();
  const fenetre = page.getByRole("dialog", { name: /Annuler l'achat ACH-/ });
  expect(visible(await fenetre.textContent())).toContain(`150 kg de ${nomArticle} sortiront`);
  await fenetre.getByRole("button", { name: "Annuler l'achat" }).click();
  await expect(fenetre.getByText("Indiquez pourquoi l'achat est annulé.")).toBeVisible();
  await fenetre.getByLabel("Motif").fill("Livraison refusée");
  await fenetre.getByRole("button", { name: "Annuler l'achat" }).click();

  await expect(panneau.getByText("Annulé", { exact: true })).toBeVisible();
  await expect(panneau.getByText(/Livraison refusée/)).toBeVisible();
  const apres = await (await page.request.get(`/api/articles/${article.id}`)).json();
  expect(apres.stock_actuel).toBe("0.000");
});

test("un achat à crédit exige un fournisseur du répertoire", async ({ page }) => {
  await connecter(page, "GESTIONNAIRE");
  const { nomArticle } = await preparer(page);

  await page.goto("/achats/nouveau");
  await page.getByRole("combobox", { name: "Fournisseur" }).fill("Vendeur du marché");
  await expect(page.getByText(/Hors répertoire/)).toBeVisible();
  await choisir(page, "Article", nomArticle, new RegExp(nomArticle));
  await page.getByRole("button", { name: "kg", exact: true }).click();
  await page.getByLabel("Quantité").fill("40");
  await page.getByLabel("Prix par kg").fill("300");
  await page.getByRole("button", { name: "Tout à crédit" }).click();
  await expect(page.getByText(/tout l'achat est à crédit/)).toBeVisible();

  await page.getByRole("button", { name: "Enregistrer l'achat" }).click();
  await expect(
    page.getByText(/Un achat à crédit exige un fournisseur du répertoire/),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/achats\/nouveau$/);

  // La saisie est gardée en brouillon : un rechargement la retrouve
  await page.reload();
  await expect(page.getByText("Votre saisie précédente a été reprise.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Article" })).toHaveValue(nomArticle);
  await page.getByRole("button", { name: "Recommencer à zéro" }).click();
  await expect(page.getByRole("combobox", { name: "Article" })).toHaveValue("");
});

for (const role of ["CONSULTANT", "SUPER_ADMIN"] as const) {
  test(`${role} : consulte les achats sans en saisir`, async ({ page }) => {
    await connecter(page, role);
    await page.goto("/achats");
    await expect(page.getByRole("heading", { level: 1, name: "Achats" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nouvel achat" })).toHaveCount(0);
    // Le répertoire des tiers, hors menu, reste accessible depuis les achats
    await expect(page.getByRole("link", { name: "Voir les fournisseurs" })).toBeVisible();

    await page.goto("/achats/nouveau");
    await expect(page.getByRole("heading", { level: 1, name: "Accès refusé" })).toBeVisible();
  });
}
