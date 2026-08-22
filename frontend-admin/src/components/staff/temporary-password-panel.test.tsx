/**
 * Tests du panneau de remise du mot de passe temporaire.
 *
 * Ce panneau est le seul endroit du produit où ce secret est lisible : s'il
 * s'affiche mal, le compte créé est inutilisable et il faut le
 * réinitialiser. Deux choses comptent donc — que le mot de passe soit bien
 * là, et que le bouton « copier » se comporte correctement, y compris quand
 * le navigateur REFUSE l'accès au presse-papiers (contexte non sécurisé,
 * permission), cas où l'utilisateur doit être averti au lieu de croire que
 * c'est copié.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TemporaryPasswordPanel } from "@/components/staff/temporary-password-panel";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  succes: vi.fn(),
  erreur: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: simulations.succes, error: simulations.erreur },
}));

const COMPTE = {
  user_id: "00000000-0000-0000-0000-0000000000e1",
  email: "claire.martin@lilas.fr",
  role: "manager" as const,
  temporary_password: "orage-tulipe-galet-fresque-avoine",
};

/** jsdom n'a pas de presse-papiers : on en pose un, contrôlable par test. */
function poserPressePapiers(ecrire: () => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(ecrire) },
    configurable: true,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("TemporaryPasswordPanel", () => {
  it("affiche l'identifiant, le mot de passe et l'avertissement", () => {
    renderWithProviders(
      <TemporaryPasswordPanel compte={COMPTE} prefixeId="test" />,
    );

    expect(screen.getByLabelText("Identifiant")).toHaveValue(COMPTE.email);
    expect(screen.getByLabelText("Mot de passe temporaire")).toHaveValue(
      COMPTE.temporary_password,
    );
    expect(screen.getByText(/ne sera plus affiché/i)).toBeInTheDocument();
  });

  it("copie le mot de passe et le confirme", async () => {
    const utilisateur = userEvent.setup();
    poserPressePapiers(() => Promise.resolve());
    renderWithProviders(
      <TemporaryPasswordPanel compte={COMPTE} prefixeId="test" />,
    );

    await utilisateur.click(
      screen.getByRole("button", { name: "Copier le mot de passe" }),
    );

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      COMPTE.temporary_password,
    );
    await waitFor(() => {
      expect(simulations.succes).toHaveBeenCalledOnce();
    });
  });

  it("avertit quand le navigateur refuse le presse-papiers", async () => {
    const utilisateur = userEvent.setup();
    poserPressePapiers(() => Promise.reject(new Error("refusé")));
    renderWithProviders(
      <TemporaryPasswordPanel compte={COMPTE} prefixeId="test" />,
    );

    await utilisateur.click(
      screen.getByRole("button", { name: "Copier le mot de passe" }),
    );

    // Le champ reste sélectionnable à la main : le message doit le dire,
    // plutôt que de laisser croire à une copie réussie.
    await waitFor(() => {
      expect(simulations.erreur).toHaveBeenCalledOnce();
    });
    expect(simulations.succes).not.toHaveBeenCalled();
  });
});
