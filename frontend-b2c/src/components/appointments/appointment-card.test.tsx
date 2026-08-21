/**
 * Tests de la carte de rendez-vous du portail propriétaires.
 *
 * Son enjeu principal est le bouton d'annulation : il ne doit apparaître que
 * lorsque l'annulation est réellement possible. Le proposer à moins de 24
 * heures du rendez-vous mènerait à un refus du serveur après coup — le
 * propriétaire croirait avoir annulé et ne se présenterait pas.
 *
 * `now` est reçu en propriété plutôt que lu de l'horloge : le test est donc
 * déterministe, sans faux timers.
 */
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppointmentCard } from "@/components/appointments/appointment-card";
import { buildOwnerAppointment } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const DEBUT = "2026-08-20T10:00:00Z";
const BIEN_AVANT = new Date("2026-08-18T10:00:00Z");
const JUSTE_AVANT = new Date("2026-08-19T18:00:00Z");

describe("AppointmentCard — informations", () => {
  it("affiche le motif, la clinique et le praticien", () => {
    renderWithProviders(
      <AppointmentCard
        appointment={buildOwnerAppointment({
          appointment_type_name: "Vaccination",
          clinic_name: "Clinique des Peupliers",
          resource_name: "Dr Martin",
        })}
        now={BIEN_AVANT}
      />,
    );

    expect(screen.getByText(/Vaccination/)).toBeInTheDocument();
    expect(screen.getByText(/Clinique des Peupliers/)).toBeInTheDocument();
    expect(screen.getByText("Dr Martin")).toBeInTheDocument();
  });

  it("affiche l'animal quand la fiche est rattachée", () => {
    renderWithProviders(
      <AppointmentCard
        appointment={buildOwnerAppointment({ pet_name: "Rex" })}
        now={BIEN_AVANT}
      />,
    );

    expect(screen.getByText("Rex")).toBeInTheDocument();
  });

  it("omet la ligne animal quand aucune fiche n'est rattachée", () => {
    // Cas d'un rendez-vous créé par la clinique sans fiche patient : une
    // ligne vide décalerait la carte sans rien apporter.
    const { container } = renderWithProviders(
      <AppointmentCard
        appointment={buildOwnerAppointment({ pet_name: null })}
        now={BIEN_AVANT}
      />,
    );

    // Assertion portee sur la CARTE et non sur tout le conteneur de
    // rendu : celui-ci embarque aussi le script anti-flash de
    // next-themes (monte par les providers de test), dont le code
    // source contient le mot "null".
    const carte = container.querySelector('[data-slot="card"]');
    expect(carte?.textContent).not.toContain("null");
  });

  it("affiche le motif libre s'il est renseigné", () => {
    renderWithProviders(
      <AppointmentCard
        appointment={buildOwnerAppointment({ reason: "Boite depuis hier" })}
        now={BIEN_AVANT}
      />,
    );

    expect(screen.getByText("Boite depuis hier")).toBeInTheDocument();
  });

  it("porte un badge de statut", () => {
    renderWithProviders(
      <AppointmentCard
        appointment={buildOwnerAppointment({ status: "pending" })}
        now={BIEN_AVANT}
      />,
    );

    expect(
      screen.getByText("En attente de confirmation"),
    ).toBeInTheDocument();
  });
});

describe("AppointmentCard — bouton d'annulation", () => {
  it("propose l'annulation bien à l'avance", () => {
    renderWithProviders(
      <AppointmentCard
        appointment={buildOwnerAppointment({ starts_at: DEBUT, status: "confirmed" })}
        now={BIEN_AVANT}
      />,
    );

    expect(screen.getByRole("button", { name: /Annuler/ })).toBeInTheDocument();
  });

  it("retire le bouton à moins de 24 heures", () => {
    // Le proposer ici mènerait à un refus du serveur : le propriétaire
    // croirait avoir annulé et ne viendrait pas.
    renderWithProviders(
      <AppointmentCard
        appointment={buildOwnerAppointment({ starts_at: DEBUT, status: "confirmed" })}
        now={JUSTE_AVANT}
      />,
    );

    expect(screen.queryByRole("button", { name: /Annuler/ })).not.toBeInTheDocument();
  });

  it("retire le bouton sur un rendez-vous déjà annulé", () => {
    renderWithProviders(
      <AppointmentCard
        appointment={buildOwnerAppointment({ starts_at: DEBUT, status: "cancelled" })}
        now={BIEN_AVANT}
      />,
    );

    expect(screen.queryByRole("button", { name: /Annuler/ })).not.toBeInTheDocument();
  });

  it("retire le bouton sur un rendez-vous terminé", () => {
    renderWithProviders(
      <AppointmentCard
        appointment={buildOwnerAppointment({ starts_at: DEBUT, status: "completed" })}
        now={BIEN_AVANT}
      />,
    );

    expect(screen.queryByRole("button", { name: /Annuler/ })).not.toBeInTheDocument();
  });

  it("propose l'annulation d'une demande encore en attente", () => {
    renderWithProviders(
      <AppointmentCard
        appointment={buildOwnerAppointment({ starts_at: DEBUT, status: "pending" })}
        now={BIEN_AVANT}
      />,
    );

    expect(screen.getByRole("button", { name: /Annuler/ })).toBeInTheDocument();
  });
});
