/**
 * Tests de l'invite « Complétez votre profil ».
 *
 * Le test qui compte est celui du SILENCE : la carte ne doit rien rendre
 * quand la fiche est complète. Une invite permanente deviendrait un
 * décor que l'oeil apprend à ignorer.
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProfileCompletionCard } from "@/components/dashboard/profile-completion-card";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { buildAddress, buildOwner } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tableau-de-bord",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function afficher(surcharges: Parameters<typeof buildOwner>[0]) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(getGetCurrentOwnerQueryKey(), {
    status: 200,
    data: buildOwner(surcharges),
    headers: new Headers(),
  });
  return renderWithProviders(<ProfileCompletionCard />, { queryClient });
}

describe("ProfileCompletionCard", () => {
  it("disparaît quand la fiche est complète", () => {
    const { container } = afficher({
      phone: "0612345678",
      address: buildAddress(),
    });

    expect(container.querySelector('[data-slot="card"]')).toBeNull();
  });

  it("ne s'affiche pas avant que la session soit résolue", () => {
    const { container } = renderWithProviders(<ProfileCompletionCard />);

    expect(container.querySelector('[data-slot="card"]')).toBeNull();
  });

  it("nomme ce qui manque et mène à l'écran qui le corrige", () => {
    afficher({ phone: null, address: null });

    expect(screen.getByText("Téléphone")).toBeInTheDocument();
    expect(screen.getByText("Adresse")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Compléter mon profil" }),
    ).toHaveAttribute("href", "/mon-compte");
  });

  it("adapte son explication au seul champ manquant", () => {
    afficher({ phone: "0612345678", address: null });

    expect(screen.getByText(/dossier/)).toBeInTheDocument();
    expect(screen.queryByText("Téléphone")).not.toBeInTheDocument();
  });
});
