/**
 * Tests de l'aperçu « Prochains rendez-vous » de la page compte.
 *
 * Le composant reçoit TOUS les rendez-vous du propriétaire, passés compris, et
 * doit en extraire les trois prochains. Trois opérations s'enchaînent — filtrer
 * les futurs, trier par date croissante, ne garder que trois — et chacune peut
 * se casser silencieusement : un tri inversé afficherait le rendez-vous le plus
 * lointain en premier, un filtre relâché ferait remonter des visites déjà
 * passées.
 */
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UpcomingAppointments } from "@/components/account/upcoming-appointments";
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

/**
 * Faux retour de requête. RAPPEL : simuler le hook court-circuite son
 * `select`, la donnée doit donc être fournie déjà sélectionnée.
 */
function requete(surcharges: Record<string, unknown> = {}) {
  return { data: undefined, isPending: false, isError: false, ...surcharges };
}

beforeEach(() => {
  // Le composant fige l'instant courant au premier rendu : on fixe l'horloge
  // au 20 août 2026 pour que « futur » et « passé » soient déterministes.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-20T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("UpcomingAppointments — états", () => {
  it("affiche des squelettes pendant le chargement", () => {
    simulations.useListMyAppointments.mockReturnValue(requete({ isPending: true }));
    renderWithProviders(<UpcomingAppointments />);

    expect(screen.getByText("Prochains rendez-vous")).toBeInTheDocument();
    expect(screen.queryByText(/Clinique des Peupliers/)).not.toBeInTheDocument();
  });

  it("reste lisible quand la liste est vide", () => {
    simulations.useListMyAppointments.mockReturnValue(requete({ data: [] }));
    renderWithProviders(<UpcomingAppointments />);

    expect(screen.getByText("Prochains rendez-vous")).toBeInTheDocument();
  });
});

describe("UpcomingAppointments — sélection des rendez-vous", () => {
  it("écarte les rendez-vous déjà passés", () => {
    // Un rendez-vous d'hier n'a plus rien d'« à venir » : le laisser
    // donnerait l'impression qu'il reste quelque chose à honorer.
    simulations.useListMyAppointments.mockReturnValue(
      requete({
        data: [
          buildOwnerAppointment({
            id: "passe",
            starts_at: "2026-08-19T07:00:00Z",
            clinic_name: "Clinique du passé",
          }),
          buildOwnerAppointment({
            id: "futur",
            starts_at: "2026-08-25T07:00:00Z",
            clinic_name: "Clinique à venir",
          }),
        ],
      }),
    );
    renderWithProviders(<UpcomingAppointments />);

    expect(screen.getByText(/Clinique à venir/)).toBeInTheDocument();
    expect(screen.queryByText(/Clinique du passé/)).not.toBeInTheDocument();
  });

  it("présente le plus proche en premier", () => {
    // Un tri inversé mettrait en tête le rendez-vous le plus lointain :
    // l'information la plus utile disparaîtrait du haut de la carte.
    simulations.useListMyAppointments.mockReturnValue(
      requete({
        data: [
          buildOwnerAppointment({
            id: "lointain",
            starts_at: "2026-09-30T07:00:00Z",
            clinic_name: "Clinique lointaine",
          }),
          buildOwnerAppointment({
            id: "proche",
            starts_at: "2026-08-21T07:00:00Z",
            clinic_name: "Clinique proche",
          }),
        ],
      }),
    );
    renderWithProviders(<UpcomingAppointments />);

    const lignes = screen.getAllByText(/Clinique (lointaine|proche)/);
    expect(lignes[0]).toHaveTextContent("Clinique proche");
  });

  it("n'affiche que les trois prochains", () => {
    // C'est un APERÇU : au-delà de trois, la carte du compte deviendrait
    // une seconde liste complète et perdrait son rôle.
    simulations.useListMyAppointments.mockReturnValue(
      requete({
        data: Array.from({ length: 5 }, (_, i) =>
          buildOwnerAppointment({
            id: `rdv-${i}`,
            starts_at: `2026-08-2${i + 1}T07:00:00Z`,
            clinic_name: `Clinique ${i + 1}`,
          }),
        ),
      }),
    );
    renderWithProviders(<UpcomingAppointments />);

    expect(screen.getByText(/Clinique 1/)).toBeInTheDocument();
    expect(screen.getByText(/Clinique 3/)).toBeInTheDocument();
    expect(screen.queryByText(/Clinique 4/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Clinique 5/)).not.toBeInTheDocument();
  });

  it("conserve un rendez-vous annulé mais futur", () => {
    // Constat, pas souhait : le filtre porte sur la DATE seule. Un
    // rendez-vous annulé à venir reste affiché, avec son badge « Annulé ».
    // C'est défendable (le propriétaire voit qu'il n'a plus à s'y rendre)
    // et ce test fige le comportement réel pour qu'un changement soit un
    // choix, pas un effet de bord.
    simulations.useListMyAppointments.mockReturnValue(
      requete({
        data: [
          buildOwnerAppointment({
            id: "annule",
            starts_at: "2026-08-25T07:00:00Z",
            clinic_name: "Clinique annulée",
            status: "cancelled",
          }),
        ],
      }),
    );
    renderWithProviders(<UpcomingAppointments />);

    expect(screen.getByText(/Clinique annulée/)).toBeInTheDocument();
  });
});
