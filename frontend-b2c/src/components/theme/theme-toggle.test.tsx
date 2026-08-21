/**
 * Tests du sélecteur de thème.
 *
 * Le test le plus important de ce fichier est celui des DEUX icônes
 * toujours présentes dans le balisage. Le réflexe « propre » serait de
 * n'en rendre qu'une, selon le thème courant — mais le serveur ignore
 * le thème du visiteur, ce rendu conditionnel produirait donc un écart
 * d'hydratation et un scintillement au chargement. C'est le CSS
 * (dark:hidden / hidden dark:block) qui choisit, pas JavaScript.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ setTheme: vi.fn() }));

// Simulation PARTIELLE : src/test/render.tsx importe le vrai
// ThemeProvider de next-themes, un vi.mock complet du module casserait
// l'enveloppe de rendu de tous les tests.
vi.mock("next-themes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-themes")>()),
  useTheme: () => ({ setTheme: simulations.setTheme, theme: "light" }),
}));

beforeEach(() => {
  simulations.setTheme.mockClear();
});

describe("ThemeToggle", () => {
  it("porte un nom accessible : le bouton n'a aucun texte visible", () => {
    renderWithProviders(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: "Changer de thème" }),
    ).toBeInTheDocument();
  });

  it("garde les deux icônes dans le balisage (parade au scintillement)", () => {
    const { container } = renderWithProviders(<ThemeToggle />);

    // Soleil ET lune : le CSS en masque une. Rendre une seule icône
    // selon le thème provoquerait un écart d'hydratation.
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });

  it("propose les trois choix et transmet celui qu'on retient", async () => {
    const utilisateur = userEvent.setup();
    renderWithProviders(<ThemeToggle />);

    await utilisateur.click(
      screen.getByRole("button", { name: "Changer de thème" }),
    );

    // Le contenu du menu est rendu dans un portail, hors de l'arbre du
    // composant : on interroge l'écran entier, jamais le conteneur. Et
    // findBy (asynchrone) et non getBy : Base UI monte le portail apres
    // le clic, un getBy synchrone arriverait trop tot.
    expect(await screen.findByText("Clair")).toBeInTheDocument();
    expect(screen.getByText("Sombre")).toBeInTheDocument();
    expect(screen.getByText("Système")).toBeInTheDocument();

    await utilisateur.click(screen.getByText("Sombre"));
    expect(simulations.setTheme).toHaveBeenCalledWith("dark");
  });
});
