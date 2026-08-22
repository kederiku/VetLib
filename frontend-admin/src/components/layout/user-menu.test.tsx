/**
 * Tests du menu utilisateur du header.
 *
 * Deux choses a verrouiller : les initiales (calculees a la main, donc
 * cassables) et le fait que le menu n'affiche NI role NI clinique. Cette
 * absence est une decision -- l'autorisation de cet espace est binaire -- et
 * un futur copier-coller depuis le portail clinique la reintroduirait sans y
 * penser.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UserMenu } from "@/components/layout/user-menu";
import { buildAdmin } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  useCurrentAdmin: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/lib/auth/use-current-admin", () => ({
  useCurrentAdmin: simulations.useCurrentAdmin,
}));

vi.mock("@/lib/auth/use-logout", () => ({
  useLogoutAction: () => ({ logout: simulations.logout, isPending: false }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("UserMenu", () => {
  it("ne rend rien tant que la session n'est pas résolue", () => {
    // Sous l'AuthGuard la session est deja resolue ; ce cas ne couvre que
    // l'instant de transition, ou afficher un avatar vide serait un
    // scintillement inutile.
    simulations.useCurrentAdmin.mockReturnValue({ data: undefined });

    renderWithProviders(<UserMenu />);

    expect(
      screen.queryByRole("button", { name: "Menu du compte" }),
    ).not.toBeInTheDocument();
  });

  it("affiche les initiales du compte", () => {
    simulations.useCurrentAdmin.mockReturnValue({
      data: buildAdmin({ first_name: "Ana", last_name: "Martin" }),
    });

    renderWithProviders(<UserMenu />);

    expect(screen.getByText("AM")).toBeInTheDocument();
  });

  it("montre l'identité mais NI rôle NI clinique", async () => {
    simulations.useCurrentAdmin.mockReturnValue({
      data: buildAdmin({
        first_name: "Ana",
        last_name: "Martin",
        email: "ana@vetolib.fr",
      }),
    });
    renderWithProviders(<UserMenu />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Menu du compte" }));

    expect(await screen.findByText("Ana Martin")).toBeInTheDocument();
    expect(screen.getByText("ana@vetolib.fr")).toBeInTheDocument();
    expect(
      screen.getByText("Administrateur de la plateforme"),
    ).toBeInTheDocument();
    // Ni "Gérant", ni un nom de clinique : cet espace n'a pas de rôle.
    expect(screen.queryByText(/Gérant/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Clinique/)).not.toBeInTheDocument();
  });

  it("déclenche la déconnexion", async () => {
    simulations.useCurrentAdmin.mockReturnValue({ data: buildAdmin() });
    renderWithProviders(<UserMenu />);
    const utilisateur = userEvent.setup();

    await utilisateur.click(
      screen.getByRole("button", { name: "Menu du compte" }),
    );
    await utilisateur.click(await screen.findByText("Se déconnecter"));

    expect(simulations.logout).toHaveBeenCalled();
  });
});
