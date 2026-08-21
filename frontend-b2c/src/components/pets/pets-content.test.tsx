/**
 * Tests de la page « Mes animaux ».
 *
 * Elle porte les quatre états d'une liste plus l'aiguillage vers deux boîtes
 * de dialogue : renommer un animal existant, ou en créer un nouveau. La
 * confusion entre les deux est le risque réel — ouvrir la création avec les
 * données de l'animal précédemment édité créerait un doublon au lieu d'un
 * nouvel animal.
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PetsContent } from "@/components/pets/pets-content";
import { buildPet } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ useListMyPets: vi.fn() }));

vi.mock("@/lib/api/generated/pets/pets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/generated/pets/pets")>()),
  useListMyPets: simulations.useListMyPets,
}));

function requete(surcharges: Record<string, unknown> = {}) {
  return { data: undefined, isPending: false, isError: false, ...surcharges };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PetsContent — états de la liste", () => {
  it("garde le bouton d'ajout pendant le chargement", () => {
    // L'action principale ne doit jamais dépendre du chargement de la liste.
    simulations.useListMyPets.mockReturnValue(requete({ isPending: true }));
    renderWithProviders(<PetsContent />);

    expect(
      screen.getByRole("heading", { name: "Mes animaux", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ajouter un animal/ }),
    ).toBeInTheDocument();
  });

  it("annonce l'échec du chargement", () => {
    simulations.useListMyPets.mockReturnValue(requete({ isError: true }));
    renderWithProviders(<PetsContent />);

    expect(
      screen.getByText(/Impossible de charger vos animaux/),
    ).toBeInTheDocument();
  });

  it("invite à commencer quand aucun animal n'est enregistré", () => {
    simulations.useListMyPets.mockReturnValue(requete({ data: [] }));
    renderWithProviders(<PetsContent />);

    expect(
      screen.getByText("Ajoutez votre premier compagnon"),
    ).toBeInTheDocument();
    // Le bouton d'ajout apparaît deux fois : en tête et dans l'état vide,
    // où il est bien plus visible.
    expect(
      screen.getAllByRole("button", { name: /Ajouter un animal/ }),
    ).toHaveLength(2);
  });

  it("liste chaque animal avec son espèce", () => {
    simulations.useListMyPets.mockReturnValue(
      requete({
        data: [
          buildPet({ id: "1", name: "Rex", species: "dog" }),
          buildPet({ id: "2", name: "Minou", species: "cat" }),
        ],
      }),
    );
    renderWithProviders(<PetsContent />);

    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.getByText("Chien")).toBeInTheDocument();
    expect(screen.getByText("Minou")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("propose renommer et supprimer sur chaque animal", () => {
    simulations.useListMyPets.mockReturnValue(
      requete({ data: [buildPet({ name: "Rex" })] }),
    );
    renderWithProviders(<PetsContent />);

    expect(screen.getByRole("button", { name: /Renommer/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Supprimer/ })).toBeInTheDocument();
  });
});

describe("PetsContent — ouverture des dialogues", () => {
  it("ouvre la création avec un formulaire vierge", async () => {
    simulations.useListMyPets.mockReturnValue(
      requete({ data: [buildPet({ name: "Rex" })] }),
    );
    renderWithProviders(<PetsContent />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Ajouter un animal/ }));

    const boite = await screen.findByRole("dialog");
    expect(within(boite).getByLabelText(/Nom/)).toHaveValue("");
  });

  it("ouvre le renommage prérempli avec l'animal choisi", async () => {
    simulations.useListMyPets.mockReturnValue(
      requete({
        data: [
          buildPet({ id: "1", name: "Rex" }),
          buildPet({ id: "2", name: "Minou", species: "cat" }),
        ],
      }),
    );
    renderWithProviders(<PetsContent />);

    const lignes = screen.getAllByRole("button", { name: /Renommer/ });
    await userEvent.setup().click(lignes[1]);

    const boite = await screen.findByRole("dialog");
    expect(within(boite).getByLabelText(/Nom/)).toHaveValue("Minou");
  });

  it("repasse à un formulaire vierge après un renommage", async () => {
    // Le vrai risque : réutiliser l'animal précédemment édité ferait
    // créer un doublon au lieu d'un nouvel animal.
    simulations.useListMyPets.mockReturnValue(
      requete({ data: [buildPet({ name: "Rex" })] }),
    );
    renderWithProviders(<PetsContent />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Renommer/ }));
    expect(within(await screen.findByRole("dialog")).getByLabelText(/Nom/)).toHaveValue(
      "Rex",
    );
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: /Ajouter un animal/ }));
    const boite = await screen.findByRole("dialog");
    expect(within(boite).getByLabelText(/Nom/)).toHaveValue("");
  });
});
