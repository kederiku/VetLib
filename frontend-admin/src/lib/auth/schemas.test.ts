/**
 * Tests du schéma de connexion.
 *
 * Ce qui compte ici tient en une propriété : le formulaire de connexion ne
 * doit RIEN exiger de plus qu'une adresse bien formée et un mot de passe non
 * vide. Un test le verrouille, parce que la tentation d'y recopier la
 * politique de mot de passe est réelle -- et qu'elle donnerait un indice à
 * un attaquant tout en bloquant les comptes anciens.
 */
import { describe, expect, it } from "vitest";

import { loginSchema } from "@/lib/auth/schemas";

describe("loginSchema", () => {
  it("accepte une adresse valide et un mot de passe quelconque", () => {
    const resultat = loginSchema.safeParse({ email: "a@b.fr", password: "x" });
    expect(resultat.success).toBe(true);
  });

  it("refuse une adresse mal formée", () => {
    const resultat = loginSchema.safeParse({
      email: "pas-une-adresse",
      password: "peu-importe",
    });
    expect(resultat.success).toBe(false);
  });

  it("refuse un mot de passe vide", () => {
    const resultat = loginSchema.safeParse({ email: "a@b.fr", password: "" });
    expect(resultat.success).toBe(false);
  });

  it("n'impose AUCUNE longueur minimale au mot de passe", () => {
    // Un caractere suffit : la politique ne vaut qu'a la creation de compte.
    expect(loginSchema.safeParse({ email: "a@b.fr", password: "a" }).success).toBe(true);
  });
});
