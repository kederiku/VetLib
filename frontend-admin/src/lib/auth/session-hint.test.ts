/**
 * Tests du drapeau de session posé dans localStorage.
 *
 * Ce drapeau évite d'envoyer une requête de vérification à chaque arrivée sur
 * /login pour un visiteur qui n'a jamais eu de session. Son intérêt de test
 * est ailleurs : chaque accès est entouré d'un try/catch, parce que
 * localStorage LÈVE UNE EXCEPTION quand le stockage est bloqué (navigation
 * privée d'anciens Safari, réglage de confidentialité strict). Sans ces
 * gardes, l'application entière planterait au chargement pour ces visiteurs —
 * un bug invisible en développement et impossible à reproduire au support.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSessionHint,
  getSessionHint,
  setSessionHint,
} from "@/lib/auth/session-hint";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cycle de vie du drapeau", () => {
  it("est absent tant qu'aucune connexion n'a eu lieu", () => {
    expect(getSessionHint()).toBe(false);
  });

  it("est posé par setSessionHint et relu par getSessionHint", () => {
    setSessionHint();
    expect(getSessionHint()).toBe(true);
  });

  it("est retiré par clearSessionHint", () => {
    setSessionHint();
    clearSessionHint();
    expect(getSessionHint()).toBe(false);
  });

  it("utilise une clé préfixée pour ne pas heurter le portail B2C", () => {
    // Les deux applications peuvent tourner sur le même hôte en
    // développement : une clé générique ferait que se déconnecter d'un
    // portail affecterait l'autre.
    setSessionHint();
    expect(window.localStorage.getItem("vetolib_admin_session_hint")).toBe("1");
  });

  it("ne considère comme vrai que la valeur exacte attendue", () => {
    // Une valeur héritée d'une version antérieure ne doit pas être
    // interprétée comme une session active.
    window.localStorage.setItem("vetolib_admin_session_hint", "true");
    expect(getSessionHint()).toBe(false);
  });
});

describe("stockage inaccessible", () => {
  it("répond false au lieu de planter à la lecture", () => {
    // Le scénario réel : navigation privée, stockage bloqué. L'application
    // doit se comporter comme si aucune session n'était connue.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("stockage bloqué");
    });

    expect(() => getSessionHint()).not.toThrow();
    expect(getSessionHint()).toBe(false);
  });

  it("ignore silencieusement une écriture impossible", () => {
    // Tant pis pour l'optimisation : le visiteur verra simplement une
    // requête de vérification en plus. Rien ne casse.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("stockage bloqué");
    });

    expect(() => setSessionHint()).not.toThrow();
  });

  it("ignore silencieusement une suppression impossible", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("stockage bloqué");
    });

    expect(() => clearSessionHint()).not.toThrow();
  });
});
