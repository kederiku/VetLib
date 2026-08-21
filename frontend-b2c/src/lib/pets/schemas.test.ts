/**
 * Tests du schéma de validation d'une fiche animal.
 *
 * Ce schéma est le miroir côté client des contraintes du backend. S'ils
 * divergent, le formulaire accepte une saisie que l'API rejettera ensuite par
 * un 422 : l'utilisateur voit une erreur générique après avoir tout rempli,
 * au lieu d'un message sous le bon champ pendant la saisie.
 */
import { describe, expect, it } from "vitest";

import { petSchema } from "@/lib/pets/schemas";

describe("petSchema", () => {
  it("accepte une fiche minimale valide", () => {
    const resultat = petSchema.safeParse({ name: "Rex", species: "dog" });
    expect(resultat.success).toBe(true);
  });

  it("supprime les espaces autour du nom", () => {
    // Sans le trim, "  Rex  " serait envoyé tel quel et s'afficherait
    // décalé dans toutes les listes.
    const resultat = petSchema.safeParse({ name: "  Rex  ", species: "cat" });
    expect(resultat.success && resultat.data.name).toBe("Rex");
  });

  it("refuse un nom vide, même composé d'espaces", () => {
    // Le trim s'applique AVANT le min(1) : "   " doit être rejeté.
    expect(petSchema.safeParse({ name: "   ", species: "dog" }).success).toBe(
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
      expect(petSchema.safeParse({ name: "Rex", species }).success).toBe(true);
    }
    expect(petSchema.safeParse({ name: "Rex", species: "cheval" }).success).toBe(
      false,
    );
  });
});
