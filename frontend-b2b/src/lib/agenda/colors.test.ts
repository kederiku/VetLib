/**
 * Tests de l'attribution des couleurs aux praticiens dans l'agenda.
 *
 * L'exigence est la STABILITÉ : un praticien doit garder la même couleur
 * d'un rendu à l'autre, d'une page à l'autre et d'un poste à l'autre. Si la
 * couleur changeait au rechargement, le personnel perdrait le repère visuel
 * sur lequel il s'appuie pour lire la grille d'un coup d'oeil — sans qu'aucune
 * erreur ne soit jamais levée.
 */
import { describe, expect, it } from "vitest";

import { resourceColorClasses } from "@/lib/agenda/colors";

const ID = "00000000-0000-0000-0000-0000000000a1";

describe("resourceColorClasses", () => {
  it("renvoie toujours la même palette pour un même identifiant", () => {
    expect(resourceColorClasses(ID)).toEqual(resourceColorClasses(ID));
  });

  it("fournit les trois classes attendues par la grille", () => {
    const palette = resourceColorClasses(ID);
    expect(palette.surface).toBeTruthy();
    expect(palette.border).toBeTruthy();
    expect(palette.dot).toBeTruthy();
  });

  it("puise dans les cinq palettes du thème, jamais ailleurs", () => {
    // Les classes doivent rester des tokens Tailwind du thème (chart-1 à
    // chart-5) : une couleur en dur ne suivrait pas le mode sombre.
    for (let i = 0; i < 30; i += 1) {
      const palette = resourceColorClasses(`praticien-${i}`);
      expect(palette.dot).toMatch(/^bg-chart-[1-5]$/);
    }
  });

  it("répartit les praticiens sur plusieurs couleurs", () => {
    // Si tout le monde tombait sur la même teinte, la fonction n'aurait
    // aucun intérêt : la grille serait monochrome.
    const teintes = new Set(
      Array.from({ length: 20 }, (_, i) => resourceColorClasses(`id-${i}`).dot),
    );
    expect(teintes.size).toBeGreaterThan(1);
  });

  it("ne plante pas sur un identifiant vide", () => {
    // Cas limite d'une donnée incomplète : mieux vaut une couleur par
    // défaut qu'un écran d'erreur.
    expect(resourceColorClasses("").dot).toMatch(/^bg-chart-[1-5]$/);
  });
});
