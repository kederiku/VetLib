/**
 * Tests du dialogue de changement de rôle.
 *
 * Trois points :
 *
 * 1. le bouton reste inerte tant que le rôle n'a pas changé — enregistrer
 *    « manager → manager » enverrait une requête et une ligne d'audit pour
 *    rien ;
 * 2. le délai d'effet est ANNONCÉ. Le portail clinique lit les permissions
 *    dans le jeton d'accès (15 minutes) : taire ce décalage produit un
 *    ticket de support par semaine ;
 * 3. un refus du backend (dernier gérant d'une clinique) s'affiche DANS le
 *    dialogue, qui reste ouvert : l'utilisateur doit agir, c'est la règle
 *    inline/toast du projet.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaffRoleDialog } from "@/components/staff/staff-role-dialog";
import { ApiError } from "@/lib/api/errors";
import { buildStaffSummary } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ reponse: vi.fn() }));

vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

const MEMBRE = buildStaffSummary({ role: "manager" });

function afficher(onOpenChange = vi.fn()) {
  renderWithProviders(
    <StaffRoleDialog membre={MEMBRE} open onOpenChange={onOpenChange} />,
  );
  return { onOpenChange, utilisateur: userEvent.setup() };
}

/** Ouvre le sélecteur et choisit un rôle. */
async function choisirRole(
  utilisateur: ReturnType<typeof userEvent.setup>,
  libelle: string,
) {
  await utilisateur.click(screen.getByRole("combobox"));
  await utilisateur.click(await screen.findByRole("option", { name: libelle }));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("StaffRoleDialog", () => {
  it("annonce que le changement n'est pas immédiat pour la personne", () => {
    afficher();
    expect(screen.getByText(/15 minutes/)).toBeInTheDocument();
  });

  it("garde le bouton inerte tant que le rôle n'a pas changé", async () => {
    const { utilisateur } = afficher();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();

    await choisirRole(utilisateur, "ASV");
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeEnabled();
  });

  it("envoie le nouveau rôle puis referme", async () => {
    simulations.reponse.mockResolvedValue({
      status: 200,
      data: { ...MEMBRE, role: "asv" },
      headers: new Headers(),
    });
    const { utilisateur, onOpenChange } = afficher();

    await choisirRole(utilisateur, "ASV");
    await utilisateur.click(
      screen.getByRole("button", { name: "Enregistrer" }),
    );

    await waitFor(() => {
      expect(simulations.reponse).toHaveBeenCalledOnce();
    });
    const [url, options] = simulations.reponse.mock.calls[0] as [
      string,
      { method: string; body: string },
    ];
    expect(url).toContain(`/api/v1/admin/staff/${MEMBRE.id}/role`);
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body)).toEqual({ role: "asv" });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("affiche un refus du backend SANS fermer le dialogue", async () => {
    simulations.reponse.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "identity.last_manager",
        detail: "Cette clinique n'aurait plus aucun gérant actif.",
      }),
    );
    const { utilisateur, onOpenChange } = afficher();

    await choisirRole(utilisateur, "ASV");
    await utilisateur.click(
      screen.getByRole("button", { name: "Enregistrer" }),
    );

    expect(
      await screen.findByText(
        "Cette clinique n'aurait plus aucun gérant actif.",
      ),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
