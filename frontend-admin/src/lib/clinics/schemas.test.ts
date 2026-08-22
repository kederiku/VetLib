/**
 * Tests des schémas de formulaire des cliniques.
 *
 * Deux règles y sont non triviales et méritent d'être verrouillées :
 *
 * 1. l'ADRESSE est tout-ou-rien — le value object du domaine exige
 *    `line1 + postal_code + city` ensemble, et une adresse partielle
 *    produirait un 422 illisible ;
 * 2. le bloc GÉRANT n'est exigé QUE si la case est cochée — le rendre
 *    obligatoire en permanence empêcherait de créer une clinique seule, ce
 *    que le backend accepte pourtant.
 */
import { describe, expect, it } from "vitest";

import { clinicCreateSchema, clinicEditSchema } from "@/lib/clinics/schemas";

/** Une saisie valide minimale, dont chaque test ne modifie que l'utile. */
function creation(surcharges: Record<string, unknown> = {}) {
  return {
    name: "Clinique des Lilas",
    email: "contact@lilas.fr",
    phone: "",
    timezone: "Europe/Paris",
    address: { line1: "", line2: "", postal_code: "", city: "" },
    avecGerant: false,
    manager_email: "",
    manager_first_name: "",
    manager_last_name: "",
    ...surcharges,
  };
}

/** Chemins des erreurs signalées, pour asserter SANS dépendre des libellés. */
function chemins(resultat: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return (resultat.error?.issues ?? []).map((issue) => issue.path.join("."));
}

describe("clinicCreateSchema", () => {
  it("accepte une clinique seule, sans gérant ni adresse", () => {
    expect(clinicCreateSchema.safeParse(creation()).success).toBe(true);
  });

  it("refuse un nom trop court et une adresse email invalide", () => {
    const resultat = clinicCreateSchema.safeParse(creation({ name: "A", email: "pas-un-email" }));
    expect(chemins(resultat)).toEqual(expect.arrayContaining(["name", "email"]));
  });

  describe("règle d'adresse tout-ou-rien", () => {
    it("accepte une adresse complète", () => {
      const resultat = clinicCreateSchema.safeParse(
        creation({
          address: {
            line1: "12 rue des Lilas",
            line2: "",
            postal_code: "75011",
            city: "Paris",
          },
        }),
      );
      expect(resultat.success).toBe(true);
    });

    it("signale les champs MANQUANTS, un par un, quand l'adresse est partielle", () => {
      // L'erreur doit être sous le champ à remplir, pas dans un message
      // global que l'utilisateur devrait traduire en « lequel des quatre ? ».
      const resultat = clinicCreateSchema.safeParse(
        creation({
          address: { line1: "12 rue des Lilas", line2: "", postal_code: "", city: "" },
        }),
      );
      expect(chemins(resultat)).toEqual(
        expect.arrayContaining(["address.postal_code", "address.city"]),
      );
    });

    it("déclenche la règle même si SEUL le complément est rempli", () => {
      // Cas piégeux : line2 seul n'est pas « rien », c'est une adresse
      // commencée. La laisser passer enverrait un bloc que le domaine refuse.
      const resultat = clinicCreateSchema.safeParse(
        creation({ address: { line1: "", line2: "Bâtiment B", postal_code: "", city: "" } }),
      );
      expect(chemins(resultat)).toEqual(
        expect.arrayContaining(["address.line1", "address.postal_code", "address.city"]),
      );
    });

    it("exige cinq chiffres pour le code postal", () => {
      const resultat = clinicCreateSchema.safeParse(
        creation({
          address: { line1: "12 rue des Lilas", line2: "", postal_code: "750", city: "Paris" },
        }),
      );
      expect(chemins(resultat)).toContain("address.postal_code");
    });
  });

  describe("bloc gérant conditionnel", () => {
    it("ignore les champs du gérant tant que la case est décochée", () => {
      const resultat = clinicCreateSchema.safeParse(
        creation({ avecGerant: false, manager_email: "pas-un-email" }),
      );
      expect(resultat.success).toBe(true);
    });

    it("exige les trois champs dès que la case est cochée", () => {
      const resultat = clinicCreateSchema.safeParse(creation({ avecGerant: true }));
      expect(chemins(resultat)).toEqual(
        expect.arrayContaining([
          "manager_email",
          "manager_first_name",
          "manager_last_name",
        ]),
      );
    });

    it("accepte un gérant complet", () => {
      const resultat = clinicCreateSchema.safeParse(
        creation({
          avecGerant: true,
          manager_email: "gerant@lilas.fr",
          manager_first_name: "Claire",
          manager_last_name: "Martin",
        }),
      );
      expect(resultat.success).toBe(true);
    });
  });
});

describe("clinicEditSchema", () => {
  it("n'a PAS de champ email", () => {
    // L'email est l'identifiant d'inscription : son absence du schéma est
    // une garantie de conception, pas un oubli. Le test la verrouille.
    const resultat = clinicEditSchema.safeParse({
      name: "Clinique des Lilas",
      phone: "",
      timezone: "Europe/Paris",
      address: { line1: "", line2: "", postal_code: "", city: "" },
      email: "nouvelle@adresse.fr",
    });
    expect(resultat.success).toBe(true);
    expect(resultat.data).not.toHaveProperty("email");
  });
});
