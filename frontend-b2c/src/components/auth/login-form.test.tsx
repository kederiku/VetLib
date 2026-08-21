/**
 * Tests du formulaire de connexion du portail propriétaires.
 *
 * Trois enchaînements y sont vérifiés, chacun invisible dans l'interface :
 * la validation locale avant tout appel réseau (inutile de solliciter le
 * serveur pour un email vide), le placement des erreurs renvoyées par le
 * serveur au bon endroit, et surtout l'AMORÇAGE DU CACHE après succès — sans
 * lui, la page du compte repartirait pour un aller-retour et afficherait un
 * écran de chargement juste après la connexion.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/components/auth/login-form";
import { ApiError } from "@/lib/api/errors";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { buildOwner } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api/generated/owner-auth/owner-auth", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/api/generated/owner-auth/owner-auth")
  >()),
  useOwnerLogin: () => ({ mutateAsync: simulations.mutateAsync }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: simulations.push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

/** Remplit et soumet le formulaire. */
async function seConnecter(
  email = "marie@example.test",
  motDePasse = "motdepasse",
) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Mot de passe"), motDePasse);
  await user.click(screen.getByRole("button", { name: /Se connecter|Connexion/ }));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("LoginForm — validation locale", () => {
  it("refuse un email mal formé sans appeler le serveur", async () => {
    // Économie d'un aller-retour, et retour immédiat pour l'utilisateur.
    renderWithProviders(<LoginForm />);
    await seConnecter("pas-un-email", "motdepasse");

    expect(await screen.findByText("Adresse email invalide.")).toBeInTheDocument();
    expect(simulations.mutateAsync).not.toHaveBeenCalled();
  });

  it("refuse un mot de passe vide sans appeler le serveur", async () => {
    renderWithProviders(<LoginForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "marie@example.test");
    await user.click(screen.getByRole("button", { name: /Se connecter|Connexion/ }));

    expect(
      await screen.findByText("Le mot de passe est requis."),
    ).toBeInTheDocument();
    expect(simulations.mutateAsync).not.toHaveBeenCalled();
  });
});

describe("LoginForm — connexion réussie", () => {
  it("transmet les identifiants saisis", async () => {
    simulations.mutateAsync.mockResolvedValue({
      status: 200,
      data: buildOwner(),
      headers: new Headers(),
    });
    renderWithProviders(<LoginForm />);
    await seConnecter();

    await waitFor(() =>
      expect(simulations.mutateAsync).toHaveBeenCalledWith({
        data: { email: "marie@example.test", password: "motdepasse" },
      }),
    );
  });

  it("amorce le cache de session puis navigue vers le compte", async () => {
    // Le point non évident : sans setQueryData, la page du compte
    // relancerait une requête et afficherait un écran de chargement juste
    // après la connexion.
    const reponse = { status: 200, data: buildOwner(), headers: new Headers() };
    simulations.mutateAsync.mockResolvedValue(reponse);
    const { queryClient } = renderWithProviders(<LoginForm />);
    await seConnecter();

    await waitFor(() => expect(simulations.push).toHaveBeenCalledWith("/account"));
    expect(queryClient.getQueryData(getGetCurrentOwnerQueryKey())).toEqual(
      reponse,
    );
  });
});

describe("LoginForm — erreurs du serveur", () => {
  it("affiche un message flou sur des identifiants invalides", async () => {
    // SÉCURITÉ : le message ne doit pas permettre de savoir si un compte
    // existe pour cette adresse. Il va donc dans le bandeau global, jamais
    // sous le champ email.
    simulations.mutateAsync.mockRejectedValue(
      new ApiError({
        status: 401,
        code: "identity.invalid_credentials",
        detail: "Invalid credentials",
      }),
    );
    renderWithProviders(<LoginForm />);
    await seConnecter();

    expect(
      await screen.findByText("Email ou mot de passe incorrect."),
    ).toBeInTheDocument();
    expect(simulations.push).not.toHaveBeenCalled();
  });

  it("signale un compte désactivé", async () => {
    simulations.mutateAsync.mockRejectedValue(
      new ApiError({
        status: 403,
        code: "identity.user_inactive",
        detail: "User inactive",
      }),
    );
    renderWithProviders(<LoginForm />);
    await seConnecter();

    expect(await screen.findByText("Ce compte est désactivé.")).toBeInTheDocument();
  });

  it("annonce une panne réseau sans jargon", async () => {
    simulations.mutateAsync.mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithProviders(<LoginForm />);
    await seConnecter();

    expect(
      await screen.findByText(/Impossible de contacter le serveur/),
    ).toBeInTheDocument();
  });

  it("laisse l'utilisateur retenter après un échec", async () => {
    // Les erreurs globales ne doivent pas bloquer la re-soumission :
    // sinon un échec réseau passager condamnerait le formulaire.
    simulations.mutateAsync.mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );
    renderWithProviders(<LoginForm />);
    await seConnecter();
    await screen.findByText(/Impossible de contacter le serveur/);

    simulations.mutateAsync.mockResolvedValue({
      status: 200,
      data: buildOwner(),
      headers: new Headers(),
    });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Se connecter|Connexion/ }));

    await waitFor(() => expect(simulations.push).toHaveBeenCalledWith("/account"));
  });
});
