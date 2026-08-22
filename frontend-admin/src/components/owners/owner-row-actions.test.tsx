/**
 * Tests du menu d'actions d'un propriétaire.
 *
 * Deux propriétés valent d'être verrouillées :
 *
 * 1. l'action proposée dépend du statut — « Retirer l'accès » n'apparaît pas
 *    sur un compte déjà désactivé. Une action désactivée qu'on ne peut pas
 *    exécuter est du bruit ; une action absente est une information ;
 * 2. le menu ne propose NI suppression NI changement d'email. Le projet est
 *    en soft delete intégral, et l'email est l'identifiant de connexion du
 *    client : un test l'affirme, parce qu'un ajout par mégarde ne se verrait
 *    pas en relecture.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OwnerRowActions } from "@/components/owners/owner-row-actions";
import { buildOwnerSummary } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ reponse: vi.fn() }));

vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

async function ouvrirLeMenu(actif: boolean) {
  const utilisateur = userEvent.setup();
  const proprietaire = buildOwnerSummary({ is_active: actif });
  renderWithProviders(<OwnerRowActions proprietaire={proprietaire} />);
  await utilisateur.click(
    screen.getByRole("button", { name: "Actions pour Claire Martin" }),
  );
  return { utilisateur, proprietaire };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("OwnerRowActions", () => {
  it("propose de retirer l'accès d'un compte actif, jamais de le rétablir", async () => {
    await ouvrirLeMenu(true);

    expect(
      await screen.findByRole("menuitem", { name: /retirer l'accès/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /rétablir/i }),
    ).not.toBeInTheDocument();
  });

  it("propose de rétablir l'accès d'un compte désactivé, jamais de le retirer", async () => {
    await ouvrirLeMenu(false);

    expect(
      await screen.findByRole("menuitem", { name: /rétablir l'accès/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /retirer/i }),
    ).not.toBeInTheDocument();
  });

  it("ne propose ni suppression ni changement d'email", async () => {
    await ouvrirLeMenu(true);
    await screen.findByRole("menuitem", { name: /modifier la fiche/i });

    for (const interdit of [/supprimer/i, /effacer/i, /email/i]) {
      expect(
        screen.queryByRole("menuitem", { name: interdit }),
      ).not.toBeInTheDocument();
    }
  });

  it("confirme avant de couper l'accès, puis appelle la désactivation", async () => {
    simulations.reponse.mockResolvedValue({
      status: 200,
      data: buildOwnerSummary({ is_active: false }),
      headers: new Headers(),
    });
    const { utilisateur, proprietaire } = await ouvrirLeMenu(true);

    await utilisateur.click(
      await screen.findByRole("menuitem", { name: /retirer l'accès/i }),
    );
    // Confirmation SIMPLE (pas de saisie du nom) : l'action est réversible
    // et ne touche qu'une personne -- contrairement à la suspension d'une
    // clinique, qui coupe N accès d'un coup.
    const confirmation = await screen.findByRole("alertdialog");
    expect(confirmation).toHaveTextContent(
      "Retirer l'accès de Claire Martin ?",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await utilisateur.click(
      screen.getByRole("button", { name: "Retirer l'accès" }),
    );

    await waitFor(() => {
      expect(simulations.reponse).toHaveBeenCalledOnce();
    });
    const [url, options] = simulations.reponse.mock.calls[0] as [
      string,
      { method: string },
    ];
    expect(url).toContain(`/api/v1/admin/owners/${proprietaire.id}/deactivate`);
    expect(options.method).toBe("POST");
  });
});
