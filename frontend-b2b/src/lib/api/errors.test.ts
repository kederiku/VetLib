/**
 * Tests de la normalisation des erreurs de l'API.
 *
 * Le backend FastAPI renvoie trois formes d'erreur différentes selon l'origine
 * du problème (erreur métier du domaine, exception HTTP nue, erreur de
 * validation). Ce module les ramène à une seule classe que tout le portail
 * manipule. Une régression ici ne se voit pas dans les logs : elle se traduit
 * par un formulaire qui n'affiche plus le message sous le bon champ, ou par un
 * « Erreur serveur » générique à la place d'un message utile.
 */
import { describe, expect, it } from "vitest";

import { ApiError, apiErrorFromBody, getApiError } from "@/lib/api/errors";

describe("apiErrorFromBody", () => {
  it("reconnaît une erreur métier du domaine et conserve son code", () => {
    // Le code est stable côté backend, contrairement au texte du detail :
    // c'est lui qui sert de clé pour choisir le message français à afficher.
    const erreur = apiErrorFromBody(409, {
      code: "identity.email_already_exists",
      detail: "Email already registered",
    });
    expect(erreur.status).toBe(409);
    expect(erreur.code).toBe("identity.email_already_exists");
    expect(erreur.detail).toBe("Email already registered");
    expect(erreur.validation).toBeUndefined();
  });

  it("reconnaît une erreur de validation et conserve le détail par champ", () => {
    const erreur = apiErrorFromBody(422, {
      detail: [
        { loc: ["body", "email"], msg: "value is not a valid email", type: "value_error" },
      ],
    });
    expect(erreur.validation).toHaveLength(1);
    expect(erreur.validation?.[0].loc).toEqual(["body", "email"]);
    // Le message générique reste lisible si le formulaire n'exploite pas
    // le détail champ par champ.
    expect(erreur.detail).toBe("Certains champs sont invalides.");
  });

  it("reconnaît une exception HTTP nue, sans code métier", () => {
    // Cas typique : cookie d'accès absent, FastAPI répond juste un texte.
    const erreur = apiErrorFromBody(401, { detail: "Not authenticated" });
    expect(erreur.status).toBe(401);
    expect(erreur.detail).toBe("Not authenticated");
    expect(erreur.code).toBeUndefined();
  });

  it("retombe sur un message générique pour un corps vide", () => {
    // Un proxy ou un CDN peut répondre une page HTML, ou rien du tout :
    // l'application ne doit pas planter pour autant.
    expect(apiErrorFromBody(502, null).detail).toBe("Erreur serveur (HTTP 502)");
    expect(apiErrorFromBody(500, {}).detail).toBe("Erreur serveur (HTTP 500)");
    expect(apiErrorFromBody(503, "<html>oups</html>").detail).toBe(
      "Erreur serveur (HTTP 503)",
    );
  });

  it("donne un detail lisible même si le code arrive sans texte", () => {
    const erreur = apiErrorFromBody(400, { code: "patients.pet_not_found" });
    expect(erreur.code).toBe("patients.pet_not_found");
    expect(erreur.detail).toBe("Erreur serveur (HTTP 400)");
  });

  it("traite la validation en priorité sur le code", () => {
    // Un corps peut théoriquement présenter les deux formes : le tableau
    // de validation est le plus spécifique, c'est lui qui doit gagner.
    const erreur = apiErrorFromBody(422, {
      code: "quelque.chose",
      detail: [{ loc: ["body", "nom"], msg: "champ requis", type: "missing" }],
    });
    expect(erreur.validation).toHaveLength(1);
  });

  it("produit une vraie Error, reconnaissable par TanStack Query", () => {
    // Étendre Error n'est pas cosmétique : TanStack Query et instanceof ne
    // reconnaissent que de véritables erreurs JavaScript.
    const erreur = apiErrorFromBody(500, { detail: "boum" });
    expect(erreur).toBeInstanceOf(Error);
    expect(erreur).toBeInstanceOf(ApiError);
    expect(erreur.name).toBe("ApiError");
    expect(erreur.message).toBe("boum");
  });
});

describe("getApiError", () => {
  it("laisse passer une erreur venue de l'API", () => {
    const erreur = apiErrorFromBody(404, { detail: "Introuvable" });
    expect(getApiError(erreur)).toBe(erreur);
  });

  it("renvoie null pour une panne réseau", () => {
    // Un fetch qui échoue avant d'obtenir une réponse lève un TypeError natif.
    // Les appelants doivent pouvoir distinguer « l'API a répondu une erreur »
    // de « rien n'a répondu ».
    expect(getApiError(new TypeError("Failed to fetch"))).toBeNull();
    expect(getApiError(new Error("bug quelconque"))).toBeNull();
  });

  it("renvoie null pour une valeur qui n'est pas une erreur", () => {
    expect(getApiError("une chaîne")).toBeNull();
    expect(getApiError(undefined)).toBeNull();
    expect(getApiError(null)).toBeNull();
  });
});
