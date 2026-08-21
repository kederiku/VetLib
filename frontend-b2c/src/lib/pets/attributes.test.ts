/**
 * Tests des attributs d'affichage de la fiche animal.
 *
 * formatAge est la fonction la plus piegeuse du module : elle raisonne en
 * JOURS CALENDAIRES et change d'unite selon l'age (semaines, mois,
 * annees). Les bords -- la veille d'un anniversaire, le jour meme, la
 * bascule mois/annee -- sont exactement ce qu'un test unitaire attrape et
 * qu'un oeil humain laisse passer.
 */
import { describe, expect, it } from "vitest";

import {
  formatAge,
  formatPetSubtitle,
  formatSterilized,
  SEX_LABELS,
} from "@/lib/pets/attributes";
import { buildPet } from "@/test/fixtures";

const AUJOURDHUI = new Date("2026-08-21T10:00:00Z");

describe("formatAge", () => {
  it("ne dit rien quand la date de naissance manque", () => {
    expect(formatAge(null, AUJOURDHUI)).toBeNull();
  });

  it("compte en années au-delà d'un an, avec le singulier", () => {
    expect(formatAge("2021-03-12", AUJOURDHUI)).toBe("5 ans");
    expect(formatAge("2025-08-21", AUJOURDHUI)).toBe("1 an");
  });

  it("bascule d'année pile le jour de l'anniversaire", () => {
    // La veille, l'animal a encore 11 mois : c'est le bord qui compte.
    expect(formatAge("2025-08-22", AUJOURDHUI)).toBe("11 mois");
    expect(formatAge("2025-08-21", AUJOURDHUI)).toBe("1 an");
  });

  it("compte en mois sous un an : un chiot n'a pas « 0 an »", () => {
    expect(formatAge("2026-02-21", AUJOURDHUI)).toBe("6 mois");
    expect(formatAge("2026-06-21", AUJOURDHUI)).toBe("2 mois");
  });

  it("compte en semaines sous deux mois", () => {
    expect(formatAge("2026-07-24", AUJOURDHUI)).toBe("4 semaines");
    expect(formatAge("2026-08-14", AUJOURDHUI)).toBe("1 semaine");
  });

  it("compte en jours la première semaine", () => {
    expect(formatAge("2026-08-18", AUJOURDHUI)).toBe("3 jours");
    expect(formatAge("2026-08-21", AUJOURDHUI)).toBe("1 jour");
  });

  it("préfère se taire plutôt qu'annoncer un âge négatif", () => {
    // Le backend refuse ces dates, mais une donnée ancienne pourrait
    // trainer -- "-2 ans" serait pire qu'un blanc.
    expect(formatAge("2028-01-01", AUJOURDHUI)).toBeNull();
  });

  it("ignore une date mal formée sans planter l'écran", () => {
    expect(formatAge("pas-une-date", AUJOURDHUI)).toBeNull();
  });
});

describe("SEX_LABELS", () => {
  it("dit « Non précisé » et non « Inconnu »", () => {
    // C'est une information que le propriétaire n'a pas encore donnée,
    // pas un mystère sur son animal.
    expect(SEX_LABELS.unknown).toBe("Non précisé");
    expect(SEX_LABELS.male).toBe("Mâle");
    expect(SEX_LABELS.female).toBe("Femelle");
  });
});

describe("formatSterilized", () => {
  it("distingue les trois états", () => {
    expect(formatSterilized(true)).toBe("Stérilisé");
    expect(formatSterilized(false)).toBe("Non stérilisé");
    expect(formatSterilized(null)).toBeNull();
  });
});

describe("formatPetSubtitle", () => {
  it("compose espèce, race et âge", () => {
    expect(
      formatPetSubtitle(
        buildPet({ species: "dog", breed: "Berger australien", birth_date: "2021-03-12" }),
        AUJOURDHUI,
      ),
    ).toBe("Chien · Berger australien · 5 ans");
  });

  it("fait DISPARAITRE les segments absents, sans laisser de séparateurs vides", () => {
    // Une fiche peu remplie doit rester propre, pas afficher ses trous.
    expect(
      formatPetSubtitle(
        buildPet({ species: "cat", breed: null, birth_date: null }),
        AUJOURDHUI,
      ),
    ).toBe("Chat");
  });
});
