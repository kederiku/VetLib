/**
 * Tests de la carte « Prochain rendez-vous ».
 *
 * C'est le bloc principal du tableau de bord : il doit être juste dans
 * les quatre états (chargement, erreur, vide, rempli) et surtout retenir
 * le BON rendez-vous — le plus proche à venir, pas le premier de la
 * liste renvoyée par l'API.
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NextAppointmentCard } from "@/components/dashboard/next-appointment-card";
import { getListMyAppointmentsQueryKey } from "@/lib/api/generated/owner-appointments/owner-appointments";
import type { OwnerAppointmentResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { buildOwnerAppointment } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tableau-de-bord",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const MAINTENANT = new Date("2026-08-20T10:00:00Z");

function afficher(appointments: OwnerAppointmentResponse[]) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(getListMyAppointmentsQueryKey(), {
    status: 200,
    data: appointments,
    headers: new Headers(),
  });
  return renderWithProviders(<NextAppointmentCard now={MAINTENANT} />, {
    queryClient,
  });
}

describe("NextAppointmentCard", () => {
  it("retient le rendez-vous le plus proche, pas le premier de la liste", () => {
    afficher([
      buildOwnerAppointment({
        id: "loin",
        starts_at: "2026-09-15T07:00:00Z",
        ends_at: "2026-09-15T07:30:00Z",
        clinic_name: "Clinique lointaine",
      }),
      buildOwnerAppointment({
        id: "proche",
        starts_at: "2026-08-21T07:00:00Z",
        ends_at: "2026-08-21T07:30:00Z",
        clinic_name: "Clinique des Peupliers",
      }),
    ]);

    expect(screen.getByText("Clinique des Peupliers")).toBeInTheDocument();
    expect(screen.queryByText("Clinique lointaine")).not.toBeInTheDocument();
  });

  it("formule le jour comme on le dirait, sans masquer la date", () => {
    afficher([
      buildOwnerAppointment({
        starts_at: "2026-08-21T07:00:00Z",
        ends_at: "2026-08-21T07:30:00Z",
      }),
    ]);

    expect(screen.getByText(/Demain à 09:00 – 09:30/)).toBeInTheDocument();
    expect(screen.getByText("vendredi 21 août 2026")).toBeInTheDocument();
  });

  it("ignore les rendez-vous passés", () => {
    afficher([
      buildOwnerAppointment({ starts_at: "2026-08-01T07:00:00Z" }),
    ]);

    expect(screen.getByText("Aucun rendez-vous à venir")).toBeInTheDocument();
  });

  it("propose une sortie quand il n'y a rien à venir", () => {
    // Un état vide sans issue est une impasse.
    afficher([]);

    expect(
      screen.getByRole("button", { name: "Prendre rendez-vous" }),
    ).toHaveAttribute("href", "/rendez-vous/nouveau");
  });

  it("omet la ligne animal quand aucune fiche n'est rattachée", () => {
    // Rendez-vous créé par la clinique : une ligne vide décalerait la
    // carte sans rien apporter.
    const { container } = afficher([
      buildOwnerAppointment({
        starts_at: "2026-08-21T07:00:00Z",
        pet_name: null,
      }),
    ]);

    const carte = container.querySelector('[data-slot="card"]');
    expect(carte?.textContent).not.toContain("null");
  });

  it("affiche le statut du rendez-vous retenu", () => {
    afficher([
      buildOwnerAppointment({
        starts_at: "2026-08-21T07:00:00Z",
        status: "pending",
      }),
    ]);

    expect(
      screen.getByText("En attente de confirmation"),
    ).toBeInTheDocument();
  });
});
