/**
 * Tests du schéma de validation d'une fiche animal.
 *
 * Ce schéma est le miroir côté client des contraintes du backend. S'ils
 * divergent, le formulaire accepte une saisie que l'API rejettera ensuite par
 * un 422 : l'utilisateur voit une erreur générique après avoir tout rempli,
 * au lieu d'un message sous le bon champ pendant la saisie.
 */
import { describe, expect, it } from "vitest";

import {
  petCoreSchema,
  petSchema,
  sterilizedFromApi,
  sterilizedToApi,
} from "@/lib/pets/schemas";

/** Une fiche complete valide, surchargeable champ par champ. */
function fiche(surcharges: Record<string, unknown> = {}) {
  return {
    name: "Rex",
    species: "dog",
    sex: "unknown",
    birth_date: "",
    breed: "",
    sterilized: "",
    ...surcharges,
  };
}

describe("petCoreSchema", () => {
  it("accepte une fiche minimale valide", () => {
    const resultat = petCoreSchema.safeParse({ name: "Rex", species: "dog" });
    expect(resultat.success).toBe(true);
  });

  it("supprime les espaces autour du nom", () => {
    // Sans le trim, "  Rex  " serait envoyé tel quel et s'afficherait
    // décalé dans toutes les listes.
    const resultat = petCoreSchema.safeParse({ name: "  Rex  ", species: "cat" });
    expect(resultat.success && resultat.data.name).toBe("Rex");
  });

  it("refuse un nom vide, même composé d'espaces", () => {
    // Le trim s'applique AVANT le min(1) : "   " doit être rejeté.
    expect(petCoreSchema.safeParse({ name: "   ", species: "dog" }).success).toBe(
      false,
    );
  });

  it("refuse un nom de plus de 100 caractères", () => {
    const resultat = petSchema.safeParse({
      name: "a".repeat(101),
      species: "dog",
    });
    expect(resultat.success).toBe(false);
  });

  it("n'accepte que les quatre espèces du backend", () => {
    for (const species of ["dog", "cat", "nac", "other"]) {
      expect(petCoreSchema.safeParse({ name: "Rex", species }).success).toBe(true);
    }
    expect(petCoreSchema.safeParse({ name: "Rex", species: "cheval" }).success).toBe(
      false,
    );
  });
});


describe("petSchema — la fiche complète", () => {
  it("accepte une fiche entièrement vide de champs facultatifs", () => {
    // Declarer un animal en urgence ne doit rien exiger de plus qu'un
    // nom et une espece.
    expect(petSchema.safeParse(fiche()).success).toBe(true);
  });

  it("refuse une date de naissance dans le futur", () => {
    // Miroir de la regle du domaine backend : le retour immediat sous le
    // champ evite un aller-retour reseau pour une coquille.
    expect(
      petSchema.safeParse(fiche({ birth_date: "2099-01-01" })).success,
    ).toBe(false);
  });

  it("refuse une année aberrante, garde-fou de faute de frappe", () => {
    // "0202" au lieu de "2020" : c'est la borne basse qui l'attrape.
    expect(
      petSchema.safeParse(fiche({ birth_date: "0202-01-01" })).success,
    ).toBe(false);
  });

  it("accepte une date de naissance vide", () => {
    expect(petSchema.safeParse(fiche({ birth_date: "" })).success).toBe(true);
  });

  it("refuse une race trop longue", () => {
    expect(
      petSchema.safeParse(fiche({ breed: "a".repeat(101) })).success,
    ).toBe(false);
  });

  it("n'accepte que les trois sexes du backend", () => {
    expect(petSchema.safeParse(fiche({ sex: "male" })).success).toBe(true);
    expect(petSchema.safeParse(fiche({ sex: "autre" })).success).toBe(false);
  });
});

describe("traduction du tri-état de stérilisation", () => {
  it("fait l'aller-retour sans perdre « je ne sais pas »", () => {
    // Les boutons radio d'un formulaire ne savent pas transporter null :
    // "" le represente, et doit redevenir null a l'envoi -- sinon "je ne
    // sais pas" deviendrait "non", un mensonge dans un dossier medical.
    expect(sterilizedToApi("")).toBeNull();
    expect(sterilizedToApi("yes")).toBe(true);
    expect(sterilizedToApi("no")).toBe(false);

    expect(sterilizedFromApi(null)).toBe("");
    expect(sterilizedFromApi(true)).toBe("yes");
    expect(sterilizedFromApi(false)).toBe("no");
  });
});
