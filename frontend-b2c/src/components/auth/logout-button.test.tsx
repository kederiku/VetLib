/**
 * Tests du bouton de déconnexion.
 *
 * Le point important est le comportement en cas d'ÉCHEC. Les cookies de
 * session sont HttpOnly : seul le serveur peut les effacer. Si l'appel échoue,
 * la session est donc toujours ouverte — rediriger vers la page de connexion
 * ferait croire à une déconnexion qui n'a pas eu lieu, et laisserait un compte
 * accessible sur un poste partagé. Le composant affiche l'échec et reste sur
 * place : ce test verrouille exactement cela.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LogoutButton } from "@/components/auth/logout-button";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { buildOwner } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ replace: vi.fn(), reponse: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: simulations.replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/mon-compte",
  useSearchParams: () => new URLSearchParams(),
}));

// On simule la couche HTTP plutôt que le hook : la vraie mutation TanStack
// est alors exercée, y compris son onSuccess (navigation + purge du cache).
vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("LogoutButton — déconnexion réussie", () => {
  it("renvoie vers la connexion et purge la session du cache", async () => {
    // Purger le cache est indispensable : sans cela, revenir en arrière
    // afficherait les données de la personne précédente.
    simulations.reponse.mockResolvedValue({ status: 204, data: undefined });
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(getGetCurrentOwnerQueryKey(), {
      status: 200,
      data: buildOwner(),
      headers: new Headers(),
    });
    renderWithProviders(<LogoutButton />, { queryClient });

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Se déconnecter/ }));

    await waitFor(() =>
      expect(simulations.replace).toHaveBeenCalledWith("/login"),
    );
    expect(
      queryClient.getQueryData(getGetCurrentOwnerQueryKey()),
    ).toBeUndefined();
  });
});

describe("LogoutButton — échec", () => {
  it("ne prétend PAS avoir déconnecté", async () => {
    // Les cookies sont HttpOnly : sans réponse du serveur, la session est
    // toujours ouverte. Rediriger serait un mensonge dangereux sur un poste
    // partagé.
    simulations.reponse.mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithProviders(<LogoutButton />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Se déconnecter/ }));

    expect(
      await screen.findByText(/Déconnexion impossible/),
    ).toBeInTheDocument();
    expect(simulations.replace).not.toHaveBeenCalled();
  });

  it("laisse réessayer après un échec", async () => {
    simulations.reponse.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderWithProviders(<LogoutButton />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Se déconnecter/ }));
    await screen.findByText(/Déconnexion impossible/);

    simulations.reponse.mockResolvedValue({ status: 204, data: undefined });
    await user.click(screen.getByRole("button", { name: /Se déconnecter/ }));

    await waitFor(() =>
      expect(simulations.replace).toHaveBeenCalledWith("/login"),
    );
  });
});
