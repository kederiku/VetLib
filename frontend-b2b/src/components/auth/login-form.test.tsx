/**
 * Tests du formulaire de connexion de l'espace clinique.
 *
 * Il fait trois choses au-delà de l'appel réseau : amorcer le cache de session
 * pour que le tableau de bord s'affiche sans second aller-retour, POSER LE
 * DRAPEAU de session — sans lui, le prochain passage sur /login ne vérifierait
 * pas la session existante — et placer les erreurs du serveur au bon endroit.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/components/auth/login-form";
import { ApiError } from "@/lib/api/errors";
import { getGetCurrentUserQueryKey } from "@/lib/api/generated/auth/auth";
import { getSessionHint } from "@/lib/auth/session-hint";
import { buildUser } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ mutateAsync: vi.fn(), push: vi.fn() }));

vi.mock("@/lib/api/generated/auth/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/generated/auth/auth")>()),
  useLogin: () => ({ mutateAsync: simulations.mutateAsync }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: simulations.push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

async function seConnecter(email = "asv@peupliers.test", motDePasse = "motdepasse") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Mot de passe"), motDePasse);
  await user.click(screen.getByRole("button", { name: /Se connecter|Connexion/ }));
}

const reponse = () => ({
  status: 200,
  data: buildUser(),
  headers: new Headers(),
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("LoginForm — validation locale", () => {
  it("refuse un email mal formé sans appeler le serveur", async () => {
    renderWithProviders(<LoginForm />);
    await seConnecter("pas-un-email");

    expect(await screen.findByText("Adresse email invalide.")).toBeInTheDocument();
    expect(simulations.mutateAsync).not.toHaveBeenCalled();
  });
});

describe("LoginForm — connexion réussie", () => {
  it("transmet les identifiants et navigue vers le tableau de bord", async () => {
    simulations.mutateAsync.mockResolvedValue(reponse());
    renderWithProviders(<LoginForm />);
    await seConnecter();

    await waitFor(() =>
      expect(simulations.push).toHaveBeenCalledWith("/dashboard"),
    );
    expect(simulations.mutateAsync).toHaveBeenCalledWith({
      data: { email: "asv@peupliers.test", password: "motdepasse" },
    });
  });

  it("amorce le cache de session", async () => {
    // Sans cela, le tableau de bord repartirait pour un aller-retour et
    // afficherait un écran de chargement juste après la connexion.
    const attendue = reponse();
    simulations.mutateAsync.mockResolvedValue(attendue);
    const { queryClient } = renderWithProviders(<LoginForm />);
    await seConnecter();

    await waitFor(() =>
      expect(queryClient.getQueryData(getGetCurrentUserQueryKey())).toEqual(
        attendue,
      ),
    );
  });

  it("pose le drapeau de session", async () => {
    // C'est lui qui autorisera la prochaine visite de /login à vérifier la
    // session au lieu de partir du principe qu'il n'y en a pas.
    simulations.mutateAsync.mockResolvedValue(reponse());
    renderWithProviders(<LoginForm />);
    await seConnecter();

    await waitFor(() => expect(getSessionHint()).toBe(true));
  });
});

describe("LoginForm — erreurs du serveur", () => {
  it("reste flou sur des identifiants invalides", async () => {
    // SÉCURITÉ : ne jamais permettre de savoir si un compte existe pour
    // une adresse donnée.
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

  it("ne pose PAS le drapeau après un échec", async () => {
    // Un drapeau posé à tort ferait vérifier une session inexistante à
    // chaque passage sur /login.
    simulations.mutateAsync.mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithProviders(<LoginForm />);
    await seConnecter();

    await screen.findByText(/Impossible de contacter le serveur/);
    expect(getSessionHint()).toBe(false);
  });
});
