/**
 * Tests de la fiche d'un rendez-vous.
 *
 * L'écran est DERIVE du cache de la liste, sans requête propre : ces
 * tests amorcent donc le cache plutôt que de simuler un hook, ce qui
 * exerce la vraie chaîne de code.
 *
 * Le cas délicat est « introuvable » : il ne doit s'afficher qu'une fois
 * la query ABOUTIE. L'affirmer pendant le chargement accuserait
 * d'inexistence un rendez-vous parfaitement valide.
 */
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppointmentDetailContent } from "@/components/appointments/appointment-detail-content";
import { getListMyAppointmentsQueryKey } from "@/lib/api/generated/owner-appointments/owner-appointments";
import type { OwnerAppointmentResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { buildOwnerAppointment } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

vi.mock("next/navigation", () => ({
  usePathname: () => "/rendez-vous/abc",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const MAINTENANT = new Date("2026-08-20T10:00:00Z");

function afficher(appointments: OwnerAppointmentResponse[], id = "abc") {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(getListMyAppointmentsQueryKey(), {
    status: 200,
    data: appointments,
    headers: new Headers(),
  });
  return renderWithProviders(<AppointmentDetailContent id={id} />, {
    queryClient,
  });
}

beforeEach(() => {
  vi.setSystemTime(MAINTENANT);
});

describe("AppointmentDetailContent", () => {
  it("affiche tout ce que le backend renvoie", () => {
    afficher([
      buildOwnerAppointment({
        id: "abc",
        appointment_type_name: "Consultation",
        clinic_name: "Clinique des Peupliers",
        resource_name: "Dr Martin",
        pet_name: "Rex",
        reason: "Il boite depuis mardi",
        starts_at: "2026-08-25T07:00:00Z",
        ends_at: "2026-08-25T07:30:00Z",
      }),
    ]);

    expect(
      screen.getByRole("heading", { name: "Consultation", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Dr Martin")).toBeInTheDocument();
    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.getByText("Il boite depuis mardi")).toBeInTheDocument();
  });

  it("mène à la fiche de l'animal concerné", () => {
    afficher([
      buildOwnerAppointment({ id: "abc", pet_id: "rex-id", pet_name: "Rex" }),
    ]);

    expect(screen.getByRole("button", { name: "Rex" })).toHaveAttribute(
      "href",
      "/animaux/rex-id",
    );
  });

  it("dit « Non précisé » plutôt que de fabriquer un lien mort", () => {
    afficher([
      buildOwnerAppointment({ id: "abc", pet_id: null, pet_name: null }),
    ]);

    expect(screen.getByText("Non précisé")).toBeInTheDocument();
  });

  it("montre enfin la raison d'annulation, que rien n'affichait", () => {
    afficher([
      buildOwnerAppointment({
        id: "abc",
        status: "cancelled",
        cancelled_reason: "Le praticien est souffrant",
      }),
    ]);

    expect(screen.getByText("Rendez-vous annulé")).toBeInTheDocument();
    expect(screen.getByText("Le praticien est souffrant")).toBeInTheDocument();
  });

  it("propose l'annulation tant que le délai le permet", () => {
    afficher([
      buildOwnerAppointment({
        id: "abc",
        starts_at: "2026-08-25T07:00:00Z",
        status: "confirmed",
      }),
    ]);

    expect(
      screen.getByRole("button", { name: "Annuler le rendez-vous" }),
    ).toBeInTheDocument();
  });

  it("ne la propose plus à moins de 24 h", () => {
    // Pré-vérification d'affichage : éviter un bouton voué au 409.
    afficher([
      buildOwnerAppointment({
        id: "abc",
        starts_at: "2026-08-20T18:00:00Z",
        status: "confirmed",
      }),
    ]);

    expect(
      screen.queryByRole("button", { name: "Annuler le rendez-vous" }),
    ).not.toBeInTheDocument();
  });

  it("propose de reprendre rendez-vous depuis une visite passée", () => {
    afficher([
      buildOwnerAppointment({
        id: "abc",
        starts_at: "2026-08-05T07:00:00Z",
        pet_id: "rex-id",
      }),
    ]);

    expect(
      screen.getByRole("button", { name: "Reprendre rendez-vous" }),
    ).toHaveAttribute("href", "/rendez-vous/nouveau?animal=rex-id");
  });

  it("annonce l'introuvable une fois la recherche ABOUTIE, et laisse une sortie", () => {
    afficher([buildOwnerAppointment({ id: "un-autre" })]);

    expect(screen.getByText("Rendez-vous introuvable")).toBeInTheDocument();
    // UNE seule sortie : le lien de retour de la page, present dans tous
    // ses etats. Un second bouton identique serait annonce en double.
    expect(
      screen.getAllByRole("button", { name: "Retour à mes rendez-vous" }),
    ).toHaveLength(1);
  });

  it("n'accuse PAS d'inexistence pendant le chargement", () => {
    // Sans le garde, un rendez-vous parfaitement valide serait declare
    // introuvable le temps d'un aller-retour reseau.
    renderWithProviders(<AppointmentDetailContent id="abc" />);

    expect(screen.queryByText("Rendez-vous introuvable")).not.toBeInTheDocument();
  });
});
