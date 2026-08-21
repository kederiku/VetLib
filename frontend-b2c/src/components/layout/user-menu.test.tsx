/**
 * Tests du menu du compte.
 *
 * Il condense l'identité de la personne connectée — initiales, nom,
 * email — et la déconnexion, qui vivait auparavant dans une carte de la
 * page « Mon compte ». L'email a son utilité propre : sur un ordinateur
 * familial, c'est ce qui permet de vérifier d'un coup d'oeil quel compte
 * est réellement ouvert avant d'agir.
 *
 * Le contenu du menu est rendu dans un portail, hors de l'arbre du
 * composant : on interroge donc l'écran entier, jamais le conteneur du
 * rendu. Et findBy plutôt que getBy après le clic : Base UI monte le
 * portail de façon asynchrone.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserMenu } from "@/components/layout/user-menu";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { buildOwner } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ logout: vi.fn(), isPending: false }));

// La déconnexion enchaîne mutation, navigation et purge du cache : elle
// a ses propres tests. Ici on vérifie seulement que le menu la déclenche.
vi.mock("@/lib/auth/use-logout", () => ({
  useLogoutAction: () => ({
    logout: simulations.logout,
    isPending: simulations.isPending,
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/tableau-de-bord",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function afficher(surcharges: Parameters<typeof buildOwner>[0] = {}) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(getGetCurrentOwnerQueryKey(), {
    status: 200,
    data: buildOwner(surcharges),
    headers: new Headers(),
  });
  return renderWithProviders(<UserMenu />, { queryClient });
}

beforeEach(() => {
  simulations.logout.mockClear();
  simulations.isPending = false;
});

describe("UserMenu", () => {
  it("ne rend rien tant que la session n'est pas résolue", () => {
    // Un avatar aux initiales vides clignoterait le temps du GET /me.
    renderWithProviders(<UserMenu />);

    expect(
      screen.queryByRole("button", { name: "Menu du compte" }),
    ).not.toBeInTheDocument();
  });

  it("affiche les initiales du propriétaire, en majuscules", () => {
    afficher({ first_name: "marie", last_name: "dupont" });

    expect(screen.getByText("MD")).toBeInTheDocument();
  });

  it("porte un nom accessible : le déclencheur n'a aucun texte visible", () => {
    afficher();

    expect(
      screen.getByRole("button", { name: "Menu du compte" }),
    ).toBeInTheDocument();
  });

  it("montre qui est connecté, email compris", async () => {
    afficher({
      first_name: "Marie",
      last_name: "Dupont",
      email: "marie.dupont@example.test",
    });

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Menu du compte" }));

    expect(await screen.findByText("Marie Dupont")).toBeInTheDocument();
    expect(screen.getByText("marie.dupont@example.test")).toBeInTheDocument();
  });

  it("mène à la fiche du compte", async () => {
    afficher();

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Menu du compte" }));

    expect(await screen.findByText("Mon compte")).toBeInTheDocument();
  });

  it("déclenche la déconnexion", async () => {
    afficher();

    const utilisateur = userEvent.setup();
    await utilisateur.click(
      screen.getByRole("button", { name: "Menu du compte" }),
    );
    await utilisateur.click(await screen.findByText("Se déconnecter"));

    expect(simulations.logout).toHaveBeenCalledTimes(1);
  });
});
