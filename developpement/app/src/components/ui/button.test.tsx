import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("n'envoie pas le formulaire qui le contient, sauf s'il est déclaré « submit »", async () => {
    const envoi = vi.fn((evenement: React.FormEvent) => evenement.preventDefault());
    render(
      <form onSubmit={envoi}>
        <Button>Ajouter un article</Button>
        <Button type="submit">Enregistrer l&apos;achat</Button>
      </form>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Ajouter un article" }));
    expect(envoi).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Enregistrer l'achat" }));
    expect(envoi).toHaveBeenCalledOnce();
  });
});
