/**
 * Tests de l'inscription d'une clinique.
 *
 * Ce formulaire crée à la fois la clinique et son compte gérant — celui qui
 * aura tous les droits. Il enchaîne deux appels : créer, puis se connecter
 * aussitôt. Le cas dégradé mérite le test : si la création réussit mais que la
 * connexion échoue, la clinique EXISTE. Renvoyer vers la page de connexion est
 * la seule issue correcte ; afficher une erreur d'inscription pousserait à
 * recommencer et à buter sur un « email déjà utilisé » incompréhensible.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterClinicForm } from "@/components/auth/register-clinic-form";
import { ApiError } from "@/lib/api/errors";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import { getSessionHint } from "@/lib/auth/session-hint";
import { buildUser } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  inscrire: vi.fn(),
  connecter: vi.fn(),
  push: vi.fn(),
}));

// Deux modules distincts : la création de clinique vit dans « clinics », la
// connexion dans « auth ». Se tromper de module laisserait le vrai hook en
// place, et la soumission partirait pour de bon sur le réseau.
vi.mock("@/lib/api/generated/clinics/clinics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/generated/clinics/clinics")>()),
  useRegisterClinic: () => ({ mutateAsync: simulations.inscrire }),
}));

vi.mock("@/lib/api/generated/auth/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/generated/auth/auth")>()),
  useLogin: () => ({ mutateAsync: simulations.connecter }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: simulations.push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/register",
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * Remplit le formulaire avec des valeurs valides et le soumet.
 *
 * Les libellés sont donnés en toutes lettres : Testing Library fait un match
 * EXACT sur une chaîne, ce qui évite que « Nom » attrape aussi « Nom de la
 * clinique ».
 */
async function sInscrire(surcharges: Record<string, string> = {}) {
  const valeurs: Record<string, string> = {
    "Nom de la clinique": "Clinique des Peupliers",
    "Prénom": "Camille",
    "Nom": "Durand",
    "Email": "camille@peupliers.test",
    "Mot de passe": "motdepasse-tres-long",
    ...surcharges,
  };
  const user = userEvent.setup();
  for (const [libelle, valeur] of Object.entries(valeurs)) {
    if (valeur === "") continue;
    await user.type(screen.getByLabelText(libelle), valeur);
  }
  await user.click(screen.getByRole("button", { name: /Créer ma clinique/ }));
}

const reponse = () => ({ status: 200, data: buildUser(), headers: new Headers() });

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("RegisterClinicForm — validation locale", () => {
  it("applique la longueur minimale de la politique de mot de passe", async () => {
    // Le compte créé pilotera toute la clinique. La règle vient de
    // password-policy.ts, partagée avec le portail propriétaires : une seule
    // politique pour les deux espaces de comptes.
    renderWithProviders(<RegisterClinicForm />);
    await sInscrire({ "Mot de passe": "court" });

    const attendu = new RegExp(`au moins ${PASSWORD_MIN_LENGTH} caractères`);
    expect(await screen.findByText(attendu)).toBeInTheDocument();
    expect(simulations.inscrire).not.toHaveBeenCalled();
  });

  it("accepte une phrase de passe sans majuscule, chiffre ni caractère spécial", async () => {
    // Verrouille l'ABSENCE de règles de composition (NIST SP 800-63B) : le
    // formulaire ne doit rien exiger de plus que la longueur.
    simulations.inscrire.mockResolvedValue({ status: 201 });
    simulations.connecter.mockResolvedValue(reponse());
    renderWithProviders(<RegisterClinicForm />);
    await sInscrire({ "Mot de passe": "mon chat rex adore les croquettes" });

    await waitFor(() => expect(simulations.inscrire).toHaveBeenCalled());
  });

  it("refuse un email mal formé", async () => {
    renderWithProviders(<RegisterClinicForm />);
    await sInscrire({ Email: "pas-un-email" });

    expect(await screen.findByText("Adresse email invalide.")).toBeInTheDocument();
    expect(simulations.inscrire).not.toHaveBeenCalled();
  });
});

describe("RegisterClinicForm — inscription réussie", () => {
  it("crée la clinique puis connecte et pose le drapeau de session", async () => {
    simulations.inscrire.mockResolvedValue({ status: 201 });
    simulations.connecter.mockResolvedValue(reponse());
    renderWithProviders(<RegisterClinicForm />);
    await sInscrire();

    await waitFor(() => expect(simulations.inscrire).toHaveBeenCalled());
    await waitFor(() => expect(simulations.push).toHaveBeenCalledWith("/dashboard"));
    expect(getSessionHint()).toBe(true);
  });

  it("envoie un téléphone vide comme absent", async () => {
    simulations.inscrire.mockResolvedValue({ status: 201 });
    simulations.connecter.mockResolvedValue(reponse());
    renderWithProviders(<RegisterClinicForm />);
    await sInscrire();

    await waitFor(() =>
      expect(simulations.inscrire.mock.calls[0][0].data.phone).toBeNull(),
    );
  });
});

describe("RegisterClinicForm — cas dégradés", () => {
  it("place l'email déjà utilisé sous le champ email", async () => {
    simulations.inscrire.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "identity.email_already_exists",
        detail: "Email already registered",
      }),
    );
    renderWithProviders(<RegisterClinicForm />);
    await sInscrire();

    expect(await screen.findByText(/déjà utilisée/)).toBeInTheDocument();
    expect(simulations.connecter).not.toHaveBeenCalled();
  });

  it("renvoie vers la connexion si la clinique est créée mais la connexion échoue", async () => {
    // La clinique EXISTE : afficher une erreur d'inscription pousserait à
    // recommencer et à buter sur « email déjà utilisé ».
    simulations.inscrire.mockResolvedValue({ status: 201 });
    simulations.connecter.mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithProviders(<RegisterClinicForm />);
    await sInscrire();

    await waitFor(() => expect(simulations.push).toHaveBeenCalledWith("/login"));
  });
});
