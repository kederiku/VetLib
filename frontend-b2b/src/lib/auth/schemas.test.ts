/**
 * Tests des schémas des formulaires de connexion et d'inscription clinique.
 *
 * Ces schémas doublent côté client les contraintes du backend. Trop
 * permissifs, l'utilisateur découvre l'erreur après avoir tout rempli ; trop
 * stricts, il est bloqué sans recours.
 */
import { describe, expect, it } from "vitest";

import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import { loginSchema, registerClinicSchema } from "@/lib/auth/schemas";

describe("loginSchema", () => {
  it("accepte des identifiants valides", () => {
    expect(
      loginSchema.safeParse({ email: "asv@clinique.test", password: "x" })
        .success,
    ).toBe(true);
  });

  it("n'impose AUCUNE longueur minimale au mot de passe", () => {
    // Volontaire, et ce test le gèle : à la connexion, un mot de passe créé
    // avant un durcissement de la règle doit rester utilisable. Exiger 12
    // caractères ici enfermerait dehors les comptes existants.
    expect(
      loginSchema.safeParse({ email: "asv@clinique.test", password: "court" })
        .success,
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

describe("registerClinicSchema", () => {
  const valide = {
    clinic_name: "Clinique des Peupliers",
    first_name: "Camille",
    last_name: "Durand",
    email: "camille@peupliers.test",
    password: "motdepasse-tres-long",
  };

  it("accepte une inscription minimale", () => {
    expect(registerClinicSchema.safeParse(valide).success).toBe(true);
  });

  it("applique la longueur minimale de la politique de mot de passe", () => {
    // À la création, en revanche, on impose la règle : c'est le compte qui
    // pilotera toute la clinique. La borne vient de password-policy.ts,
    // partagée avec le portail propriétaires.
    const tropCourt = "a".repeat(PASSWORD_MIN_LENGTH - 1);
    expect(
      registerClinicSchema.safeParse({ ...valide, password: tropCourt })
        .success,
    ).toBe(false);
  });

  it("n'impose AUCUNE règle de composition", () => {
    // Choix délibéré, conforme à NIST SP 800-63B : la longueur seule. Ce
    // test verrouille l'absence de règle, qui est la première chose que
    // quelqu'un « corrigerait » de bonne foi.
    expect(
      registerClinicSchema.safeParse({
        ...valide,
        password: "mon chat rex adore les croquettes",
      }).success,
    ).toBe(true);
  });

  it("exige un nom de clinique d'au moins deux caractères", () => {
    expect(
      registerClinicSchema.safeParse({ ...valide, clinic_name: "A" }).success,
    ).toBe(false);
  });

  it("applique le trim AVANT de vérifier la longueur minimale", () => {
    expect(
      registerClinicSchema.safeParse({ ...valide, first_name: "   " }).success,
    ).toBe(false);
  });

  it("rend le téléphone facultatif", () => {
    expect(registerClinicSchema.safeParse(valide).success).toBe(true);
    expect(
      registerClinicSchema.safeParse({ ...valide, phone: "0467000000" }).success,
    ).toBe(true);
  });
});
