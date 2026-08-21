/**
 * Tests de la fiche d'un animal.
 *
 * Deux mécanismes distincts s'y croisent, et c'est délibéré :
 * l'identité vient d'un endpoint UNITAIRE (arriver ici par un lien
 * partagé ou un F5 est un cas normal, c'est une page qu'on met en
 * favori), tandis que l'historique est DERIVE du cache des rendez-vous,
 * de toute façon déjà chargé par le reste du portail.
 *
 * Le cas le plus subtil est le 404 : il ne dit pas « erreur » mais
 * « introuvable », parce que le backend ne fait volontairement pas la
 * différence entre un animal inexistant et celui d'un autre
 * propriétaire.
 */
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PetDetailContent } from "@/components/pets/pet-detail-content";
import { getListMyAppointmentsQueryKey } from "@/lib/api/generated/owner-appointments/owner-appointments";
import { getGetMyPetQueryKey } from "@/lib/api/generated/pets/pets";
import type {
  OwnerAppointmentResponse,
  PetResponse,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import { buildOwnerAppointment, buildPet } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ reponse: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/animaux/rex",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

const MAINTENANT = new Date("2026-08-21T10:00:00Z");

function afficher(
  pet: PetResponse | null,
  appointments: OwnerAppointmentResponse[] = [],
) {
  const queryClient = createTestQueryClient();
  const enveloppe = (data: unknown) => ({
    status: 200,
    data,
    headers: new Headers(),
  });
  if (pet !== null) {
    queryClient.setQueryData(getGetMyPetQueryKey(pet.id), enveloppe(pet));
  }
  queryClient.setQueryData(
    getListMyAppointmentsQueryKey(),
    enveloppe(appointments),
  );
  return renderWithProviders(
    <PetDetailContent id={pet?.id ?? "inconnu"} />,
    { queryClient },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(MAINTENANT);
});

describe("PetDetailContent — identité", () => {
  it("présente l'animal et compose son sous-titre", () => {
    afficher(
      buildPet({
        id: "rex",
        name: "Rex",
        species: "dog",
        breed: "Berger australien",
        birth_date: "2021-03-12",
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Rex", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Chien · Berger australien · 5 ans"),
    ).toBeInTheDocument();
  });

  it("affiche la date de naissance avec l'âge entre parenthèses", () => {
    afficher(buildPet({ id: "rex", birth_date: "2021-03-12" }));

    expect(
      screen.getByText("vendredi 12 mars 2021 (5 ans)"),
    ).toBeInTheDocument();
  });

  it("dit « Non renseigné » plutôt que de laisser un blanc", () => {
    // Un vide silencieux laisse croire a un bug ou a une donnee perdue.
    afficher(
      buildPet({ id: "rex", breed: null, birth_date: null, sterilized: null }),
    );

    expect(screen.getAllByText("Non renseigné").length).toBeGreaterThanOrEqual(3);
  });

  it("mène au tunnel avec l'animal déjà désigné", () => {
    afficher(buildPet({ id: "rex", name: "Rex" }));

    expect(
      screen.getByRole("button", { name: "Prendre rendez-vous" }),
    ).toHaveAttribute("href", "/rendez-vous/nouveau?animal=rex");
  });

  it("nomme l'animal dans l'action destructive", () => {
    // "Supprimer" seul ne dit pas QUOI ; le nom leve l'ambiguite, y
    // compris pour un lecteur d'ecran qui parcourt les boutons.
    afficher(buildPet({ id: "rex", name: "Rex" }));

    expect(
      screen.getByRole("button", { name: "Supprimer Rex" }),
    ).toBeInTheDocument();
  });
});

describe("PetDetailContent — historique", () => {
  it("ne montre que les rendez-vous de CET animal", () => {
    afficher(buildPet({ id: "rex", name: "Rex" }), [
      buildOwnerAppointment({
        id: "a-rex",
        pet_id: "rex",
        appointment_type_name: "Vaccination de Rex",
        starts_at: "2026-08-25T07:00:00Z",
      }),
      buildOwnerAppointment({
        id: "a-autre",
        pet_id: "mistigri",
        appointment_type_name: "Visite de Mistigri",
        starts_at: "2026-08-26T07:00:00Z",
      }),
    ]);

    expect(screen.getByText("Vaccination de Rex")).toBeInTheDocument();
    expect(screen.queryByText("Visite de Mistigri")).not.toBeInTheDocument();
  });

  it("sépare l'à-venir du passé", () => {
    afficher(buildPet({ id: "rex", name: "Rex" }), [
      buildOwnerAppointment({ id: "f", pet_id: "rex", starts_at: "2026-08-25T07:00:00Z" }),
      buildOwnerAppointment({ id: "p", pet_id: "rex", starts_at: "2026-08-05T07:00:00Z" }),
    ]);

    expect(screen.getByText("À venir")).toBeInTheDocument();
    expect(screen.getByText("Passés")).toBeInTheDocument();
  });

  it("propose la première visite quand il n'y a rien", () => {
    afficher(buildPet({ id: "rex", name: "Rex" }));

    expect(
      screen.getByText("Aucun rendez-vous pour Rex"),
    ).toBeInTheDocument();
  });
});

describe("PetDetailContent — animal introuvable", () => {
  it("dit « introuvable » sur un 404, et non « erreur »", async () => {
    // Le backend ne distingue volontairement pas "n'existe pas" de
    // "n'est pas a vous" : l'ecran ne doit donc pas suggerer une panne.
    simulations.reponse.mockRejectedValue(
      Object.assign(new Error("404"), {
        status: 404,
        code: "patients.pet_not_found",
        detail: "Animal introuvable.",
      }),
    );

    renderWithProviders(<PetDetailContent id="inconnu" />);

    expect(await screen.findByText("Animal introuvable")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Réessayer" }),
    ).not.toBeInTheDocument();
  });

  it("propose de réessayer sur une vraie panne", async () => {
    simulations.reponse.mockRejectedValue(new TypeError("Failed to fetch"));

    renderWithProviders(<PetDetailContent id="rex" />);

    expect(
      await screen.findByRole("button", { name: "Réessayer" }),
    ).toBeInTheDocument();
  });
});
