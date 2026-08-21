/**
 * Tests de la section « Aujourd'hui » du tableau de bord.
 *
 * C'est l'écran que le poste d'accueil garde ouvert toute la journée. Ses
 * quatre états doivent tous être atteignables : chargement, échec avec
 * possibilité de relance, journée libre, et liste garnie. La régression la
 * plus coûteuse serait un état d'erreur sans bouton de reprise — l'accueil
 * resterait devant un écran mort sans savoir que recharger suffirait.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TodaySection } from "@/components/dashboard/today-section";
import { buildAgendaEntry } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ useGetAgenda: vi.fn() }));

vi.mock("@/lib/api/generated/scheduling/scheduling", async (importOriginal) => ({
  // Report du vrai module : les mutations utilisées par les boutons d'action
  // de chaque ligne restent intactes.
  ...(await importOriginal<
    typeof import("@/lib/api/generated/scheduling/scheduling")
  >()),
  useGetAgenda: simulations.useGetAgenda,
}));

function requete(surcharges: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...surcharges,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-20T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("TodaySection", () => {
  it("reste évasive tant que la journée n'est pas chargée", () => {
    // Afficher « 0 rendez-vous » pendant le chargement ferait croire à une
    // journée libre : la phrase générique est volontaire.
    simulations.useGetAgenda.mockReturnValue(requete({ isPending: true }));
    renderWithProviders(<TodaySection />);

    expect(
      screen.getByText("Les rendez-vous du jour, dans l'ordre de la journée."),
    ).toBeInTheDocument();
  });

  it("propose de relancer quand le chargement échoue", async () => {
    const refetch = vi.fn();
    simulations.useGetAgenda.mockReturnValue(requete({ isError: true, refetch }));
    renderWithProviders(<TodaySection />);

    expect(
      screen.getByText("Impossible de charger la journée."),
    ).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Réessayer" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("oriente vers l'agenda quand la journée est libre", () => {
    simulations.useGetAgenda.mockReturnValue(requete({ data: [] }));
    renderWithProviders(<TodaySection />);

    expect(
      screen.getByText("Aucun rendez-vous aujourd'hui"),
    ).toBeInTheDocument();
    expect(screen.getByText("0 rendez-vous au planning.")).toBeInTheDocument();
  });

  it("liste les rendez-vous du jour et les compte", () => {
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: [
          buildAgendaEntry({
            id: "1",
            starts_at: "2026-08-20T07:00:00Z",
            appointment_type_name: "Vaccination",
          }),
          buildAgendaEntry({
            id: "2",
            starts_at: "2026-08-20T08:00:00Z",
            appointment_type_name: "Détartrage",
          }),
        ],
      }),
    );
    renderWithProviders(<TodaySection />);

    expect(screen.getByText("Vaccination")).toBeInTheDocument();
    expect(screen.getByText("Détartrage")).toBeInTheDocument();
    expect(screen.getByText("2 rendez-vous au planning.")).toBeInTheDocument();
  });

  it("n'affiche ni les annulés ni les autres jours", () => {
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: [
          buildAgendaEntry({
            id: "1",
            starts_at: "2026-08-20T07:00:00Z",
            appointment_type_name: "Vaccination",
          }),
          buildAgendaEntry({
            id: "2",
            starts_at: "2026-08-20T08:00:00Z",
            appointment_type_name: "Radiographie",
            status: "cancelled",
          }),
          buildAgendaEntry({
            id: "3",
            starts_at: "2026-08-21T07:00:00Z",
            appointment_type_name: "Chirurgie",
          }),
        ],
      }),
    );
    renderWithProviders(<TodaySection />);

    expect(screen.getByText("Vaccination")).toBeInTheDocument();
    expect(screen.queryByText("Radiographie")).not.toBeInTheDocument();
    expect(screen.queryByText("Chirurgie")).not.toBeInTheDocument();
    expect(screen.getByText("1 rendez-vous au planning.")).toBeInTheDocument();
  });
});
