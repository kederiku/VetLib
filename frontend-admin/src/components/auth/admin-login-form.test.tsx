/**
 * Tests du formulaire de connexion au back-office.
 *
 * Trois comportements valent la peine d'etre verrouilles :
 *
 * 1. au succes, la reponse du login est rangee dans le cache de /me et le
 *    drapeau de session est pose -- sans quoi le tableau de bord refait un
 *    aller-retour reseau au montage, et /login relancerait une verification
 *    pour rien au passage suivant ;
 * 2. a l'echec, le formulaire RESTE ouvert avec un message : c'est la regle
 *    du projet -- inline quand l'utilisateur doit AGIR, toast quand on
 *    l'informe ;
 * 3. le message d'identifiants incorrects reste VOLONTAIREMENT flou (email OU
 *    mot de passe) : distinguer les deux revelerait quels comptes existent.
 *
 * On simule la couche HTTP (le mutator) et non le hook genere : la vraie
 * mutation TanStack est ainsi exercee, avec ses callbacks.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminLoginForm } from "@/components/auth/admin-login-form";
import { ApiError } from "@/lib/api/errors";
import { getGetCurrentAdminQueryKey } from "@/lib/api/generated/admin-auth/admin-auth";
import { getSessionHint } from "@/lib/auth/session-hint";
import { buildAdmin } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  reponse: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: simulations.push,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

/** Remplit les deux champs et soumet. */
async function seConnecter() {
  const utilisateur = userEvent.setup();
  await utilisateur.type(
    screen.getByLabelText("Email"),
    "fondateur@vetolib.fr",
  );
  await utilisateur.type(
    screen.getByLabelText("Mot de passe"),
    "phrase-de-passe",
  );
  await utilisateur.click(screen.getByRole("button", { name: "Se connecter" }));
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("AdminLoginForm — succès", () => {
  it("amorce le cache de session et redirige", async () => {
    const reponse = { status: 200, data: buildAdmin(), headers: new Headers() };
    simulations.reponse.mockResolvedValue(reponse);
    const queryClient = createTestQueryClient();
    renderWithProviders(<AdminLoginForm />, { queryClient });

    await seConnecter();

    await waitFor(() => {
      expect(simulations.push).toHaveBeenCalledWith("/tableau-de-bord");
    });
    // Le profil est deja en cache : le tableau de bord n'a pas besoin de
    // refaire un GET /me au montage.
    expect(queryClient.getQueryData(getGetCurrentAdminQueryKey())).toEqual(
      reponse,
    );
    expect(getSessionHint()).toBe(true);
  });
});

describe("AdminLoginForm — échec", () => {
  it("laisse le formulaire ouvert avec un message flou", async () => {
    simulations.reponse.mockRejectedValue(
      new ApiError({
        status: 401,
        code: "identity.invalid_credentials",
        detail: "Identifiants invalides.",
      }),
    );
    renderWithProviders(<AdminLoginForm />);

    await seConnecter();

    expect(
      await screen.findByText("Email ou mot de passe incorrect."),
    ).toBeInTheDocument();
    // Le formulaire reste la : l'utilisateur doit AGIR (corriger sa saisie).
    expect(
      screen.getByRole("button", { name: "Se connecter" }),
    ).toBeInTheDocument();
    expect(simulations.push).not.toHaveBeenCalled();
    expect(getSessionHint()).toBe(false);
  });

  it("annonce un accès révoqué sans ambiguïté", async () => {
    // Ici, au contraire du cas precedent, la personne connait son mot de
    // passe : le message doit lui dire quoi faire.
    simulations.reponse.mockRejectedValue(
      new ApiError({
        status: 403,
        code: "identity.admin_inactive",
        detail: "Accès révoqué.",
      }),
    );
    renderWithProviders(<AdminLoginForm />);

    await seConnecter();

    expect(await screen.findByText(/révoqué/)).toBeInTheDocument();
  });

  it("affiche un message réseau quand rien ne répond", async () => {
    simulations.reponse.mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithProviders(<AdminLoginForm />);

    await seConnecter();

    expect(
      await screen.findByText(/Impossible de contacter le serveur/),
    ).toBeInTheDocument();
  });
});

describe("AdminLoginForm — ce qu'il n'affiche PAS", () => {
  it("ne propose ni inscription ni mot de passe oublié", async () => {
    // Les deux seraient des liens morts : aucun endpoint d'inscription ni de
    // reinitialisation n'existe dans cet espace, et c'est delibere.
    renderWithProviders(<AdminLoginForm />);

    expect(screen.queryByText(/Pas encore de compte/)).not.toBeInTheDocument();
    expect(screen.queryByText(/oublié/)).not.toBeInTheDocument();
    // A la place, une phrase qui dit OU aller.
    expect(screen.getByText(/équipe technique/)).toBeInTheDocument();
  });
});
