/**
 * Tests de la barre d'outils de l'agenda.
 *
 * Elle est entièrement pilotée par ses propriétés : aucun réseau, aucun état
 * interne. Ce qu'elle porte, ce sont sept commandes que le personnel utilise
 * des dizaines de fois par jour — naviguer dans le temps, changer de vue,
 * filtrer par praticien, créer. Une commande qui n'appelle plus rien ne
 * produit aucune erreur : le bouton devient simplement inerte, et personne ne
 * sait pourquoi l'agenda ne bouge plus.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AgendaToolbar } from "@/components/agenda/agenda-toolbar";
import { ALL_RESOURCES } from "@/components/agenda/use-agenda-url-state";
import { buildResource } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

/** Propriétés par défaut ; chaque test ne précise que ce qu'il éprouve. */
function proprietes(surcharges: Record<string, unknown> = {}) {
  return {
    view: "week" as const,
    onViewChange: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onToday: vi.fn(),
    rangeLabel: "17-23 août 2026",
    anchorDate: new Date(2026, 7, 20),
    onAnchorSelect: vi.fn(),
    resourceId: ALL_RESOURCES,
    onResourceChange: vi.fn(),
    resources: [
      buildResource({ id: "r1", name: "Dr Martin" }),
      buildResource({ id: "r2", name: "Dr Leroy" }),
    ],
    onNewAppointment: vi.fn(),
    ...surcharges,
  };
}

describe("AgendaToolbar — repères", () => {
  it("affiche la période courante", () => {
    // Sans ce libellé, rien n'indique quelle semaine est à l'écran.
    renderWithProviders(<AgendaToolbar {...proprietes()} />);
    expect(screen.getByText("17-23 août 2026")).toBeInTheDocument();
  });

  it("expose les deux vues", () => {
    renderWithProviders(<AgendaToolbar {...proprietes()} />);

    expect(screen.getByText("Jour")).toBeInTheDocument();
    expect(screen.getByText("Semaine")).toBeInTheDocument();
  });
});

describe("AgendaToolbar — navigation dans le temps", () => {
  it("recule d'une période", async () => {
    const props = proprietes();
    renderWithProviders(<AgendaToolbar {...props} />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Période précédente" }));

    expect(props.onPrevious).toHaveBeenCalledOnce();
  });

  it("avance d'une période", async () => {
    const props = proprietes();
    renderWithProviders(<AgendaToolbar {...props} />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Période suivante" }));

    expect(props.onNext).toHaveBeenCalledOnce();
  });

  it("revient à aujourd'hui", async () => {
    // Le raccourci le plus utilisé après une exploration du calendrier.
    const props = proprietes();
    renderWithProviders(<AgendaToolbar {...props} />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Aujourd'hui/ }));

    expect(props.onToday).toHaveBeenCalledOnce();
  });
});

describe("AgendaToolbar — vue et filtre", () => {
  it("bascule en vue jour", async () => {
    const props = proprietes({ view: "week" });
    renderWithProviders(<AgendaToolbar {...props} />);

    await userEvent.setup().click(screen.getByText("Jour"));

    expect(props.onViewChange).toHaveBeenCalledWith("day");
  });

  it("liste les praticiens du filtre", async () => {
    renderWithProviders(<AgendaToolbar {...proprietes()} />);

    await userEvent
      .setup()
      .click(screen.getByRole("combobox", { name: /Filtrer par praticien/ }));

    expect(await screen.findByText("Dr Martin")).toBeInTheDocument();
    expect(screen.getByText("Dr Leroy")).toBeInTheDocument();
  });

  it("remonte le praticien choisi", async () => {
    const props = proprietes();
    renderWithProviders(<AgendaToolbar {...props} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox", { name: /Filtrer par praticien/ }));
    // Cliquer l'OPTION, pas son texte : le gestionnaire est posé sur
    // l'élément de liste, pas sur le libellé qu'il contient.
    await user.click(await screen.findByRole("option", { name: "Dr Martin" }));

    expect(props.onResourceChange).toHaveBeenCalledWith("r1");
  });
});

describe("AgendaToolbar — création", () => {
  it("déclenche la création d'un rendez-vous", async () => {
    const props = proprietes();
    renderWithProviders(<AgendaToolbar {...props} />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Nouveau rendez-vous/ }));

    expect(props.onNewAppointment).toHaveBeenCalledOnce();
  });
});
