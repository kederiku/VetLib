/**
 * Tests des schémas des formulaires de connexion et d'inscription clinique.
 *
 * Ces schémas doublent côté client les contraintes du backend. Trop
 * permissifs, l'utilisateur découvre l'erreur après avoir tout rempli ; trop
 * stricts, il est bloqué sans recours.
 */
import { describe, expect, it } from "vitest";

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

  it("exige au moins 12 caractères pour le mot de passe", () => {
    // À la création, en revanche, on impose la règle actuelle : c'est le
    // compte qui pilotera toute la clinique.
    expect(
      registerClinicSchema.safeParse({ ...valide, password: "onzecarac." })
        .success,
    ).toBe(false);
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
