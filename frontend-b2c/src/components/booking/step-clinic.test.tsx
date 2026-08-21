/**
 * Tests de la première étape du tunnel : le choix de la clinique.
 *
 * La recherche filtre un annuaire déjà chargé, sans requête réseau à chaque
 * frappe. Son point délicat est la NORMALISATION : chercher « herault » doit
 * trouver « Hérault », et « MONTPELLIER » doit trouver « Montpellier ». Sans
 * cela, un propriétaire qui tape sans accent conclurait que sa clinique n'est
 * pas référencée et abandonnerait la réservation.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StepClinic } from "@/components/booking/step-clinic";
import { buildPublicClinic } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ useListClinics: vi.fn() }));

vi.mock(
  "@/lib/api/generated/public-clinics/public-clinics",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/api/generated/public-clinics/public-clinics")
    >()),
    useListClinics: simulations.useListClinics,
  }),
);

function requete(surcharges: Record<string, unknown> = {}) {
  return { data: undefined, isPending: false, isError: false, ...surcharges };
}

/** Quelques cliniques d'annuaire, dont une avec un accent. */
function annuaire() {
  return [
    buildPublicClinic({ id: "1", name: "Clinique des Peupliers", city: "Montpellier" }),
    buildPublicClinic({ id: "2", name: "Cabinet de l'Hérault", city: "Béziers" }),
    buildPublicClinic({ id: "3", name: "Vét'Océan", city: null }),
  ];
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("StepClinic — états", () => {
  it("affiche des squelettes pendant le chargement", () => {
    simulations.useListClinics.mockReturnValue(requete({ isPending: true }));
    renderWithProviders(<StepClinic onSelect={vi.fn()} />);

    expect(screen.getByText("Choisissez votre clinique")).toBeInTheDocument();
    expect(
      screen.queryByText("Clinique des Peupliers"),
    ).not.toBeInTheDocument();
  });

  it("annonce l'échec du chargement", () => {
    simulations.useListClinics.mockReturnValue(requete({ isError: true }));
    renderWithProviders(<StepClinic onSelect={vi.fn()} />);

    expect(
      screen.getByText(/Impossible de charger les cliniques/),
    ).toBeInTheDocument();
  });

  it("liste tout l'annuaire quand la recherche est vide", () => {
    simulations.useListClinics.mockReturnValue(requete({ data: annuaire() }));
    renderWithProviders(<StepClinic onSelect={vi.fn()} />);

    expect(screen.getByText("Clinique des Peupliers")).toBeInTheDocument();
    expect(screen.getByText("Cabinet de l'Hérault")).toBeInTheDocument();
    expect(screen.getByText("Vét'Océan")).toBeInTheDocument();
  });
});

describe("StepClinic — recherche", () => {
  it("filtre par nom", async () => {
    simulations.useListClinics.mockReturnValue(requete({ data: annuaire() }));
    renderWithProviders(<StepClinic onSelect={vi.fn()} />);

    await userEvent
      .setup()
      .type(screen.getByLabelText("Rechercher une clinique"), "peupliers");

    expect(screen.getByText("Clinique des Peupliers")).toBeInTheDocument();
    expect(screen.queryByText("Cabinet de l'Hérault")).not.toBeInTheDocument();
  });

  it("filtre par ville", async () => {
    simulations.useListClinics.mockReturnValue(requete({ data: annuaire() }));
    renderWithProviders(<StepClinic onSelect={vi.fn()} />);

    await userEvent
      .setup()
      .type(screen.getByLabelText("Rechercher une clinique"), "beziers");

    expect(screen.getByText("Cabinet de l'Hérault")).toBeInTheDocument();
    expect(screen.queryByText("Clinique des Peupliers")).not.toBeInTheDocument();
  });

  it("ignore les accents", async () => {
    // Personne ne tape « Hérault » avec son accent dans un champ de
    // recherche : sans normalisation, la clinique resterait introuvable.
    simulations.useListClinics.mockReturnValue(requete({ data: annuaire() }));
    renderWithProviders(<StepClinic onSelect={vi.fn()} />);

    await userEvent
      .setup()
      .type(screen.getByLabelText("Rechercher une clinique"), "herault");

    expect(screen.getByText("Cabinet de l'Hérault")).toBeInTheDocument();
  });

  it("ignore la casse", async () => {
    simulations.useListClinics.mockReturnValue(requete({ data: annuaire() }));
    renderWithProviders(<StepClinic onSelect={vi.fn()} />);

    await userEvent
      .setup()
      .type(screen.getByLabelText("Rechercher une clinique"), "MONTPELLIER");

    expect(screen.getByText("Clinique des Peupliers")).toBeInTheDocument();
  });

  it("ne plante pas sur une clinique sans ville", () => {
    // city peut valoir null : un filtre naïf lèverait une exception.
    simulations.useListClinics.mockReturnValue(requete({ data: annuaire() }));
    renderWithProviders(<StepClinic onSelect={vi.fn()} />);

    expect(screen.getByText("Vét'Océan")).toBeInTheDocument();
  });

  it("le dit quand rien ne correspond", async () => {
    simulations.useListClinics.mockReturnValue(requete({ data: annuaire() }));
    renderWithProviders(<StepClinic onSelect={vi.fn()} />);

    await userEvent
      .setup()
      .type(screen.getByLabelText("Rechercher une clinique"), "zzzz");

    expect(
      screen.getByText("Aucune clinique ne correspond à votre recherche."),
    ).toBeInTheDocument();
  });
});

describe("StepClinic — sélection", () => {
  it("remonte la clinique choisie", async () => {
    const onSelect = vi.fn();
    simulations.useListClinics.mockReturnValue(requete({ data: annuaire() }));
    renderWithProviders(<StepClinic onSelect={onSelect} />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Clinique des Peupliers/ }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "1", name: "Clinique des Peupliers" }),
    );
  });
});
