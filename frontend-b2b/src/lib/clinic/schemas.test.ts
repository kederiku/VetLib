/**
 * Tests du schéma de la fiche clinique (écran Réglages).
 *
 * Le point délicat est la règle « tout ou rien » de l'adresse : le backend
 * stocke soit une adresse complète, soit rien. Un formulaire qui laisserait
 * passer une adresse partielle enverrait au serveur une donnée inexploitable
 * pour un courrier — sans erreur visible, jusqu'au jour où quelqu'un imprime
 * une étiquette.
 */
import { describe, expect, it } from "vitest";

import { clinicSettingsSchema } from "@/lib/clinic/schemas";

function ficheValide() {
  return {
    name: "Clinique des Peupliers",
    phone: "",
    address: { line1: "", line2: "", postal_code: "", city: "" },
    timezone: "Europe/Paris",
  };
}

function chemins(valeurs: unknown): string[] {
  const resultat = clinicSettingsSchema.safeParse(valeurs);
  return resultat.success
    ? []
    : resultat.error.issues.map((issue) => issue.path.join("."));
}

describe("clinicSettingsSchema — identité", () => {
  it("accepte une fiche minimale", () => {
    expect(clinicSettingsSchema.safeParse(ficheValide()).success).toBe(true);
  });

  it("exige un nom d'au moins deux caractères", () => {
    expect(chemins({ ...ficheValide(), name: "A" })).toContain("name");
    expect(chemins({ ...ficheValide(), name: "  " })).toContain("name");
  });

  it("exige un fuseau horaire", () => {
    // C'est la clinique qui fait foi pour tout affichage horaire : sans
    // fuseau, aucun créneau ne peut être calculé correctement.
    expect(chemins({ ...ficheValide(), timezone: "" })).toContain("timezone");
  });
});

describe("clinicSettingsSchema — règle « tout ou rien » de l'adresse", () => {
  it("accepte une fiche sans adresse", () => {
    expect(chemins(ficheValide())).toEqual([]);
  });

  it("accepte une adresse complète", () => {
    expect(
      chemins({
        ...ficheValide(),
        address: {
          line1: "12 rue des Lilas",
          line2: "",
          postal_code: "34000",
          city: "Montpellier",
        },
      }),
    ).toEqual([]);
  });

  it("réclame les trois champs essentiels dès qu'un seul est rempli", () => {
    // Le cas piégeux : saisir le seul complément d'adresse (« Bâtiment C »)
    // déclenche les trois autres exigences.
    expect(
      chemins({
        ...ficheValide(),
        address: { line1: "", line2: "Bâtiment C", postal_code: "", city: "" },
      }),
    ).toEqual(["address.line1", "address.postal_code", "address.city"]);
  });

  it("ne réclame jamais le complément d'adresse", () => {
    expect(
      chemins({
        ...ficheValide(),
        address: {
          line1: "12 rue des Lilas",
          line2: "",
          postal_code: "34000",
          city: "Montpellier",
        },
      }),
    ).not.toContain("address.line2");
  });

  it("impose un code postal français à cinq chiffres", () => {
    const avec = (postal_code: string) => ({
      ...ficheValide(),
      address: {
        line1: "12 rue des Lilas",
        line2: "",
        postal_code,
        city: "Montpellier",
      },
    });

    expect(chemins(avec("34000"))).toEqual([]);
    expect(chemins(avec("3400"))).toContain("address.postal_code");
    expect(chemins(avec("ABCDE"))).toContain("address.postal_code");
  });
});
