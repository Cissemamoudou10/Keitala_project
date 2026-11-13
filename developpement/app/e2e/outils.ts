import { expect, type Page } from "@playwright/test";

/** Comptes créés par la commande API `comptes_e2e` (un par rôle). */
export const COMPTES = {
  SUPER_ADMIN: "e2e-super-admin@keitala.test",
  GESTIONNAIRE: "e2e-gestionnaire@keitala.test",
  CONSULTANT: "e2e-consultant@keitala.test",
} as const;

export type RoleE2E = keyof typeof COMPTES;

export function motDePasseE2E(): string {
  const valeur = process.env.E2E_MOT_DE_PASSE;
  if (!valeur) throw new Error("E2E_MOT_DE_PASSE manquant (voir .env.example).");
  return valeur;
}

/** Ouvre une session sans passer par l'écran : les cookies sont partagés avec la page. */
export async function connecter(page: Page, role: RoleE2E): Promise<void> {
  const reponse = await page.request.post("/api/auth/connexion", {
    data: { email: COMPTES[role], mot_de_passe: motDePasseE2E() },
  });
  expect(reponse.ok(), `connexion ${role} : ${reponse.status()}`).toBe(true);
}

export const estTablette = (largeur: number | undefined) => (largeur ?? 0) < 1024;

/** Ouvre le menu en tablette (tiroir) ; ne fait rien sur bureau. */
export async function ouvrirMenuSiTablette(page: Page, largeur: number | undefined) {
  if (estTablette(largeur)) await page.getByRole("button", { name: "Menu" }).click();
}
