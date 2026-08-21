/**
 * Tests du formulaire animal.
 *
 * LE TEST QUI COMPTE ICI est celui des DEUX CLES DE CACHE. La liste
 * (`listMyPets`) et la fiche (`getMyPet`) sont deux entrees distinctes
 * pour la meme entite : n'invalider que la premiere laissait la page
 * /animaux/[id] afficher les valeurs d'AVANT l'edition, alors qu'un
 * toast venait d'annoncer l'enregistrement. Le bug n'etait visible qu'en
 * naviguant, jamais dans un test qui ne regarde que le dialogue.
 *
 * Second point verrouille : le formulaire envoie la fiche ENTIERE, y
 * compris les champs vides traduits en null -- c'est ce qui permet
 * d'effacer une race saisie par erreur, la route etant un PUT de
 * remplacement.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PetFormDialog } from "@/components/pets/pet-form-dialog";
import {
  getGetMyPetQueryKey,
  getListMyPetsQueryKey,
} from "@/lib/api/generated/pets/pets";
import { buildPet } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ reponse: vi.fn(), toastSuccess: vi.fn() }));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => simulations.toastSuccess(...args),
    error: vi.fn(),
  },
  Toaster: () => null,
}));

// On simule la couche HTTP et non le hook : la vraie mutation TanStack
// est alors exercee, ecritures de cache comprises.
vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

/** Le corps JSON de la derniere requete partie. */
function dernierCorps(): Record<string, unknown> {
  const [, options] = simulations.reponse.mock.calls.at(-1) as [
    string,
    { body: string },
  ];
  return JSON.parse(options.body) as Record<string, unknown>;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PetFormDialog — édition", () => {
  it("met à jour LA FICHE et pas seulement la liste", async () => {
    // Sans cette ecriture, /animaux/[id] afficherait les valeurs d'avant
    // l'edition jusqu'au prochain rechargement.
    const pet = buildPet({ id: "rex", name: "Rex", breed: "Berger australien" });
    const misAJour = { ...pet, name: "Rex II" };
    simulations.reponse.mockResolvedValue({
      status: 200,
      data: misAJour,
      headers: new Headers(),
    });

    const queryClient = createTestQueryClient();
    queryClient.setQueryData(getGetMyPetQueryKey("rex"), {
      status: 200,
      data: pet,
      headers: new Headers(),
    });

    renderWithProviders(
      <PetFormDialog open onOpenChange={vi.fn()} pet={pet} />,
      { queryClient },
    );

    const utilisateur = userEvent.setup();
    await utilisateur.clear(screen.getByLabelText("Nom"));
    await utilisateur.type(screen.getByLabelText("Nom"), "Rex II");
    await utilisateur.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      const cache = queryClient.getQueryData<{ data: { name: string } }>(
        getGetMyPetQueryKey("rex"),
      );
      expect(cache?.data.name).toBe("Rex II");
    });
  });

  it("rafraîchit aussi la liste, montée ailleurs dans l'écran", async () => {
    const pet = buildPet({ id: "rex", name: "Rex" });
    simulations.reponse.mockResolvedValue({
      status: 200,
      data: pet,
      headers: new Headers(),
    });
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    renderWithProviders(
      <PetFormDialog open onOpenChange={vi.fn()} pet={pet} />,
      { queryClient },
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: getListMyPetsQueryKey(),
      }),
    );
  });

  it("envoie la fiche ENTIERE, champs vides traduits en null", async () => {
    // La route est un PUT de remplacement : c'est ainsi qu'on efface une
    // race saisie par erreur.
    const pet = buildPet({ id: "rex", breed: "Berger australien" });
    simulations.reponse.mockResolvedValue({
      status: 200,
      data: pet,
      headers: new Headers(),
    });

    renderWithProviders(
      <PetFormDialog open onOpenChange={vi.fn()} pet={pet} />,
    );

    const utilisateur = userEvent.setup();
    await utilisateur.clear(screen.getByLabelText(/Race/));
    await utilisateur.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(simulations.reponse).toHaveBeenCalled());
    const corps = dernierCorps();
    expect(corps.breed).toBeNull();
    // Les autres champs partent quand meme : c'est un remplacement.
    expect(Object.keys(corps).sort()).toEqual([
      "birth_date",
      "breed",
      "name",
      "sex",
      "species",
      "sterilized",
    ]);
  });
});

describe("PetFormDialog — création", () => {
  it("annonce l'ajout par son nom", async () => {
    simulations.reponse.mockResolvedValue({
      status: 201,
      data: buildPet({ id: "neuf", name: "Caramel" }),
      headers: new Headers(),
    });

    renderWithProviders(<PetFormDialog open onOpenChange={vi.fn()} />);

    const utilisateur = userEvent.setup();
    await utilisateur.type(screen.getByLabelText("Nom"), "Caramel");
    await utilisateur.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(simulations.toastSuccess).toHaveBeenCalledWith(
        "Caramel a été ajouté",
      ),
    );
  });
});
