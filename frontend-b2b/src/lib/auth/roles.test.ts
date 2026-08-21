/**
 * Tests des libellés de rôles du personnel.
 *
 * `Record<Role, string>` fait déjà échouer la compilation si un rôle backend
 * n'est pas traduit. Ce test couvre l'autre moitié : qu'aucun libellé n'ait
 * disparu ou ne soit devenu vide — un rôle sans libellé laisserait un blanc
 * dans le menu du compte, sans erreur.
 */
import { describe, expect, it } from "vitest";

import { ROLE_LABELS } from "@/lib/auth/roles";

describe("ROLE_LABELS", () => {
  it("couvre les trois rôles du backend", () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([
      "asv",
      "manager",
      "veterinarian",
    ]);
  });

  it("traduit chaque rôle en français métier", () => {
    expect(ROLE_LABELS.asv).toBe("ASV");
    expect(ROLE_LABELS.veterinarian).toBe("Vétérinaire");
    expect(ROLE_LABELS.manager).toBe("Gérant");
  });
});
