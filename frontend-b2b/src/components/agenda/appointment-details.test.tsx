/**
 * Tests du détail d'un rendez-vous, affiché au clic sur un bloc de l'agenda.
 *
 * C'est la fiche que l'accueil consulte pour rappeler un client ou vérifier un
 * motif. Chaque ligne y est conditionnelle, et deux détails méritent d'être
 * verrouillés : le téléphone est un LIEN d'appel — sur un poste équipé,
 * rappeler se fait en un clic — et la raison d'annulation est affichée, ce qui
 * tient la promesse faite au moment d'annuler.
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppointmentDetails } from "@/components/agenda/appointment-details";
import { buildAgendaEntry } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

vi.mock("@/lib/scheduling/use-appointment-transitions", () => ({
  useAppointmentTransitions: () => ({
    confirm: vi.fn(),
    complete: vi.fn(),
    isBusy: false,
    isConfirming: false,
    isCompleting: false,
  }),
}));

describe("AppointmentDetails — informations constantes", () => {
  it("affiche le motif, le statut et le praticien", () => {
    renderWithProviders(
      <AppointmentDetails
        entry={buildAgendaEntry({
          appointment_type_name: "Vaccination",
          resource_name: "Dr Martin",
          status: "pending",
        })}
      />,
    );

    expect(screen.getByText("Vaccination")).toBeInTheDocument();
    expect(screen.getByText("À confirmer")).toBeInTheDocument();
    expect(screen.getByText("Dr Martin")).toBeInTheDocument();
  });

  it("affiche la date et la plage horaire de la clinique", () => {
    // 07:00 UTC en août = 09:00 à la clinique.
    const { container } = renderWithProviders(
      <AppointmentDetails
        entry={buildAgendaEntry({
          starts_at: "2026-08-20T07:00:00Z",
          ends_at: "2026-08-20T07:30:00Z",
        })}
      />,
    );

    expect(container.textContent).toContain("09");
    expect(container.textContent).toContain("30");
  });

  it("nomme le client", () => {
    renderWithProviders(
      <AppointmentDetails
        entry={buildAgendaEntry({
          owner_first_name: "Marie",
          owner_last_name: "Dupont",
        })}
      />,
    );

    expect(screen.getByText("Marie Dupont")).toBeInTheDocument();
  });
});

describe("AppointmentDetails — informations conditionnelles", () => {
  it("fait du téléphone un lien d'appel", () => {
    // Sur un poste équipé d'un softphone, rappeler le client se fait en un
    // clic : c'est l'intérêt du lien tel:.
    renderWithProviders(
      <AppointmentDetails
        entry={buildAgendaEntry({ owner_phone: "0612345678" })}
      />,
    );

    expect(screen.getByRole("link", { name: "0612345678" })).toHaveAttribute(
      "href",
      "tel:0612345678",
    );
  });

  it("n'affiche aucun lien d'appel sans téléphone", () => {
    renderWithProviders(
      <AppointmentDetails entry={buildAgendaEntry({ owner_phone: null })} />,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("affiche l'animal avec son espèce", () => {
    renderWithProviders(
      <AppointmentDetails
        entry={buildAgendaEntry({ pet_name: "Rex", pet_species: "chien" })}
      />,
    );

    expect(screen.getByText("Rex (chien)")).toBeInTheDocument();
  });

  it("affiche le motif libre s'il est renseigné", () => {
    renderWithProviders(
      <AppointmentDetails
        entry={buildAgendaEntry({ reason: "Boite depuis hier" })}
      />,
    );

    expect(screen.getByText("Boite depuis hier")).toBeInTheDocument();
  });

  it("ignore un motif vide", () => {
    const { container } = renderWithProviders(
      <AppointmentDetails entry={buildAgendaEntry({ reason: "" })} />,
    );

    expect(container.querySelector(".italic")).not.toBeInTheDocument();
  });

  it("affiche la raison d'annulation", () => {
    // Le dialogue d'annulation promet que la raison sera visible dans
    // l'agenda : c'est ici qu'elle l'est.
    renderWithProviders(
      <AppointmentDetails
        entry={buildAgendaEntry({
          status: "cancelled",
          cancelled_reason: "Client injoignable",
        })}
      />,
    );

    expect(screen.getByText(/Client injoignable/)).toBeInTheDocument();
  });
});
