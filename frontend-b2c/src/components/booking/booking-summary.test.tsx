/**
 * Tests du récapitulatif du tunnel.
 *
 * Il complète le fil d'étapes sans le doubler : l'indicateur dit OU l'on
 * en est, le récapitulatif dit CE QU'ON A CHOISI. Les deux contrats
 * verrouillés ici sont l'affichage explicite de ce qui reste à choisir
 * (un blanc laisserait croire à un oubli d'affichage) et le retour à
 * l'étape correspondante.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BookingSummary } from "@/components/booking/booking-summary";
import { initialBookingState } from "@/components/booking/booking-state";
import {
  buildAvailabilitySlot,
  buildPet,
  buildPublicAppointmentType,
  buildPublicClinic,
} from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const COMPLET = {
  ...initialBookingState,
  step: 4 as const,
  clinic: buildPublicClinic({ name: "Clinique des Peupliers" }),
  appointmentType: buildPublicAppointmentType({ name: "Consultation" }),
  pet: buildPet({ name: "Rex" }),
  slot: buildAvailabilitySlot({ starts_at: "2026-08-20T07:00:00Z" }),
};

describe("BookingSummary", () => {
  it("montre chaque choix déjà fait", () => {
    renderWithProviders(
      <BookingSummary state={COMPLET} onGoToStep={vi.fn()} />,
    );

    expect(screen.getByText("Clinique des Peupliers")).toBeInTheDocument();
    expect(screen.getByText("Consultation")).toBeInTheDocument();
    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.getByText("20 août 2026 à 09:00")).toBeInTheDocument();
  });

  it("dit explicitement ce qui reste à choisir", () => {
    // Un blanc laisserait croire à un oubli d'affichage.
    renderWithProviders(
      <BookingSummary
        state={{ ...COMPLET, pet: null, slot: null }}
        onGoToStep={vi.fn()}
      />,
    );

    expect(screen.getAllByText("À choisir")).toHaveLength(2);
  });

  it("ne propose « Modifier » que sur les lignes renseignées", () => {
    renderWithProviders(
      <BookingSummary
        state={{ ...COMPLET, pet: null, slot: null }}
        onGoToStep={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: /Modifier/ })).toHaveLength(2);
  });

  it("ramène à l'étape de la ligne modifiée", async () => {
    const allerA = vi.fn();
    renderWithProviders(<BookingSummary state={COMPLET} onGoToStep={allerA} />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Modifier animal/ }));

    expect(allerA).toHaveBeenCalledWith(3);
  });
});
