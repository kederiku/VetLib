/**
 * Tests des schémas de validation des formulaires d'authentification et de
 * profil.
 *
 * Ces schémas sont le miroir côté client des contraintes du backend. Deux
 * risques distincts s'ils divergent :
 * - trop permissifs : le formulaire accepte une saisie que l'API rejettera,
 *   et l'utilisateur voit une erreur générique après avoir tout rempli ;
 * - trop stricts : le formulaire refuse une valeur que le backend accepte,
 *   et l'utilisateur est bloqué sans recours.
 *
 * Le cas le plus délicat est la règle « tout ou rien » de l'adresse, qui n'est
 * exprimable ni par champ ni côté backend seul.
 */
import { describe, expect, it } from "vitest";

import {
  loginSchema,
  profileSchema,
  registerOwnerSchema,
} from "@/lib/auth/schemas";

/** Profil valide de référence, sans adresse (cas le plus fréquent). */
function profilValide() {
  return {
    first_name: "Marie",
    last_name: "Dupont",
    phone: "",
    address: { line1: "", line2: "", postal_code: "", city: "" },
    notification_preferences: { email: true, sms: false },
  };
}

/** Raccourci : les chemins d'erreur signalés par le schéma. */
function chemins(valeurs: unknown): string[] {
  const resultat = profileSchema.safeParse(valeurs);
  return resultat.success
    ? []
    : resultat.error.issues.map((issue) => issue.path.join("."));
}

describe("loginSchema", () => {
  it("accepte des identifiants valides", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.test", password: "x" }).success,
    ).toBe(true);
  });

  it("n'impose AUCUNE longueur minimale au mot de passe", () => {
    // Volontaire, et ce test le gèle : à la connexion, un mot de passe créé
    // avant un durcissement de la règle doit rester utilisable. Exiger 12
    // caractères ici enfermerait dehors les comptes anciens.
    expect(
      loginSchema.safeParse({ email: "a@b.test", password: "court" }).success,
    ).toBe(true);
  });

  it("refuse un email mal formé et un mot de passe vide", () => {
    expect(
      loginSchema.safeParse({ email: "pas-un-email", password: "x" }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ email: "a@b.test", password: "" }).success,
    ).toBe(false);
  });
});

describe("registerOwnerSchema", () => {
  const valide = {
    first_name: "Marie",
    last_name: "Dupont",
    email: "marie@example.test",
    password: "motdepasse-tres-long",
  };

  it("accepte une inscription minimale", () => {
    expect(registerOwnerSchema.safeParse(valide).success).toBe(true);
  });

  it("exige au moins 12 caractères pour le mot de passe", () => {
    // À l'inscription, en revanche, on impose la règle actuelle.
    expect(
      registerOwnerSchema.safeParse({ ...valide, password: "onzecarac." })
        .success,
    ).toBe(false);
  });

  it("applique le trim AVANT de vérifier la longueur minimale", () => {
    // "   " deviendrait "" : sans trim préalable, le champ passerait.
    expect(
      registerOwnerSchema.safeParse({ ...valide, first_name: "   " }).success,
    ).toBe(false);
  });

  it("rend le téléphone facultatif", () => {
    expect(registerOwnerSchema.safeParse(valide).success).toBe(true);
    expect(
      registerOwnerSchema.safeParse({ ...valide, phone: "0612345678" }).success,
    ).toBe(true);
  });
});

describe("profileSchema — règle « tout ou rien » de l'adresse", () => {
  it("accepte un profil sans aucune adresse", () => {
    // Les quatre champs vides = pas d'adresse. C'est un état valide : le
    // backend stockera null.
    expect(profileSchema.safeParse(profilValide()).success).toBe(true);
  });

  it("accepte une adresse complète", () => {
    const valeurs = {
      ...profilValide(),
      address: {
        line1: "12 rue des Lilas",
        line2: "",
        postal_code: "34000",
        city: "Montpellier",
      },
    };
    expect(profileSchema.safeParse(valeurs).success).toBe(true);
  });

  it("exige les trois champs essentiels dès qu'un seul est rempli", () => {
    // Le cas piégeux : remplir la seule ligne 2 (un étage, un bâtiment) doit
    // réclamer les trois autres, sans quoi le backend recevrait une adresse
    // inexploitable pour un courrier.
    const valeurs = {
      ...profilValide(),
      address: { line1: "", line2: "Bâtiment C", postal_code: "", city: "" },
    };

    expect(chemins(valeurs)).toEqual([
      "address.line1",
      "address.postal_code",
      "address.city",
    ]);
  });

  it("ne réclame jamais la ligne 2", () => {
    // Complément d'adresse : facultatif même quand le reste est rempli.
    const valeurs = {
      ...profilValide(),
      address: {
        line1: "12 rue des Lilas",
        line2: "",
        postal_code: "34000",
        city: "Montpellier",
      },
    };
    expect(chemins(valeurs)).not.toContain("address.line2");
  });

  it("impose un code postal français à cinq chiffres", () => {
    const avecCodePostal = (postal_code: string) => ({
      ...profilValide(),
      address: {
        line1: "12 rue des Lilas",
        line2: "",
        postal_code,
        city: "Montpellier",
      },
    });

    expect(chemins(avecCodePostal("34000"))).toEqual([]);
    expect(chemins(avecCodePostal("3400"))).toContain("address.postal_code");
    expect(chemins(avecCodePostal("34 000"))).toContain("address.postal_code");
    expect(chemins(avecCodePostal("ABCDE"))).toContain("address.postal_code");
  });

  it("signale chaque erreur sous SON champ", () => {
    // Les chemins comptent autant que les messages : c'est eux qui placent
    // le texte rouge sous le bon champ du formulaire.
    const valeurs = {
      ...profilValide(),
      address: { line1: "", line2: "", postal_code: "34000", city: "" },
    };

    expect(chemins(valeurs)).toEqual(["address.line1", "address.city"]);
  });
});

describe("profileSchema — champs d'identité", () => {
  it("exige un prénom et un nom", () => {
    expect(
      chemins({ ...profilValide(), first_name: "", last_name: "" }),
    ).toEqual(["first_name", "last_name"]);
  });

  it("plafonne les longueurs", () => {
    expect(chemins({ ...profilValide(), first_name: "a".repeat(101) })).toEqual([
      "first_name",
    ]);
    expect(chemins({ ...profilValide(), phone: "0".repeat(31) })).toEqual([
      "phone",
    ]);
  });
});
