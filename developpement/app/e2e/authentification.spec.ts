import { expect, test } from "@playwright/test";

import { COMPTES, connecter, motDePasseE2E, ouvrirMenuSiTablette } from "./outils";

// Sprint 1 : connexion (US-AUTH-01), comptes (US-AUTH-02), droits par rôle (US-AUTH-03).

test("sans session, la page demandée s'ouvre après la connexion", async ({ page }) => {
  await page.goto("/ventes");
  await expect(page).toHaveURL(/\/connexion\?suite=%2Fventes$/);

  await page.getByLabel("Adresse email").fill(COMPTES.GESTIONNAIRE);
  await page.getByLabel("Mot de passe").fill(motDePasseE2E());
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page).toHaveURL(/\/ventes$/);
  await expect(page.getByRole("heading", { level: 1, name: "Ventes" })).toBeVisible();
});

test("des identifiants faux affichent un message clair et gardent la saisie", async ({ page }) => {
  await page.goto("/connexion");
  await page.getByLabel("Adresse email").fill(COMPTES.GESTIONNAIRE);
  await page.getByLabel("Mot de passe").fill("pas-le-bon-mot-de-passe");
  await page.getByRole("button", { name: "Se connecter" }).click();

  // Next ajoute son propre role="alert" (annonce des changements de page) : on cible le nôtre
  await expect(
    page.getByRole("alert").filter({ hasText: "Email ou mot de passe incorrect" }),
  ).toBeVisible();
  await expect(page.getByLabel("Adresse email")).toHaveValue(COMPTES.GESTIONNAIRE);
  await expect(page).toHaveURL(/\/connexion$/);
});

test("la déconnexion ferme la session", async ({ page, viewport }) => {
  await connecter(page, "GESTIONNAIRE");
  await page.goto("/tableau-de-bord");
  await ouvrirMenuSiTablette(page, viewport?.width);

  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/connexion$/);

  await page.goto("/stocks");
  await expect(page).toHaveURL(/\/connexion\?suite=%2Fstocks$/);
});

test("le Consultant ne voit pas l'administration et en est refusé", async ({ page, viewport }) => {
  await connecter(page, "CONSULTANT");
  await page.goto("/tableau-de-bord");
  await ouvrirMenuSiTablette(page, viewport?.width);

  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(navigation.getByRole("link", { name: "Ventes" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Administration" })).toHaveCount(0);
  // La barre latérale de bureau existe aussi, masquée, en tablette
  await expect(
    page.getByText("Consultant", { exact: true }).filter({ visible: true }),
  ).toBeVisible();

  await page.goto("/administration");
  await expect(page.getByRole("heading", { level: 1, name: "Accès refusé" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nouvel utilisateur" })).toHaveCount(0);
});

test("le Super Admin crée un compte puis le désactive", async ({ page }, infoTest) => {
  // Adresse unique : la base de développement garde les comptes d'un passage à l'autre
  const horodatage = Date.now();
  const email = `e2e-${infoTest.project.name}-${horodatage}@keitala.ml`;
  // Nom unique aussi : la liste contient les comptes des passages précédents
  const nom = `Mariam Coulibaly ${horodatage}`;
  await connecter(page, "SUPER_ADMIN");
  await page.goto("/administration");
  await expect(page.getByRole("heading", { level: 1, name: "Utilisateurs" })).toBeVisible();

  await page.getByRole("button", { name: "Nouvel utilisateur" }).click();
  const panneau = page.getByRole("dialog", { name: "Nouvel utilisateur" });
  await panneau.getByLabel("Nom complet").fill(nom);
  await panneau.getByLabel("Adresse email").fill(email);
  await panneau.getByLabel("Mot de passe").fill("mot-de-passe-provisoire");
  await panneau.getByRole("button", { name: "Créer le compte" }).click();

  await expect(page.getByText(`Compte de ${nom} créé`)).toBeVisible();
  await expect(panneau).toBeHidden();

  // Le nouveau compte peut se connecter
  const connexion = await page.request.post("/api/auth/connexion", {
    data: { email, mot_de_passe: "mot-de-passe-provisoire" },
  });
  expect(connexion.ok()).toBe(true);
  await connecter(page, "SUPER_ADMIN");

  // Désactivation depuis le panneau du compte
  await page.goto("/administration");
  await page.getByRole("button", { name: nom }).click();
  await page.getByRole("button", { name: "Désactiver le compte" }).click();
  await expect(page.getByText(`Compte de ${nom} désactivé`)).toBeVisible();

  const refus = await page.request.post("/api/auth/connexion", {
    data: { email, mot_de_passe: "mot-de-passe-provisoire" },
  });
  expect(refus.status()).toBe(403);
});

test("le Super Admin ne peut pas créer deux comptes avec le même email", async ({
  page,
}, infoTest) => {
  const email = `e2e-doublon-${infoTest.project.name}-${Date.now()}@keitala.ml`;
  await connecter(page, "SUPER_ADMIN");
  const premier = await page.request.post("/api/utilisateurs", {
    data: { nom_complet: "Premier", email, role: "CONSULTANT", mot_de_passe: "mot-de-passe-1" },
  });
  expect(premier.status()).toBe(201);
  await page.goto("/administration");

  await page.getByRole("button", { name: "Nouvel utilisateur" }).click();
  const panneau = page.getByRole("dialog", { name: "Nouvel utilisateur" });
  await panneau.getByLabel("Nom complet").fill("Doublon");
  await panneau.getByLabel("Adresse email").fill(email.toUpperCase());
  await panneau.getByLabel("Mot de passe").fill("mot-de-passe-provisoire");
  await panneau.getByRole("button", { name: "Créer le compte" }).click();

  // Message sous le champ concerné, formulaire conservé
  await expect(panneau.getByText(/est déjà utilisée par un autre compte/)).toBeVisible();
  await expect(panneau.getByLabel("Nom complet")).toHaveValue("Doublon");
});
