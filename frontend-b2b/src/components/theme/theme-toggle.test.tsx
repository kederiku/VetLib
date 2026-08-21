/**
 * Tests du sélecteur de thème.
 *
 * Trois choix, dont « Système » qui suit la préférence du poste. Le composant
 * garde les deux icônes dans le balisage en permanence — c'est une parade au
 * scintillement d'hydratation, le serveur ne connaissant pas le thème du
 * visiteur — et c'est le CSS qui n'en montre qu'une. Ce test le vérifie, car
 * un remaniement « propre » qui rendrait l'icône conditionnellement
 * réintroduirait le défaut.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ setTheme: vi.fn() }));

vi.mock("next-themes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-themes")>()),
  useTheme: () => ({ setTheme: simulations.setTheme, theme: "light" }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("ThemeToggle", () => {
  it("nomme son bouton pour les lecteurs d'écran", () => {
    // Le bouton n'affiche qu'une icône : sans étiquette, il serait annoncé
    // « bouton » et rien d'autre.
    renderWithProviders(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: "Changer de thème" }),
    ).toBeInTheDocument();
  });

  it("garde les deux icônes dans le balisage", () => {
    // Parade au scintillement : le serveur ignore le thème du visiteur.
    // Rendre une seule icône selon le thème créerait un écart entre le
    // rendu serveur et le rendu client.
    const { container } = renderWithProviders(<ThemeToggle />);

    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });

  it("propose les trois choix", async () => {
    renderWithProviders(<ThemeToggle />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Changer de thème" }));

    expect(await screen.findByText("Clair")).toBeInTheDocument();
    expect(screen.getByText("Sombre")).toBeInTheDocument();
    expect(screen.getByText("Système")).toBeInTheDocument();
  });

  it("applique chaque choix", async () => {
    const user = userEvent.setup();
    for (const [libelle, valeur] of [
      ["Clair", "light"],
      ["Sombre", "dark"],
      ["Système", "system"],
    ] as const) {
      const { unmount } = renderWithProviders(<ThemeToggle />);
      await user.click(screen.getByRole("button", { name: "Changer de thème" }));
      await user.click(await screen.findByText(libelle));

      expect(simulations.setTheme, libelle).toHaveBeenCalledWith(valeur);
      simulations.setTheme.mockClear();
      unmount();
    }
  });
});
