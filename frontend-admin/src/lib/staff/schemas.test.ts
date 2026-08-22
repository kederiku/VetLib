/**
 * Tests du schéma de création d'un compte du personnel.
 *
 * Deux garanties : aucun champ mot de passe (le backend le génère et le
 * remet une seule fois), et un rôle contraint aux valeurs du contrat — un
 * rôle inventé ne doit pas pouvoir partir vers l'API.
 */
import { describe, expect, it } from "vitest";

import { staffCreateSchema } from "@/lib/staff/schemas";

function creation(surcharges: Record<string, unknown> = {}) {
  return {
    email: "claire.martin@lilas.fr",
    first_name: "Claire",
    last_name: "Martin",
    role: "manager",
    ...surcharges,
  };
}

describe("staffCreateSchema", () => {
  it("accepte une saisie complète", () => {
    expect(staffCreateSchema.safeParse(creation()).success).toBe(true);
  });

  it("accepte les trois rôles du contrat", () => {
    for (const role of ["asv", "veterinarian", "manager"]) {
      expect(staffCreateSchema.safeParse(creation({ role })).success).toBe(true);
    }
  });

  it("refuse un rôle hors contrat", () => {
    // « platform » est le `kind` du jeton de cette console, pas un rôle de
    // clinique : il ne doit pas franchir la frontière du formulaire.
    expect(staffCreateSchema.safeParse(creation({ role: "platform" })).success).toBe(false);
    expect(staffCreateSchema.safeParse(creation({ role: "admin" })).success).toBe(false);
  });

  it("refuse une adresse email invalide et des noms vides", () => {
    const resultat = staffCreateSchema.safeParse(
      creation({ email: "pas-un-email", first_name: "", last_name: "" }),
    );
    const chemins = (resultat.error?.issues ?? []).map((issue) => issue.path.join("."));
    expect(chemins).toEqual(
      expect.arrayContaining(["email", "first_name", "last_name"]),
    );
  });

  it("ne porte aucun champ de mot de passe", () => {
    const resultat = staffCreateSchema.safeParse(creation({ password: "hunter2" }));
    expect(resultat.success).toBe(true);
    expect(resultat.data).not.toHaveProperty("password");
  });
});
