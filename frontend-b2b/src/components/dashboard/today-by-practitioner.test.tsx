/**
 * Tests de la carte « Par praticien » du tableau de bord.
 *
 * Elle donne d'un coup d'oeil qui est débordé et qui a de la marge. Deux
 * choses la rendent lisible : le classement du plus chargé au moins chargé, et
 * des barres PROPORTIONNELLES au plus chargé de la journée. Si la largeur
 * n'était plus relative, toutes les barres se ressembleraient et la carte
 * n'apprendrait plus rien.
 */
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TodayByPractitioner } from "@/components/dashboard/today-by-practitioner";
import { buildAgendaEntry } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ useGetAgenda: vi.fn() }));

vi.mock("@/lib/api/generated/scheduling/scheduling", async (importOriginal) => ({
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

/** Rendez-vous du jour pour un praticien donné. */
function rdv(id: string, resource: string, nom: string, heure = "07") {
  return buildAgendaEntry({
    id,
    resource_id: resource,
    resource_name: nom,
    starts_at: `2026-08-20T${heure}:00:00Z`,
  });
}

/** Largeurs des barres, en pourcentage, dans l'ordre d'affichage. */
function largeurs(): string[] {
  return [...document.querySelectorAll<HTMLElement>("[style*='width']")].map(
    (element) => element.style.width,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-20T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("TodayByPractitioner", () => {
  it("affiche des squelettes pendant le chargement", () => {
    simulations.useGetAgenda.mockReturnValue(requete({ isPending: true }));
    renderWithProviders(<TodayByPractitioner />);

    expect(screen.getByText("Par praticien")).toBeInTheDocument();
    expect(screen.queryByText("Dr Martin")).not.toBeInTheDocument();
  });

  it("le dit quand personne n'a de rendez-vous", () => {
    simulations.useGetAgenda.mockReturnValue(requete({ data: [] }));
    renderWithProviders(<TodayByPractitioner />);

    expect(screen.getByText("Aucun rendez-vous aujourd'hui.")).toBeInTheDocument();
  });

  it("affiche chaque praticien avec son compte", () => {
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: [
          rdv("1", "r1", "Dr Martin", "07"),
          rdv("2", "r1", "Dr Martin", "08"),
          rdv("3", "r2", "Dr Leroy", "09"),
        ],
      }),
    );
    renderWithProviders(<TodayByPractitioner />);

    expect(screen.getByText("Dr Martin")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Dr Leroy")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("donne au plus chargé une barre pleine, aux autres une part relative", () => {
    // Deux rendez-vous contre un : la seconde barre doit faire la moitié.
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: [
          rdv("1", "r1", "Dr Martin", "07"),
          rdv("2", "r1", "Dr Martin", "08"),
          rdv("3", "r2", "Dr Leroy", "09"),
        ],
      }),
    );
    renderWithProviders(<TodayByPractitioner />);

    expect(largeurs()).toEqual(["100%", "50%"]);
  });

  it("ne divise jamais par zéro", () => {
    // Le plancher à 1 dans le calcul du maximum existe pour ce cas : une
    // liste vide produirait sinon une largeur NaN.
    simulations.useGetAgenda.mockReturnValue(requete({ data: [] }));
    renderWithProviders(<TodayByPractitioner />);

    expect(largeurs()).toEqual([]);
  });

  it("masque les barres aux lecteurs d'écran", () => {
    // Le compte chiffré est déjà annoncé juste à côté : faire lire « barre
    // de progression à 50 % » n'apporterait rien.
    simulations.useGetAgenda.mockReturnValue(
      requete({ data: [rdv("1", "r1", "Dr Martin")] }),
    );
    const { container } = renderWithProviders(<TodayByPractitioner />);

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});
