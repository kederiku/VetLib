/**
 * Tests de la source de vérité de navigation.
 *
 * Trois propriétés valent la peine d'être verrouillées : le match par
 * préfixe (une fiche garde le titre de sa section), le retour null hors des
 * écrans connus, et surtout l'UNICITÉ des préfixes -- sans elle,
 * pageTitleForPath rendrait le titre de la première entrée qui matche, et
 * l'erreur serait invisible à la relecture.
 */
import { describe, expect, it } from "vitest";

import { NAV_ITEMS, pageTitleForPath } from "@/lib/navigation";

describe("pageTitleForPath", () => {
  it("rend le titre exact d'un écran de la navigation", () => {
    expect(pageTitleForPath("/cliniques")).toBe("Cliniques");
    expect(pageTitleForPath("/proprietaires")).toBe("Propriétaires");
  });

  it("garde le titre de la section sur une sous-page", () => {
    expect(
      pageTitleForPath("/cliniques/00000000-0000-0000-0000-000000000001"),
    ).toBe("Cliniques");
  });

  it("rend null hors des écrans connus", () => {
    expect(pageTitleForPath("/login")).toBeNull();
    expect(pageTitleForPath("/")).toBeNull();
  });
});

describe("NAV_ITEMS", () => {
  it("n'a aucun href préfixe d'un autre", () => {
    // Ce test casserait le jour où quelqu'un ajouterait par exemple
    // /cliniques-archivees : le match par préfixe lui donnerait le titre
    // « Cliniques », en silence.
    for (const item of NAV_ITEMS) {
      const autres = NAV_ITEMS.filter((candidat) => candidat !== item);
      expect(
        autres.some((candidat) => candidat.href.startsWith(item.href)),
        `${item.href} est le préfixe d'une autre entrée`,
      ).toBe(false);
    }
  });

  it("commence toutes ses adresses par une barre oblique", () => {
    for (const item of NAV_ITEMS) {
      expect(item.href.startsWith("/")).toBe(true);
    }
  });
});
