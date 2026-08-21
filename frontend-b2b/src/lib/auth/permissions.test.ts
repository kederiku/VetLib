/**
 * Tests de la matrice de permissions du portail B2B.
 *
 * Rappel important : masquer un bouton n'est PAS une protection — l'autorité
 * reste le backend, qui vérifie la permission sur chaque endpoint. Ces tests
 * portent donc sur l'ergonomie et sur un point de sécurité bien réel : le
 * comportement par défaut quand la session n'est pas encore résolue.
 */
import { describe, expect, it } from "vitest";

import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { buildUser } from "@/test/fixtures";

describe("hasPermission", () => {
  it("reconnaît une permission portée par l'utilisateur", () => {
    const user = buildUser({ permissions: ["appointment:read", "pet:read"] });
    expect(hasPermission(user, "appointment:read")).toBe(true);
    expect(hasPermission(user, "pet:read")).toBe(true);
  });

  it("refuse une permission absente", () => {
    const user = buildUser({ permissions: ["appointment:read"] });
    expect(hasPermission(user, "staff:manage")).toBe(false);
    expect(hasPermission(user, "billing:read")).toBe(false);
  });

  it("refuse tout quand la session n'est pas encore résolue", () => {
    // C'est le point de sécurité de cette fonction : pendant le court instant
    // où l'utilisateur n'est pas chargé, le défaut sûr est "aucun droit".
    // L'inverse ferait apparaître brièvement des éléments réservés.
    for (const permission of PERMISSIONS) {
      expect(hasPermission(undefined, permission)).toBe(false);
    }
  });

  it("refuse tout pour un utilisateur sans aucune permission", () => {
    const user = buildUser({ permissions: [] });
    for (const permission of PERMISSIONS) {
      expect(hasPermission(user, permission)).toBe(false);
    }
  });

  it("n'accorde pas une permission par simple préfixe commun", () => {
    // "appointment:read" ne doit jamais valoir "appointment:write" : la
    // lecture de l'agenda n'autorise pas à le modifier.
    const user = buildUser({ permissions: ["appointment:read"] });
    expect(hasPermission(user, "appointment:write")).toBe(false);
  });
});

describe("PERMISSIONS", () => {
  it("ne contient aucun doublon", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it("respecte le format 'ressource:action'", () => {
    // Cette liste est le miroir de ROLE_PERMISSIONS du backend : une entrée
    // mal formée signalerait une faute de frappe lors d'une synchronisation.
    for (const permission of PERMISSIONS) {
      expect(permission).toMatch(/^[a-z_]+:[a-z]+$/);
    }
  });
});
