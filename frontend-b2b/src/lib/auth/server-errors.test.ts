/**
 * Tests de la traduction des erreurs du backend en messages affichables.
 *
 * Ce module décide de CE QUE VOIT le personnel quand une action échoue, et
 * surtout OÙ : sous le champ fautif, ou dans le bandeau global. Une régression
 * ne casse rien de visible en développement — elle se traduit en production
 * par un formulaire qui refuse la saisie sans dire pourquoi, ou par un message
 * technique anglais affiché à une ASV en pleine consultation.
 *
 * Deux points d'entrée : `messageForApiError` pour les actions SANS formulaire
 * (confirmer un rendez-vous, l'annuler), `applyServerErrors` pour les
 * formulaires.
 */
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import {
  applyServerErrors,
  messageForApiError,
} from "@/lib/auth/server-errors";

/** Formulaire fictif : deux champs connus, pour éprouver le routage. */
type FormulaireTest = { email: string; name: string };
const CHAMPS_CONNUS = ["email", "name"] as const;

describe("messageForApiError", () => {
  it("traduit les codes métier de la planification", () => {
    for (const code of [
      "scheduling.slot_already_booked",
      "scheduling.invalid_transition",
      "scheduling.slot_unavailable",
      "scheduling.cancellation_too_late",
      "scheduling.resource_not_found",
      "scheduling.appointment_type_not_found",
      "scheduling.appointment_not_found",
    ]) {
      const message = messageForApiError(
        new ApiError({ status: 409, code, detail: "technical detail" }),
      );
      // Le libellé français doit remplacer le detail anglais du backend.
      expect(message, code).not.toBe("technical detail");
      expect(message, code).toBeTruthy();
    }
  });

  it("traduit les codes d'identité et de patients", () => {
    expect(
      messageForApiError(
        new ApiError({
          status: 401,
          code: "identity.invalid_credentials",
          detail: "x",
        }),
      ),
    ).toBeTruthy();
    expect(
      messageForApiError(
        new ApiError({ status: 404, code: "patients.pet_not_found", detail: "x" }),
      ),
    ).toBe("Cet animal est introuvable.");
  });

  it("annonce une panne réseau quand le serveur n'a pas répondu", () => {
    // Un fetch échoué avant réponse lève un TypeError natif, pas un ApiError.
    const message = messageForApiError(new TypeError("Failed to fetch"));
    expect(message).toContain("serveur");
  });

  it("retombe sur le détail brut du backend pour un code inconnu", () => {
    // Faute de mieux : un message anglais reste plus utile qu'un écran muet.
    expect(
      messageForApiError(
        new ApiError({
          status: 500,
          code: "un.code.tout.neuf",
          detail: "Something specific happened",
        }),
      ),
    ).toBe("Something specific happened");
  });

  it("utilise le détail d'une erreur HTTP sans code métier", () => {
    expect(
      messageForApiError(new ApiError({ status: 401, detail: "Not authenticated" })),
    ).toBe("Not authenticated");
  });
});

describe("applyServerErrors — panne réseau", () => {
  it("affiche un message générique dans le bandeau global", () => {
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(
      new TypeError("Failed to fetch"),
      setError,
      CHAMPS_CONNUS,
    );

    expect(setError).toHaveBeenCalledWith(
      "root.server",
      expect.objectContaining({ message: expect.stringContaining("serveur") }),
    );
  });
});

describe("applyServerErrors — erreurs de validation (422)", () => {
  it("place chaque message sous le champ concerné", () => {
    // loc = ["body", "email"] : c'est loc[1] qui nomme le champ.
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(
      new ApiError({
        status: 422,
        detail: "Certains champs sont invalides.",
        validation: [
          { loc: ["body", "email"], msg: "Adresse invalide", type: "value_error" },
        ],
      }),
      setError,
      CHAMPS_CONNUS,
    );

    expect(setError).toHaveBeenCalledWith("email", {
      message: "Adresse invalide",
    });
  });

  it("bascule dans le bandeau global un champ absent du formulaire", () => {
    // Une évolution d'API ne doit pas faire disparaître silencieusement une
    // erreur sous un champ qui n'existe pas à l'écran.
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(
      new ApiError({
        status: 422,
        detail: "Certains champs sont invalides.",
        validation: [
          { loc: ["body", "champ_exotique"], msg: "Valeur refusée", type: "x" },
        ],
      }),
      setError,
      CHAMPS_CONNUS,
    );

    expect(setError).toHaveBeenCalledWith("root.server", {
      message: "Valeur refusée",
    });
  });

  it("traite toutes les erreurs, pas seulement la première", () => {
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(
      new ApiError({
        status: 422,
        detail: "Certains champs sont invalides.",
        validation: [
          { loc: ["body", "email"], msg: "Adresse invalide", type: "x" },
          { loc: ["body", "name"], msg: "Nom requis", type: "y" },
        ],
      }),
      setError,
      CHAMPS_CONNUS,
    );

    expect(setError).toHaveBeenCalledTimes(2);
  });
});

describe("applyServerErrors — codes métier", () => {
  it("place l'email déjà utilisé sous le champ email", () => {
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(
      new ApiError({
        status: 409,
        code: "identity.email_already_exists",
        detail: "Email already registered",
      }),
      setError,
      CHAMPS_CONNUS,
    );

    expect(setError).toHaveBeenCalledWith(
      "email",
      expect.objectContaining({ message: expect.stringContaining("déjà") }),
    );
  });

  it("reste volontairement flou sur des identifiants invalides", () => {
    // Point de SÉCURITÉ : le message ne doit jamais permettre de savoir si un
    // compte existe pour une adresse donnée. Il va donc dans le bandeau
    // global, et non sous le champ email.
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(
      new ApiError({
        status: 401,
        code: "identity.invalid_credentials",
        detail: "Invalid credentials",
      }),
      setError,
      CHAMPS_CONNUS,
    );

    expect(setError).toHaveBeenCalledWith("root.server", expect.anything());
    expect(setError).not.toHaveBeenCalledWith("email", expect.anything());
  });

  it("dirige un code hors formulaire vers le bandeau global", () => {
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(
      new ApiError({
        status: 409,
        code: "scheduling.slot_already_booked",
        detail: "Slot already booked",
      }),
      setError,
      CHAMPS_CONNUS,
    );

    expect(setError).toHaveBeenCalledWith(
      "root.server",
      expect.objectContaining({ message: expect.not.stringContaining("Slot") }),
    );
  });
});
