/**
 * Tests du formulaire d'inscription du portail propriétaires.
 *
 * Ce formulaire enchaîne DEUX appels : créer le compte, puis s'y connecter
 * aussitôt pour éviter au nouvel inscrit de resaisir ce qu'il vient de taper.
 * C'est cet enchaînement qui mérite d'être verrouillé, et surtout son cas
 * dégradé : si la création réussit mais que la connexion échoue, le compte
 * EXISTE. Renvoyer vers la page de connexion est alors la seule issue correcte
 * — afficher une erreur d'inscription pousserait la personne à recommencer et
 * à buter sur un « email déjà utilisé » incompréhensible.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RegisterOwnerForm } from "@/components/auth/register-owner-form";
import { ApiError } from "@/lib/api/errors";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { buildOwner } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  inscrire: vi.fn(),
  connecter: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api/generated/owner-auth/owner-auth", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/api/generated/owner-auth/owner-auth")
  >()),
  useRegisterOwner: () => ({ mutateAsync: simulations.inscrire }),
  useOwnerLogin: () => ({ mutateAsync: simulations.connecter }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: simulations.push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/register",
  useSearchParams: () => new URLSearchParams(),
}));

/** Remplit le formulaire avec des valeurs valides et le soumet. */
async function sInscrire(surcharges: Record<string, string> = {}) {
  const valeurs = {
    Prénom: "Marie",
    Nom: "Dupont",
    Email: "marie@example.test",
    "Mot de passe": "motdepasse-long",
    ...surcharges,
  };
  const user = userEvent.setup();
  for (const [libelle, valeur] of Object.entries(valeurs)) {
    if (valeur === "") continue;
    await user.type(screen.getByLabelText(new RegExp(`^${libelle}`)), valeur);
  }
  await user.click(screen.getByRole("button", { name: /Créer mon compte/ }));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("RegisterOwnerForm — validation locale", () => {
  it("exige un mot de passe d'au moins douze caractères", async () => {
    renderWithProviders(<RegisterOwnerForm />);
    await sInscrire({ "Mot de passe": "court" });

    expect(
      await screen.findByText(/au moins 12 caractères/),
    ).toBeInTheDocument();
    expect(simulations.inscrire).not.toHaveBeenCalled();
  });

  it("refuse un email mal formé", async () => {
    renderWithProviders(<RegisterOwnerForm />);
    await sInscrire({ Email: "pas-un-email" });

    expect(await screen.findByText("Adresse email invalide.")).toBeInTheDocument();
    expect(simulations.inscrire).not.toHaveBeenCalled();
  });
});

describe("RegisterOwnerForm — inscription réussie", () => {
  it("crée le compte puis connecte et amorce le cache", async () => {
    const reponse = { status: 200, data: buildOwner(), headers: new Headers() };
    simulations.inscrire.mockResolvedValue({ status: 201 });
    simulations.connecter.mockResolvedValue(reponse);
    const { queryClient } = renderWithProviders(<RegisterOwnerForm />);
    await sInscrire();

    await waitFor(() => expect(simulations.push).toHaveBeenCalledWith("/account"));
    expect(simulations.connecter).toHaveBeenCalledWith({
      data: { email: "marie@example.test", password: "motdepasse-long" },
    });
    expect(queryClient.getQueryData(getGetCurrentOwnerQueryKey())).toEqual(
      reponse,
    );
  });

  it("envoie un téléphone vide comme absent", async () => {
    // Chaîne vide et absence n'ont pas le même sens côté backend : le
    // champ facultatif doit partir à null, pas à "".
    simulations.inscrire.mockResolvedValue({ status: 201 });
    simulations.connecter.mockResolvedValue({
      status: 200,
      data: buildOwner(),
      headers: new Headers(),
    });
    renderWithProviders(<RegisterOwnerForm />);
    await sInscrire();

    await waitFor(() => {
      expect(simulations.inscrire.mock.calls[0][0].data.phone).toBeNull();
    });
  });
});

describe("RegisterOwnerForm — cas dégradés", () => {
  it("place l'email déjà utilisé sous le champ email", async () => {
    simulations.inscrire.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "identity.email_already_exists",
        detail: "Email already registered",
      }),
    );
    renderWithProviders(<RegisterOwnerForm />);
    await sInscrire();

    expect(
      await screen.findByText("Cette adresse email est déjà utilisée."),
    ).toBeInTheDocument();
    expect(simulations.connecter).not.toHaveBeenCalled();
  });

  it("renvoie vers la connexion si le compte est créé mais la connexion échoue", async () => {
    // Le compte EXISTE : afficher une erreur d'inscription pousserait la
    // personne à recommencer et à buter sur « email déjà utilisé ».
    simulations.inscrire.mockResolvedValue({ status: 201 });
    simulations.connecter.mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithProviders(<RegisterOwnerForm />);
    await sInscrire();

    await waitFor(() => expect(simulations.push).toHaveBeenCalledWith("/login"));
  });

  it("annonce une panne réseau à la création", async () => {
    simulations.inscrire.mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithProviders(<RegisterOwnerForm />);
    await sInscrire();

    expect(
      await screen.findByText(/Impossible de contacter le serveur/),
    ).toBeInTheDocument();
    expect(simulations.push).not.toHaveBeenCalled();
  });
});
