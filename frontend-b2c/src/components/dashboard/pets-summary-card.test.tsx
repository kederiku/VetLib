/**
 * Tests de la carte « Mes animaux » du tableau de bord.
 *
 * Sa valeur tient dans la sous-ligne de chaque animal : prochain
 * rendez-vous s'il y en a un, sinon dernière visite, sinon l'aveu qu'il
 * n'y a rien. Elle est DÉRIVÉE du cache des rendez-vous — un même
 * queryKey, aucune requête supplémentaire — et c'est cette priorité
 * entre les trois cas que les tests verrouillent.
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PetsSummaryCard } from "@/components/dashboard/pets-summary-card";
import { getListMyAppointmentsQueryKey } from "@/lib/api/generated/owner-appointments/owner-appointments";
import { getListMyPetsQueryKey } from "@/lib/api/generated/pets/pets";
import type {
  OwnerAppointmentResponse,
  PetResponse,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import { buildOwnerAppointment, buildPet } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tableau-de-bord",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const MAINTENANT = new Date("2026-08-20T10:00:00Z");

function afficher(
  pets: PetResponse[],
  appointments: OwnerAppointmentResponse[] = [],
) {
  const queryClient = createTestQueryClient();
  const enveloppe = (data: unknown) => ({
    status: 200,
    data,
    headers: new Headers(),
  });
  queryClient.setQueryData(getListMyPetsQueryKey(), enveloppe(pets));
  queryClient.setQueryData(
    getListMyAppointmentsQueryKey(),
    enveloppe(appointments),
  );
  return renderWithProviders(<PetsSummaryCard now={MAINTENANT} />, {
    queryClient,
  });
}

describe("PetsSummaryCard", () => {
  it("liste les animaux du propriétaire", () => {
    afficher([
      buildPet({ id: "rex", name: "Rex" }),
      buildPet({ id: "mistigri", name: "Mistigri", species: "cat" }),
    ]);

    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.getByText("Mistigri")).toBeInTheDocument();
  });

  it("privilégie le prochain rendez-vous sur la dernière visite", () => {
    // Un animal qui a les deux : c'est le futur qui intéresse.
    afficher(
      [buildPet({ id: "rex", name: "Rex" })],
      [
        buildOwnerAppointment({ pet_id: "rex", starts_at: "2026-08-05T07:00:00Z" }),
        buildOwnerAppointment({ pet_id: "rex", starts_at: "2026-08-24T07:00:00Z" }),
      ],
    );

    expect(screen.getByText(/Prochain rendez-vous : 24 août/)).toBeInTheDocument();
  });

  it("retombe sur la dernière visite quand rien n'est prévu", () => {
    afficher(
      [buildPet({ id: "rex", name: "Rex" })],
      [
        buildOwnerAppointment({ pet_id: "rex", starts_at: "2026-08-05T07:00:00Z" }),
      ],
    );

    expect(screen.getByText(/Dernière visite : 5 août/)).toBeInTheDocument();
  });

  it("le dit franchement quand il n'y a jamais eu de visite", () => {
    afficher([buildPet({ id: "rex", name: "Rex" })]);

    expect(screen.getByText("Aucune visite enregistrée")).toBeInTheDocument();
  });

  it("propose d'ajouter un premier compagnon quand la liste est vide", () => {
    afficher([]);

    expect(screen.getByText("Aucun animal enregistré")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ajouter un animal" }),
    ).toBeInTheDocument();
  });
});
