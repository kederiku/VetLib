/**
 * Tests du schéma d'édition d'un propriétaire.
 *
 * Le point qui compte : le schéma ne comporte NI email NI mot de passe. Ce
 * n'est pas un oubli, c'est la garantie qu'un exploitant ne peut pas prendre
 * le contrôle du compte d'un client depuis la console. Un test le verrouille,
 * parce qu'un champ ajouté par mégarde ne se verrait pas en relecture.
 */
import { describe, expect, it } from "vitest";

import { ownerEditSchema } from "@/lib/owners/schemas";

function edition(surcharges: Record<string, unknown> = {}) {
  return {
    first_name: "Claire",
    last_name: "Martin",
    phone: "",
    address: { line1: "", line2: "", postal_code: "", city: "" },
    ...surcharges,
  };
}

function chemins(resultat: { error?: { issues: { path: PropertyKey[] }[] } }) {
  return (resultat.error?.issues ?? []).map((issue) => issue.path.join("."));
}

describe("ownerEditSchema", () => {
  it("accepte une fiche minimale", () => {
    expect(ownerEditSchema.safeParse(edition()).success).toBe(true);
  });

  it("exige un prénom et un nom", () => {
    const resultat = ownerEditSchema.safeParse(edition({ first_name: "", last_name: "  " }));
    expect(chemins(resultat)).toEqual(expect.arrayContaining(["first_name", "last_name"]));
  });

  it("applique la règle d'adresse tout-ou-rien", () => {
    const resultat = ownerEditSchema.safeParse(
      edition({ address: { line1: "3 allée des Pins", line2: "", postal_code: "", city: "" } }),
    );
    expect(chemins(resultat)).toEqual(
      expect.arrayContaining(["address.postal_code", "address.city"]),
    );
  });

  it("ignore un email ou un mot de passe glissés dans la saisie", () => {
    const resultat = ownerEditSchema.safeParse(
      edition({ email: "nouvelle@adresse.fr", password: "hunter2" }),
    );
    expect(resultat.success).toBe(true);
    expect(resultat.data).not.toHaveProperty("email");
    expect(resultat.data).not.toHaveProperty("password");
  });
});
