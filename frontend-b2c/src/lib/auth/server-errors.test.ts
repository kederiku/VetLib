/**
 * Tests de la traduction des erreurs du backend en messages de formulaire.
 *
 * C'est le module qui décide de CE QUE VOIT l'utilisateur quand quelque chose
 * échoue, et surtout OÙ il le voit : sous le champ fautif, ou dans le bandeau
 * global. Une régression ne casse rien de visible en développement — elle se
 * traduit en production par des formulaires qui refusent la saisie sans dire
 * pourquoi, ou par un message d'erreur affiché sous le mauvais champ.
 *
 * `setError` est la fonction de react-hook-form : un simple `vi.fn()` suffit,
 * aucun rendu React n'est nécessaire ici.
 */
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import {
  applyServerErrors,
  businessErrorMessage,
} from "@/lib/auth/server-errors";

/** Formulaire fictif : deux champs connus, pour éprouver le routage. */
type FormulaireTest = { email: string; first_name: string };
const CHAMPS_CONNUS = ["email", "first_name"] as const;

describe("businessErrorMessage", () => {
  it("traduit les codes métier connus en français", () => {
    expect(businessErrorMessage("scheduling.slot_already_booked")).toBeTruthy();
    expect(businessErrorMessage("scheduling.slot_unavailable")).toBe(
      "Ce créneau n'est plus disponible.",
    );
    expect(businessErrorMessage("patients.pet_not_found")).toBe(
      "Cet animal n'existe plus dans votre compte.",
    );
  });

  it("renvoie null pour un code inconnu", () => {
    // null et non une chaîne vide : l'appelant sait ainsi qu'il doit se
    // rabattre sur le detail brut du backend.
    expect(businessErrorMessage("quelque.chose.de.nouveau")).toBeNull();
  });
});

describe("applyServerErrors — panne réseau", () => {
  it("affiche un message générique quand le serveur n'a pas répondu", () => {
    // Un fetch qui échoue avant d'obtenir une réponse lève un TypeError natif,
    // pas un ApiError : il n'y a rien de plus précis à dire à l'utilisateur.
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(
      new TypeError("Failed to fetch"),
      setError,
      CHAMPS_CONNUS,
    );

    expect(setError).toHaveBeenCalledWith("root.server", {
      message:
        "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.",
    });
  });
});

describe("applyServerErrors — erreurs de validation (422)", () => {
  it("place chaque message sous le champ concerné", () => {
    // loc = ["body", "email"] : c'est loc[1] qui nomme le champ.
    const erreur = new ApiError({
      status: 422,
      detail: "Certains champs sont invalides.",
      validation: [
        { loc: ["body", "email"], msg: "Adresse invalide", type: "value_error" },
      ],
    });
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(erreur, setError, CHAMPS_CONNUS);

    expect(setError).toHaveBeenCalledWith("email", {
      message: "Adresse invalide",
    });
  });

  it("bascule dans le bandeau global un champ inconnu du formulaire", () => {
    // Plutôt que de perdre l'information silencieusement : l'utilisateur voit
    // au moins que quelque chose ne va pas, et le message reste lisible.
    const erreur = new ApiError({
      status: 422,
      detail: "Certains champs sont invalides.",
      validation: [
        { loc: ["body", "champ_exotique"], msg: "Valeur refusée", type: "x" },
      ],
    });
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(erreur, setError, CHAMPS_CONNUS);

    expect(setError).toHaveBeenCalledWith("root.server", {
      message: "Valeur refusée",
    });
  });

  it("traite toutes les erreurs, pas seulement la première", () => {
    const erreur = new ApiError({
      status: 422,
      detail: "Certains champs sont invalides.",
      validation: [
        { loc: ["body", "email"], msg: "Adresse invalide", type: "x" },
        { loc: ["body", "first_name"], msg: "Prénom requis", type: "y" },
      ],
    });
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(erreur, setError, CHAMPS_CONNUS);

    expect(setError).toHaveBeenCalledTimes(2);
  });
});

describe("applyServerErrors — codes métier", () => {
  it("place l'email déjà utilisé sous le champ email", () => {
    // Erreur attribuable à UN champ précis : la mettre dans le bandeau
    // global obligerait l'utilisateur à deviner lequel corriger.
    const erreur = new ApiError({
      status: 409,
      code: "identity.email_already_exists",
      detail: "Email already registered",
    });
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(erreur, setError, CHAMPS_CONNUS);

    expect(setError).toHaveBeenCalledWith("email", {
      message: "Cette adresse email est déjà utilisée.",
    });
  });

  it("reste volontairement flou sur des identifiants invalides", () => {
    // Point de SÉCURITÉ : le message ne doit jamais permettre de savoir si un
    // compte existe pour une adresse donnée (énumération de comptes). Le
    // message parle donc de « Email ou mot de passe », et va dans le bandeau
    // global plutôt que sous l'un des deux champs.
    const erreur = new ApiError({
      status: 401,
      code: "identity.invalid_credentials",
      detail: "Invalid credentials",
    });
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(erreur, setError, CHAMPS_CONNUS);

    expect(setError).toHaveBeenCalledWith("root.server", {
      message: "Email ou mot de passe incorrect.",
    });
    expect(setError).not.toHaveBeenCalledWith(
      "email",
      expect.anything(),
    );
  });

  it("signale un compte désactivé", () => {
    const erreur = new ApiError({
      status: 403,
      code: "identity.user_inactive",
      detail: "User inactive",
    });
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(erreur, setError, CHAMPS_CONNUS);

    expect(setError).toHaveBeenCalledWith("root.server", {
      message: "Ce compte est désactivé.",
    });
  });

  it("utilise la table métier pour un code hors formulaire", () => {
    // Les codes scheduling/patients ne correspondent à aucun champ : ils
    // passent par la table partagée pour obtenir un libellé français.
    const erreur = new ApiError({
      status: 409,
      code: "scheduling.slot_already_booked",
      detail: "Slot already booked",
    });
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(erreur, setError, CHAMPS_CONNUS);

    expect(setError).toHaveBeenCalledWith("root.server", {
      message: businessErrorMessage("scheduling.slot_already_booked"),
    });
  });

  it("retombe sur le détail brut du backend pour un code inconnu", () => {
    // Faute de mieux : afficher le message anglais du backend reste plus
    // utile qu'un « une erreur est survenue » qui n'aide personne.
    const erreur = new ApiError({
      status: 500,
      code: "un.code.tout.neuf",
      detail: "Something specific happened",
    });
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(erreur, setError, CHAMPS_CONNUS);

    expect(setError).toHaveBeenCalledWith("root.server", {
      message: "Something specific happened",
    });
  });

  it("gère une erreur HTTP sans code métier", () => {
    const erreur = new ApiError({ status: 401, detail: "Not authenticated" });
    const setError = vi.fn();
    applyServerErrors<FormulaireTest>(erreur, setError, CHAMPS_CONNUS);

    expect(setError).toHaveBeenCalledWith("root.server", {
      message: "Not authenticated",
    });
  });
});
