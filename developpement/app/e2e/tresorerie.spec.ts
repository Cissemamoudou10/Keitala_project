import { expect, test } from "@playwright/test";

import { connecter } from "./outils";

// Sprint 6 : journal, dépenses, transferts, clôture, contrôle (US-TRES-01 à 05).
// Paiements sur le compte bancaire : il peut être à découvert (D-030).

const visible = (texte: string | null) => (texte ?? "").replace(/[  ]/g, " ");
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function choisir(page: import("@playwright/test").Page, libelle: string, option: string) {
  await page.getByRole("combobox", { name: libelle }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("dépense saisie, retrouvée au journal, puis annulée", async ({ page }) => {
  await connecter(page, "GESTIONNAIRE");
  const designation = `Carburant livraison ${unique()}`;

  await page.goto("/tresorerie/depenses");
  await page.getByRole("button", { name: "Nouvelle dépense" }).click();
  const panneau = page.getByRole("dialog", { name: "Nouvelle dépense" });
  await panneau.getByRole("button", { name: "Enregistrer la dépense" }).click();
  await expect(panneau.getByText("Choisissez la catégorie.")).toBeVisible();

  await choisir(page, "Catégorie", "Carburant / Transport");
  await panneau.getByLabel("Désignation").fill(designation);
  await panneau.getByLabel("Montant").fill("2500");
  await choisir(page, "Payé par", "Compte Bancaire");
  await expect(panneau.getByText(/Solde après/)).toBeVisible();
  await panneau.getByLabel("Pièce justificative").fill("Reçu 88");
  await panneau.getByRole("button", { name: "Enregistrer la dépense" }).click();

  const detail = page.getByRole("dialog", { name: /Dépense DEP-/ });
  await expect(detail.getByText(designation)).toBeVisible();
  await expect(detail.getByText("À contrôler")).toBeVisible();
  const numero = visible(await detail.getByRole("heading").first().textContent()).replace(
    "Dépense ",
    "",
  );

  // Au journal du compte bancaire, avec sa pièce d'origine
  const comptes = await (await page.request.get("/api/tresorerie/comptes")).json();
  const banque = comptes.find((c: { code: string }) => c.code === "BANQUE");
  await page.goto(`/tresorerie/journal?compte=${banque.id}`);
  await expect(page.getByText(new RegExp(`Dépense · ${numero}`)).first()).toBeVisible();

  // Annulation : le montant revient sur le compte
  await page.goto(`/tresorerie/depenses?recherche=${encodeURIComponent(designation)}`);
  await page.getByRole("button", { name: numero }).click();
  await page.getByRole("button", { name: "Annuler la dépense" }).click();
  const fenetre = page.getByRole("dialog", { name: /Annuler la dépense DEP-/ });
  expect(visible(await fenetre.textContent())).toContain(
    "Les 2 500 FCFA reviendront sur « Compte Bancaire »",
  );
  await fenetre.getByLabel("Motif").fill("Saisie en double");
  await fenetre.getByRole("button", { name: "Annuler la dépense" }).click();
  await expect(page.getByText(/Annulée le .* : Saisie en double/)).toBeVisible();
});

test("une grosse dépense est relue en toutes lettres", async ({ page }) => {
  await connecter(page, "GESTIONNAIRE");
  await page.goto("/tresorerie/depenses");
  await page.getByRole("button", { name: "Nouvelle dépense" }).click();
  const panneau = page.getByRole("dialog", { name: "Nouvelle dépense" });
  await choisir(page, "Catégorie", "Entretien & Réparations");
  await panneau.getByLabel("Désignation").fill(`Réparation décortiqueuse ${unique()}`);
  await panneau.getByLabel("Montant").fill("2500000");
  await expect(panneau.getByLabel("Montant")).toHaveValue(/2\s500\s000/);
  await choisir(page, "Payé par", "Compte Bancaire");
  await panneau.getByRole("button", { name: "Enregistrer la dépense" }).click();

  const confirmation = page.getByRole("dialog", { name: /Confirmer une dépense de/ });
  await expect(confirmation.getByText("Deux millions cinq cent mille francs CFA")).toBeVisible();
  await confirmation.getByRole("button", { name: "Corriger" }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(panneau.getByLabel("Montant")).toHaveValue(/2\s500\s000/);
});

test("transfert entre deux comptes, visible des deux côtés", async ({ page }) => {
  await connecter(page, "GESTIONNAIRE");
  const libelle = `Dépôt Wave ${unique()}`;

  await page.goto("/tresorerie/transferts");
  await page.getByRole("button", { name: "Nouveau transfert" }).click();
  const panneau = page.getByRole("dialog", { name: "Nouveau transfert" });
  await choisir(page, "De", "Compte Bancaire");
  await choisir(page, "Vers", "Wave");
  await panneau.getByLabel("Montant").fill("1000");
  await panneau.getByLabel("Libellé").fill(libelle);
  await panneau.getByRole("button", { name: "Enregistrer le transfert" }).click();

  await expect(page.getByText(/Transfert TRF-.* enregistré/).first()).toBeVisible();
  // Le libellé n'est affiché qu'en bureau : on reconnaît la ligne à ses deux comptes
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: /Compte Bancaire.*Wave/ })
      .first(),
  ).toBeVisible();
  await page.goto("/tresorerie/journal");
  await expect(page.getByText(/Compte Bancaire → Wave/).first()).toBeVisible();
});

test("clôture avec écart, puis contrôlée par le Super Admin", async ({ page }) => {
  // Un compte propre au passage : une seule clôture par compte et par jour
  const nom = `Caisse atelier ${unique()}`;
  await connecter(page, "SUPER_ADMIN");
  const creation = await page.request.post("/api/tresorerie/comptes", {
    data: { nom, type: "CAISSE" },
  });
  expect(creation.status()).toBe(201);

  await connecter(page, "GESTIONNAIRE");
  await page.goto("/tresorerie/clotures");
  await page.getByRole("button", { name: "Clôturer la journée" }).click();
  const panneau = page.getByRole("dialog", { name: "Clôturer la journée" });
  await choisir(page, "Compte", nom);
  const recap = panneau.getByRole("region", { name: "Récapitulatif du jour" });
  expect(visible(await recap.textContent())).toContain("= Solde théorique0 FCFA");
  await panneau.getByLabel("Montant compté").fill("500");
  await expect(panneau.getByText(/Excédent de 500\sFCFA/)).toBeVisible();
  await panneau.getByRole("button", { name: "Clôturer" }).click();
  await expect(panneau.getByText(/Expliquez l'écart/)).toBeVisible();
  await panneau.getByLabel("Commentaire").fill("Pièces retrouvées dans le tiroir");
  await panneau.getByRole("button", { name: "Clôturer" }).click();
  await expect(page.getByText(new RegExp(`« ${nom} » clôturé`)).first()).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(nom) })).toContainText(
    /Excédent 500\sFCFA/,
  );

  // Contrôle a posteriori
  await connecter(page, "SUPER_ADMIN");
  await page.goto("/administration/controles?type=cloture");
  const ligne = page.getByRole("row", { name: new RegExp(nom) });
  await expect(ligne).toContainText("écart de +500");
  await ligne.getByRole("button", { name: /Marquer .* comme contrôlé/ }).click();
  await expect(page.getByRole("row", { name: new RegExp(nom) })).toHaveCount(0);
});

test("le Consultant consulte la trésorerie sans rien saisir ni contrôler", async ({ page }) => {
  await connecter(page, "CONSULTANT");
  await page.goto("/tresorerie");
  await expect(page.getByText("Solde global")).toBeVisible();
  for (const [adresse, bouton] of [
    ["/tresorerie/depenses", "Nouvelle dépense"],
    ["/tresorerie/transferts", "Nouveau transfert"],
    ["/tresorerie/clotures", "Clôturer la journée"],
  ]) {
    await page.goto(adresse);
    await expect(page.getByRole("heading", { level: 1, name: "Trésorerie" })).toBeVisible();
    await expect(page.getByRole("button", { name: bouton })).toHaveCount(0);
  }
  await page.goto("/administration/controles");
  await expect(page.getByRole("heading", { level: 1, name: "Accès refusé" })).toBeVisible();
});
