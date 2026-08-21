/**
 * Tests de la page « Mes animaux ».
 *
 * Depuis la refonte, la liste est une GRILLE de cartes-liens et ne porte
 * plus d'actions par animal : « Modifier » et « Supprimer » ont rejoint
 * la fiche. Ce n'est pas un choix esthétique — des boutons imbriqués
 * dans une carte-lien produisent des contrôles emboîtés, au comportement
 * clavier ambigu — et c'est exactement ce que ces tests verrouillent.
 *
 * Le pied de chaque carte porte le suivi de l'animal, dérivé du cache
 * des rendez-vous : prochain rendez-vous, sinon dernière visite, sinon
 * l'aveu qu'il n'y en a pas.
 */
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PetsContent } from "@/components/pets/pets-content";
import { getListMyAppointmentsQueryKey } from "@/lib/api/generated/owner-appointments/owner-appointments";
import { getListMyPetsQueryKey } from "@/lib/api/generated/pets/pets";
import type {
  OwnerAppointmentResponse,
  PetResponse,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import { buildOwnerAppointment, buildPet } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

vi.mock("next/navigation", () => ({
  usePathname: () => "/animaux",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const MAINTENANT = new Date("2026-08-21T10:00:00Z");

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
  return renderWithProviders(<PetsContent />, { queryClient });
}

beforeEach(() => {
  vi.setSystemTime(MAINTENANT);
});

describe("PetsContent", () => {
  it("titre la page et décrit à quoi elle sert", () => {
    afficher([buildPet()]);

    expect(
      screen.getByRole("heading", { name: "Mes animaux", level: 1 }),
    ).toBeInTheDocument();
  });

  it("fait de chaque carte un lien vers la fiche de l'animal", () => {
    afficher([
      buildPet({ id: "rex", name: "Rex" }),
      buildPet({ id: "mistigri", name: "Mistigri", species: "cat" }),
    ]);

    expect(screen.getByRole("link", { name: /Rex/ })).toHaveAttribute(
      "href",
      "/animaux/rex",
    );
    expect(screen.getByRole("link", { name: /Mistigri/ })).toHaveAttribute(
      "href",
      "/animaux/mistigri",
    );
  });

  it("compose le sous-titre en faisant disparaître ce qui manque", () => {
    afficher([
      buildPet({
        name: "Rex",
        species: "dog",
        breed: "Berger australien",
        birth_date: "2021-03-12",
      }),
      buildPet({
        id: "kiwi",
        name: "Kiwi",
        species: "nac",
        breed: null,
        birth_date: null,
      }),
    ]);

    expect(
      screen.getByText("Chien · Berger australien · 5 ans"),
    ).toBeInTheDocument();
    // Pas de " ·  · " : une fiche peu remplie reste propre.
    expect(screen.getByText("NAC")).toBeInTheDocument();
  });

  it("ne porte AUCUNE action par animal : elles vivent sur la fiche", () => {
    // Un bouton dans une carte-lien produit des controles emboites, au
    // comportement clavier ambigu.
    afficher([buildPet({ name: "Rex" })]);

    expect(
      screen.queryByRole("button", { name: /Modifier/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Supprimer/ }),
    ).not.toBeInTheDocument();
  });

  it("privilégie le prochain rendez-vous sur la dernière visite", () => {
    afficher(
      [buildPet({ id: "rex", name: "Rex" })],
      [
        buildOwnerAppointment({ pet_id: "rex", starts_at: "2026-08-05T07:00:00Z" }),
        buildOwnerAppointment({ pet_id: "rex", starts_at: "2026-08-24T07:00:00Z" }),
      ],
    );

    expect(
      screen.getByText(/Prochain rendez-vous : 24 août/),
    ).toBeInTheDocument();
  });

  it("le dit franchement quand il n'y a jamais eu de visite", () => {
    afficher([buildPet({ id: "rex", name: "Rex" })]);

    expect(screen.getByText("Aucune visite enregistrée")).toBeInTheDocument();
  });

  it("invite à commencer quand aucun animal n'est enregistré", () => {
    afficher([]);

    expect(
      screen.getByText("Ajoutez votre premier compagnon"),
    ).toBeInTheDocument();
    // UN seul bouton d'ajout : l'action d'en-tete s'efface au profit du
    // CTA de l'etat vide, ou l'oeil se pose.
    expect(
      screen.getAllByRole("button", { name: "Ajouter un animal" }),
    ).toHaveLength(1);
  });
});
