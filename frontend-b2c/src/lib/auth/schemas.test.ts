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
    expect(chemins({ ...profilValide(), first_name: "a".repeat(101) })).toEqual(
      ["first_name"],
    );
    expect(chemins({ ...profilValide(), phone: "0".repeat(31) })).toEqual([
      "phone",
    ]);
  });
});
