import { expect, test } from "@playwright/test";

import { connecter } from "./outils";

// Sprint 2 : comptes de trésorerie (US-REF-03), catalogue et unités (US-STK-01, US-REF-02),
// clients et fournisseurs (US-REF-01). La base de développement est conservée d'un passage
// à l'autre : chaque parcours crée ses propres données, aux noms uniques.

const unique = (prefixe: string, projet: string) => `${prefixe} ${projet} ${Date.now()}`;
const sansEspacesInsecables = (texte: string | null) => (texte ?? "").replace(/ /g, " ");

test("le Super Admin ajoute un compte et saisit son solde d'ouverture", async ({
  page,
}, infoTest) => {
  const nom = unique("Banque test", infoTest.project.name);
  await connecter(page, "SUPER_ADMIN");
  await page.goto("/tresorerie");

  await page.getByRole("button", { name: "Nouveau compte" }).click();
  const panneau = page.getByRole("dialog", { name: "Nouveau compte" });
  await panneau.getByLabel("Nom du compte").fill(nom);
  await panneau.getByRole("button", { name: "Ajouter le compte" }).click();
  await expect(page.getByText(`Compte « ${nom} » ajouté`)).toBeVisible();

  const carte = page.getByRole("article").filter({ hasText: nom });
  await expect(carte.getByText("Solde d'ouverture à saisir")).toBeVisible();
  await carte.getByRole("button", { name: "Saisir le solde d'ouverture" }).click();
  await page.getByLabel("Solde réel aujourd'hui").fill("2030000");
  await page.getByRole("button", { name: "Vérifier le montant" }).click();

  // Confirmation en chiffres et en toutes lettres avant l'enregistrement définitif
  const confirmation = page.getByRole("dialog", { name: /Solde d'ouverture de/ });
  await expect(confirmation.getByText("Deux millions trente mille francs CFA")).toBeVisible();
  await confirmation.getByRole("button", { name: "Enregistrer le solde d'ouverture" }).click();

  await expect(page.getByText(`Solde d'ouverture de « ${nom} » enregistré`)).toBeVisible();
  expect(sansEspacesInsecables(await carte.textContent())).toContain("2 030 000 FCFA");
  await expect(carte.getByText("Solde d'ouverture à saisir")).toHaveCount(0);
});

test("le Gestionnaire consulte les comptes sans pouvoir les paramétrer", async ({ page }) => {
  await connecter(page, "GESTIONNAIRE");
  await page.goto("/tresorerie");

  await expect(page.getByRole("article").filter({ hasText: "Orange Money" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nouveau compte" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Modifier" })).toHaveCount(0);
});

test("le Gestionnaire crée un article et lui donne une unité de saisie", async ({
  page,
}, infoTest) => {
  const code = `E2E-${infoTest.project.name.toUpperCase()}-${Date.now()}`;
  await connecter(page, "GESTIONNAIRE");
  await page.goto("/stocks?famille=MATIERE_PREMIERE");

  await page.getByRole("button", { name: "Nouvel article" }).first().click();
  const panneau = page.getByRole("dialog", { name: "Nouvel article" });
  await panneau.getByLabel("Nom de l'article").fill("Arachide décortiquée");
  await panneau.getByLabel("Code article").fill(code);
  await panneau.getByLabel("Unité de base").fill("kg");
  await panneau.getByLabel("Seuil d'alerte").fill("100");
  await panneau.getByRole("button", { name: "Créer l'article" }).click();
  await expect(page.getByText("Article « Arachide décortiquée » créé")).toBeVisible();

  // On reste sur la fiche pour déclarer les unités de saisie
  const fiche = page.getByRole("dialog", { name: "Arachide décortiquée" });
  await fiche.getByRole("button", { name: "Ajouter une unité" }).click();
  await fiche.getByLabel("Nom de l'unité").fill("Sac 25 kg");
  await fiche.getByLabel("Valeur en kg").fill("25");
  await expect(fiche.getByText(/3\sSacs 25 kg = 75\skg/)).toBeVisible();
  await fiche.getByRole("button", { name: "Enregistrer les unités" }).click();
  await expect(page.getByText("Unités de saisie enregistrées")).toBeVisible();

  // Recherche sans accent ni majuscule
  await page.keyboard.press("Escape");
  await page.getByLabel("Chercher un article (nom ou code)").fill(code.toLowerCase());
  // Le code est unique (la base de développement garde les articles des passages précédents)
  await expect(page.getByRole("button", { name: new RegExp(code) })).toBeVisible();
  await expect(page.getByRole("button", { name: /Arachide décortiquée/ })).toHaveCount(1);
});

test("le Consultant consulte le catalogue sans action", async ({ page }) => {
  await connecter(page, "CONSULTANT");
  await page.goto("/stocks?recherche=gari");

  await page.getByRole("button", { name: /Gari 200 g/ }).click();
  const fiche = page.getByRole("dialog", { name: "Gari 200 g" });
  await expect(fiche.getByText("Unité de base")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nouvel article" })).toHaveCount(0);
  await expect(fiche.getByRole("button", { name: /Enregistrer/ })).toHaveCount(0);
});

test("un client semblable est signalé avant d'en créer un second", async ({ page }, infoTest) => {
  const nom = unique("Boutique Diarra", infoTest.project.name);
  await connecter(page, "GESTIONNAIRE");
  await page.goto("/ventes");
  await page.getByRole("link", { name: "Voir les clients" }).click();
  await expect(page).toHaveURL(/\/tiers\?type=client$/);

  const creer = async () => {
    await page.getByRole("button", { name: "Nouveau client" }).first().click();
    const panneau = page.getByRole("dialog", { name: "Nouveau client ou fournisseur" });
    await panneau.getByLabel("Nom").fill(nom);
    await panneau.getByRole("button", { name: "Ajouter" }).click();
    return panneau;
  };

  await creer();
  await expect(page.getByText(`${nom} ajouté`)).toBeVisible();

  const panneau = await creer();
  await expect(panneau.getByText("Un client ou fournisseur semblable existe déjà")).toBeVisible();
  await expect(panneau.getByRole("button", { name: "Ouvrir la fiche" })).toBeVisible();
  await panneau.getByRole("button", { name: "Non, en créer un nouveau" }).click();
  await expect(page.getByText(`${nom} ajouté`).first()).toBeVisible();
});
