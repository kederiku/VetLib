/**
 * Tests des règles d'affichage et d'annulation d'un rendez-vous.
 *
 * `canCancel` encode une règle MÉTIER : on n'annule plus dans les 24 heures
 * qui précèdent. Se tromper dans un sens fait perdre un créneau à la clinique
 * sans préavis ; dans l'autre, cela bloque un propriétaire de bonne foi. La
 * fonction reçoit `now` en paramètre plutôt que d'appeler `new Date()` : le
 * test est donc parfaitement déterministe, sans faux timers.
 */
import { describe, expect, it } from "vitest";

import { canCancel, STATUS_LABELS } from "@/lib/appointments/status";
import { buildOwnerAppointment } from "@/test/fixtures";

const DEBUT = "2026-08-20T10:00:00Z";

describe("canCancel", () => {
  it("autorise l'annulation bien à l'avance", () => {
    const rdv = buildOwnerAppointment({ starts_at: DEBUT, status: "confirmed" });
    expect(canCancel(rdv, new Date("2026-08-18T10:00:00Z"))).toBe(true);
  });

  it("refuse l'annulation à exactement 24 heures du rendez-vous", () => {
    // La comparaison est STRICTE (« > 24 h ») : à la seconde pile, c'est
    // déjà trop tard. Cette limite exacte est le seul endroit où une erreur
    // de comparaison passerait inaperçue.
    const rdv = buildOwnerAppointment({ starts_at: DEBUT, status: "confirmed" });
    expect(canCancel(rdv, new Date("2026-08-19T10:00:00Z"))).toBe(false);
  });

  it("autorise l'annulation une milliseconde avant la limite", () => {
    const rdv = buildOwnerAppointment({ starts_at: DEBUT, status: "confirmed" });
    expect(canCancel(rdv, new Date("2026-08-19T09:59:59.999Z"))).toBe(true);
  });

  it("refuse l'annulation d'un rendez-vous déjà passé", () => {
    const rdv = buildOwnerAppointment({ starts_at: DEBUT, status: "confirmed" });
    expect(canCancel(rdv, new Date("2026-08-21T10:00:00Z"))).toBe(false);
  });

  it("autorise l'annulation d'un rendez-vous en attente de confirmation", () => {
    const rdv = buildOwnerAppointment({ starts_at: DEBUT, status: "pending" });
    expect(canCancel(rdv, new Date("2026-08-18T10:00:00Z"))).toBe(true);
  });

  it("refuse d'annuler ce qui est déjà terminé ou annulé", () => {
    // Quelle que soit la date : annuler un rendez-vous passé ou déjà annulé
    // n'a pas de sens, et le backend le refuserait.
    const tot = new Date("2026-08-01T10:00:00Z");
    for (const status of ["completed", "cancelled"] as const) {
      const rdv = buildOwnerAppointment({ starts_at: DEBUT, status });
      expect(canCancel(rdv, tot), `statut ${status}`).toBe(false);
    }
  });
});

describe("STATUS_LABELS", () => {
  it("couvre les quatre statuts du backend", () => {
    // Record<AppointmentStatus, …> : un statut ajouté côté backend casse la
    // compilation. Ce test verrouille en plus qu'aucun n'a été retiré.
    expect(Object.keys(STATUS_LABELS).sort()).toEqual([
      "cancelled",
      "completed",
      "confirmed",
      "pending",
    ]);
  });

  it("donne à chaque statut un libellé français et une variante de badge", () => {
    for (const [statut, meta] of Object.entries(STATUS_LABELS)) {
      expect(meta.label, `libellé manquant pour ${statut}`).toBeTruthy();
      expect(meta.badgeVariant, `variante manquante pour ${statut}`).toBeTruthy();
    }
  });
});
