/**
 * Tests de la ligne de rendez-vous.
 *
 * Deux contrats non evidents y sont verrouilles. Le premier : le nom
 * accessible du lien est une PHRASE complete -- un lecteur d'ecran ne
 * voit pas la mise en page en colonnes, lui lire "20 aout 09:00
 * Consultation" ne veut rien dire. Le second : le contenu visuel est
 * aria-hidden, sinon tout serait annonce EN DOUBLE (une fois par le nom
 * du lien, une fois par son contenu).
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppointmentRow } from "@/components/appointments/appointment-row";
import { buildOwnerAppointment } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

vi.mock("next/navigation", () => ({
  usePathname: () => "/rendez-vous",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("AppointmentRow", () => {
  it("mène à la fiche du rendez-vous", () => {
    renderWithProviders(
      <AppointmentRow appointment={buildOwnerAppointment({ id: "abc" })} />,
    );

    expect(screen.getByRole("link")).toHaveAttribute("href", "/rendez-vous/abc");
  });

  it("porte un nom accessible en phrase, pas en colonnes", () => {
    renderWithProviders(
      <AppointmentRow
        appointment={buildOwnerAppointment({
          appointment_type_name: "Consultation",
          pet_name: "Rex",
          clinic_name: "Clinique des Peupliers",
          starts_at: "2026-08-20T07:00:00Z",
          ends_at: "2026-08-20T07:30:00Z",
          status: "confirmed",
        })}
      />,
    );

    const lien = screen.getByRole("link", {
      name: /Consultation, pour Rex, le jeudi 20 août 2026, à 09:00 – 09:30, chez Clinique des Peupliers, Confirmé/,
    });
    expect(lien).toBeInTheDocument();
  });

  it("omet l'animal du libellé quand aucune fiche n'est rattachée", () => {
    // Rendez-vous cree par la clinique : "pour null" serait absurde.
    renderWithProviders(
      <AppointmentRow appointment={buildOwnerAppointment({ pet_name: null })} />,
    );

    expect(screen.getByRole("link").getAttribute("aria-label")).not.toContain(
      "pour",
    );
  });

  it("n'annonce pas son contenu en double", () => {
    // Le contenu visuel est aria-hidden : le nom du lien le dit deja.
    const { container } = renderWithProviders(
      <AppointmentRow appointment={buildOwnerAppointment()} />,
    );

    expect(container.querySelector("[aria-hidden]")).not.toBeNull();
  });

  it("ne contient AUCUN bouton : un controle dans un lien est ambigu au clavier", () => {
    // L'annulation vit sur la page de detail, un clic plus loin.
    renderWithProviders(
      <AppointmentRow appointment={buildOwnerAppointment()} />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
