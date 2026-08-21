/**
 * Tests de la page d'accueil de l'espace clinique.
 *
 * Elle assemble trois cartes et compose une salutation datée. Le point qui
 * mérite un test est la robustesse de cette salutation : elle doit rester
 * lisible AVANT que la session soit résolue — « Bonjour » tout court plutôt
 * qu'un « Bonjour, undefined » qui accueillerait mal le personnel.
 */
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { getGetCurrentUserQueryKey } from "@/lib/api/generated/auth/auth";
import { buildUser } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

// Les trois cartes ont leurs propres tests : on les simule pour n'éprouver
// que l'assemblage et la salutation.
vi.mock("@/components/dashboard/today-section", () => ({
  TodaySection: () => <div>Section du jour</div>,
}));
vi.mock("@/components/dashboard/pending-card", () => ({
  PendingCard: () => <div>Carte à confirmer</div>,
}));
vi.mock("@/components/dashboard/today-by-practitioner", () => ({
  TodayByPractitioner: () => <div>Charge par praticien</div>,
}));

function afficher(surcharges: Parameters<typeof buildUser>[0] = {}) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(getGetCurrentUserQueryKey(), {
    status: 200,
    data: buildUser(surcharges),
    headers: new Headers(),
  });
  return renderWithProviders(<DashboardContent />, { queryClient });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-20T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DashboardContent — salutation", () => {
  it("salue par le prénom une fois la session résolue", () => {
    afficher({ first_name: "Camille" });

    expect(
      screen.getByRole("heading", { name: "Bonjour, Camille", level: 1 }),
    ).toBeInTheDocument();
  });

  it("reste correcte avant la résolution de la session", () => {
    // « Bonjour, undefined » accueillerait mal le personnel : le composant
    // se replie sur une salutation simple.
    renderWithProviders(<DashboardContent />);

    expect(
      screen.getByRole("heading", { name: "Bonjour", level: 1 }),
    ).toBeInTheDocument();
  });

  it("rappelle la clinique connectée dans la date", () => {
    afficher({ clinic_name: "Clinique des Peupliers" });

    expect(
      screen.getByText(/Clinique des Peupliers/),
    ).toBeInTheDocument();
  });

  it("date la journée en français, première lettre en majuscule", () => {
    // 20 août 2026 est un jeudi. La majuscule initiale est ajoutée à la
    // main : Intl renvoie « jeudi » en minuscule.
    afficher();

    expect(screen.getByText(/^Jeudi/)).toBeInTheDocument();
  });
});

describe("DashboardContent — assemblage", () => {
  it("réunit les trois cartes", () => {
    afficher();

    expect(screen.getByText("Section du jour")).toBeInTheDocument();
    expect(screen.getByText("Carte à confirmer")).toBeInTheDocument();
    expect(screen.getByText("Charge par praticien")).toBeInTheDocument();
  });

  it("propose un accès direct à l'agenda", () => {
    afficher();

    expect(
      screen.getByRole("button", { name: /Voir l'agenda/ }),
    ).toHaveAttribute("href", "/agenda");
  });
});
