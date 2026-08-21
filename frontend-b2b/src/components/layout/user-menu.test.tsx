/**
 * Tests du menu du compte.
 *
 * Il condense l'identité de la personne connectée — initiales, nom, rôle,
 * email — et la déconnexion. L'email a son utilité propre : sur un poste
 * d'accueil partagé, c'est ce qui permet de vérifier d'un coup d'oeil qui est
 * réellement connecté avant d'agir sur un dossier.
 *
 * Le contenu du menu est rendu dans un portail, hors de l'arbre du composant :
 * on interroge donc l'écran entier, jamais le conteneur du rendu.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserMenu } from "@/components/layout/user-menu";
import { getGetCurrentUserQueryKey } from "@/lib/api/generated/auth/auth";
import { buildUser } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ logout: vi.fn(), isPending: false }));

// La déconnexion enchaîne mutation, navigation et notification : elle a ses
// propres tests. Ici on vérifie seulement que le menu la déclenche.
vi.mock("@/lib/auth/use-logout", () => ({
  useLogoutAction: () => ({
    logout: simulations.logout,
    isPending: simulations.isPending,
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function afficher(surcharges: Record<string, unknown> = {}) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(getGetCurrentUserQueryKey(), {
    status: 200,
    data: buildUser({
      first_name: "Camille",
      last_name: "Durand",
      email: "camille@peupliers.test",
      role: "manager",
      permissions: ["clinic:manage"],
      ...surcharges,
    }),
    headers: new Headers(),
  });
  return renderWithProviders(<UserMenu />, { queryClient });
}

beforeEach(() => {
  simulations.isPending = false;
  vi.clearAllMocks();
});

describe("UserMenu — déclencheur", () => {
  it("ne rend rien tant que la session n'est pas résolue", () => {
    // Afficher des initiales vides ou un avatar fantôme pendant le
    // chargement produirait un scintillement à chaque navigation.
    renderWithProviders(<UserMenu />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("affiche les initiales en majuscules", () => {
    afficher();
    expect(screen.getByText("CD")).toBeInTheDocument();
  });

  it("nomme le bouton pour les lecteurs d'écran", () => {
    // L'avatar seul n'a pas de texte : sans étiquette, le bouton serait
    // annoncé « bouton » et rien d'autre.
    afficher();
    expect(
      screen.getByRole("button", { name: "Menu du compte" }),
    ).toBeInTheDocument();
  });
});

describe("UserMenu — contenu du menu", () => {
  it("affiche identité, rôle et email", async () => {
    afficher();
    await userEvent.setup().click(screen.getByRole("button", { name: "Menu du compte" }));

    expect(await screen.findByText("Camille Durand")).toBeInTheDocument();
    expect(screen.getByText("camille@peupliers.test")).toBeInTheDocument();
    // Le rôle technique « manager » doit apparaître traduit. Il partage sa
    // ligne avec le nom de la clinique, d'où la recherche par motif.
    expect(screen.getByText(/^Gérant —/)).toBeInTheDocument();
  });

  it("propose les réglages au gérant", async () => {
    afficher();
    await userEvent.setup().click(screen.getByRole("button", { name: "Menu du compte" }));

    expect(await screen.findByText(/Réglages/)).toBeInTheDocument();
  });

  it("masque les réglages pour un rôle sans la permission", async () => {
    afficher({ role: "asv", permissions: ["appointment:read"] });
    await userEvent.setup().click(screen.getByRole("button", { name: "Menu du compte" }));

    // On attend d'abord que le menu soit ouvert, sinon l'absence serait
    // constatée sur un menu simplement pas encore monté.
    expect(await screen.findByText("Camille Durand")).toBeInTheDocument();
    expect(screen.queryByText(/Réglages/)).not.toBeInTheDocument();
  });

  it("traduit le rôle d'ASV", async () => {
    afficher({ role: "asv", permissions: [] });
    await userEvent.setup().click(screen.getByRole("button", { name: "Menu du compte" }));

    expect(await screen.findByText(/^ASV —/)).toBeInTheDocument();
  });
});

describe("UserMenu — déconnexion", () => {
  it("déclenche la déconnexion", async () => {
    afficher();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Menu du compte" }));
    await user.click(await screen.findByRole("menuitem", { name: /Se déconnecter/ }));

    expect(simulations.logout).toHaveBeenCalledOnce();
  });
});
