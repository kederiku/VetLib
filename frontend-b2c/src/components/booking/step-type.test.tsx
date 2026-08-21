/**
 * Tests de la deuxième étape du tunnel : le motif de consultation.
 *
 * La liste vient de la clinique choisie à l'étape précédente. L'état vide y a
 * un sens particulier : une clinique référencée dans l'annuaire peut n'avoir
 * activé aucun motif réservable en ligne. Le message doit alors être explicite
 * — un écran vide laisserait croire à une panne.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StepType } from "@/components/booking/step-type";
import { buildPublicAppointmentType, buildPublicClinic } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ useListClinicAppointmentTypes: vi.fn() }));

vi.mock(
  "@/lib/api/generated/public-clinics/public-clinics",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/api/generated/public-clinics/public-clinics")
    >()),
    useListClinicAppointmentTypes: simulations.useListClinicAppointmentTypes,
  }),
);

function requete(surcharges: Record<string, unknown> = {}) {
  return { data: undefined, isPending: false, isError: false, ...surcharges };
}

const CLINIQUE = buildPublicClinic({ name: "Clinique des Peupliers" });

afterEach(() => {
  vi.clearAllMocks();
});

describe("StepType", () => {
  it("rappelle la clinique choisie à l'étape précédente", () => {
    // Repère de parcours : le propriétaire doit voir pour QUI il choisit.
    simulations.useListClinicAppointmentTypes.mockReturnValue(
      requete({ isPending: true }),
    );
    renderWithProviders(<StepType clinic={CLINIQUE} onSelect={vi.fn()} />);

    expect(
      screen.getByText(/Clinique des Peupliers/),
    ).toBeInTheDocument();
  });

  it("annonce l'échec du chargement", () => {
    simulations.useListClinicAppointmentTypes.mockReturnValue(
      requete({ isError: true }),
    );
    renderWithProviders(<StepType clinic={CLINIQUE} onSelect={vi.fn()} />);

    expect(
      screen.getByText(/Impossible de charger les motifs/),
    ).toBeInTheDocument();
  });

  it("explique qu'une clinique peut n'avoir aucun motif en ligne", () => {
    // Sans ce message, l'écran vide passerait pour une panne et le
    // propriétaire abandonnerait au lieu d'appeler la clinique.
    simulations.useListClinicAppointmentTypes.mockReturnValue(requete({ data: [] }));
    renderWithProviders(<StepType clinic={CLINIQUE} onSelect={vi.fn()} />);

    expect(
      screen.getByText("Cette clinique ne propose pas encore de réservation en ligne."),
    ).toBeInTheDocument();
  });

  it("liste les motifs proposés", () => {
    simulations.useListClinicAppointmentTypes.mockReturnValue(
      requete({
        data: [
          buildPublicAppointmentType({ id: "1", name: "Consultation" }),
          buildPublicAppointmentType({ id: "2", name: "Vaccination" }),
        ],
      }),
    );
    renderWithProviders(<StepType clinic={CLINIQUE} onSelect={vi.fn()} />);

    expect(screen.getByText("Consultation")).toBeInTheDocument();
    expect(screen.getByText("Vaccination")).toBeInTheDocument();
  });

  it("remonte le motif choisi", async () => {
    const onSelect = vi.fn();
    simulations.useListClinicAppointmentTypes.mockReturnValue(
      requete({
        data: [buildPublicAppointmentType({ id: "1", name: "Consultation" })],
      }),
    );
    renderWithProviders(<StepType clinic={CLINIQUE} onSelect={onSelect} />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Consultation/ }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "1", name: "Consultation" }),
    );
  });

  it("interroge bien la clinique sélectionnée", () => {
    // Une erreur d'identifiant afficherait les motifs d'une autre clinique.
    simulations.useListClinicAppointmentTypes.mockReturnValue(requete({ data: [] }));
    renderWithProviders(<StepType clinic={CLINIQUE} onSelect={vi.fn()} />);

    expect(simulations.useListClinicAppointmentTypes).toHaveBeenCalledWith(
      CLINIQUE.id,
      expect.anything(),
    );
  });
});
