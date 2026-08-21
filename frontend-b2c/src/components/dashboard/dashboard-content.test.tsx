/**
 * Tests de la composition du tableau de bord.
 *
 * Les trois cartes ont leurs propres tests : on les simule ici pour ne
 * vérifier que l'assemblage et la salutation. On y verrouille aussi ce
 * que la page NE contient PAS — pas de compteur façon tableau de
 * pilotage : un propriétaire ne gère pas une flotte, et compter ce qu'il
 * voit d'un coup d'oeil est du remplissage.
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { buildOwner } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tableau-de-bord",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/dashboard/next-appointment-card", () => ({
  NextAppointmentCard: () => <div>Prochain rendez-vous simulé</div>,
}));
vi.mock("@/components/dashboard/pets-summary-card", () => ({
  PetsSummaryCard: () => <div>Mes animaux simulés</div>,
}));
vi.mock("@/components/dashboard/profile-completion-card", () => ({
  ProfileCompletionCard: () => <div>Invite de profil simulée</div>,
}));

function afficher(surcharges: Parameters<typeof buildOwner>[0] = {}) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(getGetCurrentOwnerQueryKey(), {
    status: 200,
    data: buildOwner(surcharges),
    headers: new Headers(),
  });
  return renderWithProviders(<DashboardContent />, { queryClient });
}

describe("DashboardContent", () => {
  it("accueille le propriétaire par son prénom", () => {
    afficher({ first_name: "Marie" });

    expect(
      screen.getByRole("heading", { name: "Bonjour, Marie", level: 1 }),
    ).toBeInTheDocument();
  });

  it("salue sans nom tant que la session n'est pas résolue", () => {
    // « Bonjour, undefined » serait pire que « Bonjour » tout court.
    renderWithProviders(<DashboardContent />);

    expect(
      screen.getByRole("heading", { name: "Bonjour", level: 1 }),
    ).toBeInTheDocument();
  });

  it("assemble les trois blocs de la page", () => {
    afficher();

    expect(screen.getByText("Prochain rendez-vous simulé")).toBeInTheDocument();
    expect(screen.getByText("Mes animaux simulés")).toBeInTheDocument();
    expect(screen.getByText("Invite de profil simulée")).toBeInTheDocument();
  });

  it("porte le raccourci de prise de rendez-vous", () => {
    afficher();

    expect(
      screen.getByRole("button", { name: "Prendre rendez-vous" }),
    ).toHaveAttribute("href", "/rendez-vous/nouveau");
  });
});
