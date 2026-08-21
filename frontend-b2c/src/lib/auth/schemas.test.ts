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

import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import {
  loginSchema,
  onboardingAddressSchema,
  personalInfoSchema,
  profileAddressSchema,
  registerOwnerSchema,
} from "@/lib/auth/schemas";

/** Identité valide de référence, sans téléphone (cas le plus fréquent). */
function identiteValide() {
  return { first_name: "Marie", last_name: "Dupont", phone: "" };
}

/** Raccourci : les chemins d'erreur signalés par le schéma d'identité. */
function chemins(valeurs: unknown): string[] {
  const resultat = personalInfoSchema.safeParse(valeurs);
  return resultat.success
    ? []
    : resultat.error.issues.map((issue: { path: PropertyKey[] }) =>
        issue.path.join("."),
      );
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

describe("registerOwnerSchema — étape 1 du parcours d'inscription", () => {
  const valide = {
    first_name: "Marie",
    last_name: "Dupont",
    email: "marie@example.test",
    phone: "0612345678",
    password: "phrase-de-passe-a-moi",
    password_confirmation: "phrase-de-passe-a-moi",
  };

  it("accepte une inscription complète", () => {
    expect(registerOwnerSchema.safeParse(valide).success).toBe(true);
  });

  it("applique la longueur minimale de la politique", () => {
    // À l'inscription, on impose la règle ; au login, jamais (voir plus haut).
    const tropCourt = "a".repeat(PASSWORD_MIN_LENGTH - 1);
    expect(
      registerOwnerSchema.safeParse({
        ...valide,
        password: tropCourt,
        password_confirmation: tropCourt,
      }).success,
    ).toBe(false);
  });

  it("n'impose AUCUNE règle de composition", () => {
    // Choix délibéré, conforme à NIST SP 800-63B : la longueur seule. Ce
    // test verrouille l'absence de règle, qui est la première chose que
    // quelqu'un « corrigerait » de bonne foi.
    const phrase = "mon chat rex adore les croquettes";
    expect(
      registerOwnerSchema.safeParse({
        ...valide,
        password: phrase,
        password_confirmation: phrase,
      }).success,
    ).toBe(true);
  });

  it("refuse une confirmation qui ne correspond pas", () => {
    const resultat = registerOwnerSchema.safeParse({
      ...valide,
      password_confirmation: "phrase-de-passe-autre",
    });

    expect(resultat.success).toBe(false);
    // L'erreur doit se poser sous la CONFIRMATION : c'est elle qu'on demande
    // de corriger, pas le mot de passe qui vient d'être choisi.
    expect(resultat.error?.issues[0].path).toEqual(["password_confirmation"]);
  });

  it("applique le trim AVANT de vérifier la longueur minimale", () => {
    // "   " deviendrait "" : sans trim préalable, le champ passerait.
    expect(
      registerOwnerSchema.safeParse({ ...valide, first_name: "   " }).success,
    ).toBe(false);
  });

  it("exige le téléphone", () => {
    // Règle du PARCOURS, pas du contrat d'API : le backend l'accepte
    // nullable, et la fiche /mon-compte permet de l'effacer ensuite (voir
    // profileSchema, où il reste facultatif).
    // Object.fromEntries plutôt qu'une déstructuration : on veut le cas
    // « clé absente », pas une variable inutilisée.
    const sansTelephone = Object.fromEntries(
      Object.entries(valide).filter(([cle]) => cle !== "phone"),
    );
    expect(registerOwnerSchema.safeParse(sansTelephone).success).toBe(false);
    expect(
      registerOwnerSchema.safeParse({ ...valide, phone: "  " }).success,
    ).toBe(false);
  });
});

describe("onboardingAddressSchema — étape 2, entièrement facultative", () => {
  const vide = { line1: "", line2: "", postal_code: "", city: "" };

  it("accepte une adresse entièrement vide", () => {
    // L'étape est passable : ne rien saisir est un état valide, et le
    // formulaire n'enverra alors aucune requête.
    expect(onboardingAddressSchema.safeParse(vide).success).toBe(true);
  });

  it("exige les trois champs essentiels dès que l'adresse est entamée", () => {
    // Même règle tout-ou-rien que la fiche profil : le backend n'accepte
    // qu'une adresse nulle ou complète.
    const resultat = onboardingAddressSchema.safeParse({
      ...vide,
      line1: "12 rue des Lilas",
    });

    expect(resultat.success).toBe(false);
    const chemins = resultat.error?.issues.map((issue) => issue.path[0]);
    expect(chemins).toEqual(["postal_code", "city"]);
  });

  it("refuse un code postal qui n'est pas français", () => {
    expect(
      onboardingAddressSchema.safeParse({
        line1: "12 rue des Lilas",
        line2: "",
        postal_code: "7501",
        city: "Paris",
      }).success,
    ).toBe(false);
  });
});

describe("profileAddressSchema", () => {
  it("EST le schéma d'adresse de l'inscription, pas une copie", () => {
    // Les deux écrans qui portent une adresse (étape 2 de l'inscription
    // et carte Adresse du compte) partagent schéma ET forme de valeurs.
    // Deux copies divergeraient tôt ou tard : l'une accepterait un code
    // postal que l'autre refuse, pour la même donnée.
    expect(profileAddressSchema).toBe(onboardingAddressSchema);
  });
});

describe("personalInfoSchema — la carte « Informations personnelles »", () => {
  it("accepte une identité sans téléphone", () => {
    // Le numéro est facultatif ICI, contrairement à l'inscription : il
    // peut être effacé après coup, et le backend l'accepte nullable.
    expect(personalInfoSchema.safeParse(identiteValide()).success).toBe(true);
  });

  it("exige un prénom et un nom", () => {
    expect(
      chemins({ ...identiteValide(), first_name: "", last_name: "" }),
    ).toEqual(["first_name", "last_name"]);
  });

  it("refuse un prénom composé d'espaces", () => {
    // Le trim s'applique AVANT le min(1) : "   " doit être rejeté.
    expect(chemins({ ...identiteValide(), first_name: "   " })).toEqual([
      "first_name",
    ]);
  });

  it("plafonne les longueurs", () => {
    expect(
      chemins({ ...identiteValide(), first_name: "a".repeat(101) }),
    ).toEqual(["first_name"]);
    expect(chemins({ ...identiteValide(), phone: "0".repeat(31) })).toEqual([
      "phone",
    ]);
  });

  it("signale chaque erreur sous SON champ", () => {
    // Les chemins comptent autant que les messages : c'est eux qui
    // placent le texte rouge sous le bon champ du formulaire.
    expect(chemins({ ...identiteValide(), last_name: "" })).toEqual([
      "last_name",
    ]);
  });
});
