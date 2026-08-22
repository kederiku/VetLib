/**
 * Tests du menu d'actions d'un membre du personnel.
 *
 * Symétrique de celui des propriétaires (voir `owner-row-actions.test.tsx`),
 * avec une action de plus : le changement de rôle. On vérifie surtout que
 * rien ici ne permet de SUPPRIMER un compte ni d'en changer l'email — le
 * projet est en soft delete intégral, et l'email est l'identifiant de
 * connexion.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaffRowActions } from "@/components/staff/staff-row-actions";
import { buildStaffSummary } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ reponse: vi.fn() }));

vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

async function ouvrirLeMenu(actif: boolean) {
  const utilisateur = userEvent.setup();
  const membre = buildStaffSummary({ is_active: actif });
  renderWithProviders(<StaffRowActions membre={membre} />);
  await utilisateur.click(
    screen.getByRole("button", { name: "Actions pour Claire Martin" }),
  );
  return { utilisateur, membre };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("StaffRowActions", () => {
  it("propose de changer le rôle et de retirer l'accès d'un compte actif", async () => {
    await ouvrirLeMenu(true);

    expect(
      await screen.findByRole("menuitem", { name: /changer le rôle/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /retirer l'accès/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /rétablir/i }),
    ).not.toBeInTheDocument();
  });

  it("propose de rétablir l'accès d'un compte désactivé", async () => {
    await ouvrirLeMenu(false);

    expect(
      await screen.findByRole("menuitem", { name: /rétablir l'accès/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /retirer/i }),
    ).not.toBeInTheDocument();
  });

  it("ne propose aucune suppression", async () => {
    await ouvrirLeMenu(true);
    await screen.findByRole("menuitem", { name: /changer le rôle/i });

    expect(
      screen.queryByRole("menuitem", { name: /supprimer/i }),
    ).not.toBeInTheDocument();
  });

  it("rétablit l'accès après confirmation", async () => {
    simulations.reponse.mockResolvedValue({
      status: 200,
      data: buildStaffSummary({ is_active: true }),
      headers: new Headers(),
    });
    const { utilisateur, membre } = await ouvrirLeMenu(false);

    await utilisateur.click(
      await screen.findByRole("menuitem", { name: /rétablir l'accès/i }),
    );
    await utilisateur.click(
      await screen.findByRole("button", { name: "Rétablir l'accès" }),
    );

    await waitFor(() => {
      expect(simulations.reponse).toHaveBeenCalledOnce();
    });
    const [url] = simulations.reponse.mock.calls[0] as [string];
    expect(url).toContain(`/api/v1/admin/staff/${membre.id}/activate`);
  });
});
