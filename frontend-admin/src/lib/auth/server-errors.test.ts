/**
 * Tests de la traduction des erreurs serveur.
 *
 * Ce fichier verrouille la propriete la plus facile a casser en refactorant :
 * une erreur doit finir SOUS LE BON CHAMP, ou dans le bandeau global -- mais
 * jamais nulle part. Une erreur perdue, c'est un formulaire qui ne repond
 * pas au clic, sans que rien ne l'explique.
 */
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { applyServerErrors, messageForApiError } from "@/lib/auth/server-errors";

const CHAMPS = ["email", "password"] as const;

describe("messageForApiError", () => {
  it("rend le message réseau quand rien n'a répondu", () => {
    expect(messageForApiError(new TypeError("Failed to fetch"))).toContain(
      "Impossible de contacter le serveur",
    );
  });

  it("traduit un code métier connu", () => {
    const erreur = new ApiError({
      status: 403,
      code: "identity.admin_inactive",
      detail: "Accès révoqué.",
    });
    expect(messageForApiError(erreur)).toContain("révoqué");
  });

  it("retombe sur le detail brut pour un code inconnu", () => {
    const erreur = new ApiError({
      status: 409,
      code: "identity.un.code.inedit",
      detail: "Message du backend.",
    });
    expect(messageForApiError(erreur)).toBe("Message du backend.");
  });
});

describe("applyServerErrors", () => {
  it("place une erreur 422 sous le champ concerné", () => {
    const setError = vi.fn();
    const erreur = new ApiError({
      status: 422,
      detail: "Certains champs sont invalides.",
      validation: [{ loc: ["body", "email"], msg: "Adresse invalide.", type: "value_error" }],
    });

    applyServerErrors(erreur, setError, CHAMPS);

    expect(setError).toHaveBeenCalledWith("email", { message: "Adresse invalide." });
  });

  it("route une erreur 422 sur un champ INCONNU vers le bandeau global", () => {
    // Le cas d'une evolution d'API : plutot que de perdre l'information sous
    // un champ qui n'existe pas dans ce formulaire, on l'affiche en haut.
    const setError = vi.fn();
    const erreur = new ApiError({
      status: 422,
      detail: "Certains champs sont invalides.",
      validation: [
        { loc: ["body", "champ_futur"], msg: "Valeur refusée.", type: "value_error" },
      ],
    });

    applyServerErrors(erreur, setError, CHAMPS);

    expect(setError).toHaveBeenCalledWith("root.server", { message: "Valeur refusée." });
  });

  it("met des identifiants incorrects dans le bandeau global", () => {
    const setError = vi.fn();
    const erreur = new ApiError({
      status: 401,
      code: "identity.invalid_credentials",
      detail: "Identifiants invalides.",
    });

    applyServerErrors(erreur, setError, CHAMPS);

    expect(setError).toHaveBeenCalledWith("root.server", {
      message: "Email ou mot de passe incorrect.",
    });
  });

  it("met une adresse déjà prise sous le champ email", () => {
    const setError = vi.fn();
    const erreur = new ApiError({
      status: 409,
      code: "identity.email_already_exists",
      detail: "Déjà pris.",
    });

    applyServerErrors(erreur, setError, CHAMPS);

    expect(setError).toHaveBeenCalledWith("email", {
      message: "Cette adresse email est déjà utilisée.",
    });
  });

  it("met un mot de passe compromis sous le champ mot de passe", () => {
    const setError = vi.fn();
    const erreur = new ApiError({
      status: 422,
      code: "identity.password_compromised",
      detail: "Compromis.",
    });

    applyServerErrors(erreur, setError, CHAMPS);

    expect(setError).toHaveBeenCalledWith("password", {
      message: expect.stringContaining("fuite de données"),
    });
  });

  it("met le message réseau dans le bandeau quand rien n'a répondu", () => {
    const setError = vi.fn();

    applyServerErrors(new TypeError("Failed to fetch"), setError, CHAMPS);

    expect(setError).toHaveBeenCalledWith("root.server", {
      message: expect.stringContaining("Impossible de contacter le serveur"),
    });
  });
});
