/**
 * Tests de la page « Mes rendez-vous ».
 *
 * La page partage la liste en deux sections, à venir et passés, sur le seul
 * critère de la DATE. Deux tris opposés s'y appliquent : les prochains du plus
 * proche au plus lointain, les passés du plus récent au plus ancien. Une
 * inversion ne lève aucune erreur — elle enterre simplement le rendez-vous le
 * plus utile en bas de page.
 */
import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppointmentsContent } from "@/components/appointments/appointments-content";
import { buildOwnerAppointment } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ useListMyAppointments: vi.fn() }));

vi.mock(
  "@/lib/api/generated/owner-appointments/owner-appointments",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/api/generated/owner-appointments/owner-appointments")
    >()),
    useListMyAppointments: simulations.useListMyAppointments,
  }),
);

function requete(surcharges: Record<string, unknown> = {}) {
  return { data: undefined, isPending: false, isError: false, ...surcharges };
}

/** La section demandée, pour y restreindre les recherches. */
function section(nom: "À venir" | "Passés"): HTMLElement {
  return screen.getByRole("heading", { name: nom, level: 2 }).parentElement!;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-20T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("AppointmentsContent — états", () => {
  it("garde le titre et l'accès à la réservation pendant le chargement", () => {
    // Le bouton principal ne doit jamais disparaître : c'est l'action que
    // le propriétaire vient chercher, indépendamment de sa liste.
    simulations.useListMyAppointments.mockReturnValue(requete({ isPending: true }));
    renderWithProviders(<AppointmentsContent />);

    expect(
      screen.getByRole("heading", { name: "Mes rendez-vous", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Prendre rendez-vous/ }),
    ).toBeInTheDocument();
  });

  it("annonce l'échec du chargement", () => {
    simulations.useListMyAppointments.mockReturnValue(requete({ isError: true }));
    renderWithProviders(<AppointmentsContent />);

    expect(
      screen.getByText(/Impossible de charger vos rendez-vous/),
    ).toBeInTheDocument();
  });

  it("propose de commencer quand aucun rendez-vous n'existe", () => {
    // Un écran vide sans issue est une impasse : l'état vide porte lui-même
    // l'invitation à réserver.
    simulations.useListMyAppointments.mockReturnValue(requete({ data: [] }));
    renderWithProviders(<AppointmentsContent />);

    expect(
      screen.getByText("Aucun rendez-vous pour l'instant"),
    ).toBeInTheDocument();
    // Les sections ne sont pas rendues du tout dans cet état.
    expect(
      screen.queryByRole("heading", { name: "À venir" }),
    ).not.toBeInTheDocument();
  });
});

describe("AppointmentsContent — partage à venir / passés", () => {
  it("range chaque rendez-vous selon sa date", () => {
    simulations.useListMyAppointments.mockReturnValue(
      requete({
        data: [
          buildOwnerAppointment({
            id: "futur",
            starts_at: "2026-08-25T07:00:00Z",
            appointment_type_name: "Contrôle à venir",
          }),
          buildOwnerAppointment({
            id: "passe",
            starts_at: "2026-08-10T07:00:00Z",
            appointment_type_name: "Contrôle passé",
          }),
        ],
      }),
    );
    renderWithProviders(<AppointmentsContent />);

    expect(
      within(section("À venir")).getByText(/Contrôle à venir/),
    ).toBeInTheDocument();
    expect(
      within(section("Passés")).getByText(/Contrôle passé/),
    ).toBeInTheDocument();
  });

  it("classe les prochains du plus proche au plus lointain", () => {
    simulations.useListMyAppointments.mockReturnValue(
      requete({
        data: [
          buildOwnerAppointment({
            id: "lointain",
            starts_at: "2026-09-30T07:00:00Z",
            appointment_type_name: "Rappel lointain",
          }),
          buildOwnerAppointment({
            id: "proche",
            starts_at: "2026-08-21T07:00:00Z",
            appointment_type_name: "Visite proche",
          }),
        ],
      }),
    );
    renderWithProviders(<AppointmentsContent />);

    const textes = within(section("À venir"))
      .getAllByText(/Rappel lointain|Visite proche/)
      .map((element) => element.textContent);
    expect(textes[0]).toContain("Visite proche");
  });

  it("classe les passés du plus récent au plus ancien", () => {
    // Tri INVERSE de la section précédente : ce qui vient de se passer est
    // ce dont on se souvient le moins bien, donc ce qu'on cherche d'abord.
    simulations.useListMyAppointments.mockReturnValue(
      requete({
        data: [
          buildOwnerAppointment({
            id: "ancien",
            starts_at: "2026-01-10T07:00:00Z",
            appointment_type_name: "Visite ancienne",
          }),
          buildOwnerAppointment({
            id: "recent",
            starts_at: "2026-08-18T07:00:00Z",
            appointment_type_name: "Visite récente",
          }),
        ],
      }),
    );
    renderWithProviders(<AppointmentsContent />);

    const textes = within(section("Passés"))
      .getAllByText(/Visite ancienne|Visite récente/)
      .map((element) => element.textContent);
    expect(textes[0]).toContain("Visite récente");
  });

  it("classe un rendez-vous futur ANNULÉ dans « À venir »", () => {
    // Constat, pas souhait : le partage se fait sur la date seule, jamais
    // sur le statut. Le badge « Annulé » porte l'information. Ce test fige
    // le comportement réel pour qu'un changement soit un choix délibéré.
    simulations.useListMyAppointments.mockReturnValue(
      requete({
        data: [
          buildOwnerAppointment({
            id: "annule",
            starts_at: "2026-08-25T07:00:00Z",
            appointment_type_name: "Visite annulée",
            status: "cancelled",
          }),
        ],
      }),
    );
    renderWithProviders(<AppointmentsContent />);

    expect(
      within(section("À venir")).getByText(/Visite annulée/),
    ).toBeInTheDocument();
  });

  it("le dit quand une section est vide alors que l'autre ne l'est pas", () => {
    simulations.useListMyAppointments.mockReturnValue(
      requete({
        data: [
          buildOwnerAppointment({ id: "futur", starts_at: "2026-08-25T07:00:00Z" }),
        ],
      }),
    );
    renderWithProviders(<AppointmentsContent />);

    expect(screen.getByText("Aucun rendez-vous passé.")).toBeInTheDocument();
  });
});
