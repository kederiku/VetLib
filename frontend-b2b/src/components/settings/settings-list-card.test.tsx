/**
 * Tests de la carte de liste des écrans de réglages.
 *
 * C'est la coquille commune aux onglets « types de rendez-vous » et
 * « praticiens ». Elle porte quatre états MUTUELLEMENT EXCLUSIFS : chargement,
 * erreur, liste vide, liste garnie. La régression classique est d'en afficher
 * deux à la fois (des squelettes ET la liste), ou de perdre le bouton de
 * création dans l'état vide — ce qui enferme l'utilisateur dans un écran vide
 * sans moyen d'en sortir.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClipboardListIcon } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { SettingsListCard } from "@/components/settings/settings-list-card";

/** Propriétés communes ; chaque test ne précise que l'état qu'il éprouve. */
function proprietes(surcharges: Record<string, unknown> = {}) {
  return {
    title: "Types de rendez-vous",
    description: "Les motifs proposés à la réservation.",
    createLabel: "Nouveau type",
    onCreate: vi.fn(),
    isPending: false,
    isError: false,
    errorTitle: "Impossible de charger les types.",
    onRetry: vi.fn(),
    isEmpty: false,
    emptyState: {
      icon: <ClipboardListIcon />,
      title: "Aucun type",
      description: "Créez votre premier type de rendez-vous.",
    },
    children: <table><tbody><tr><td>Consultation</td></tr></tbody></table>,
    ...surcharges,
  };
}

describe("SettingsListCard — état de chargement", () => {
  it("montre des squelettes et masque la liste", () => {
    render(<SettingsListCard {...proprietes({ isPending: true })} />);

    expect(screen.queryByText("Consultation")).not.toBeInTheDocument();
    expect(screen.queryByText("Aucun type")).not.toBeInTheDocument();
  });
});

describe("SettingsListCard — état d'erreur", () => {
  it("montre l'erreur spécifique et masque la liste", () => {
    render(<SettingsListCard {...proprietes({ isError: true })} />);

    expect(
      screen.getByText("Impossible de charger les types."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Consultation")).not.toBeInTheDocument();
  });

  it("permet de relancer le chargement", async () => {
    const onRetry = vi.fn();
    render(<SettingsListCard {...proprietes({ isError: true, onRetry })} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Réessayer" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("donne la priorité au chargement sur l'erreur", () => {
    // Les deux drapeaux ne devraient jamais être vrais ensemble, mais si
    // cela arrivait, mieux vaut montrer le chargement qu'une erreur qui
    // pourrait n'être que transitoire.
    render(
      <SettingsListCard {...proprietes({ isPending: true, isError: true })} />,
    );

    expect(screen.queryByText("Consultation")).not.toBeInTheDocument();
  });
});

describe("SettingsListCard — liste vide", () => {
  it("montre l'état vide plutôt qu'un tableau sans ligne", () => {
    render(<SettingsListCard {...proprietes({ isEmpty: true })} />);

    expect(screen.getByText("Aucun type")).toBeInTheDocument();
    expect(
      screen.getByText("Créez votre premier type de rendez-vous."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Consultation")).not.toBeInTheDocument();
  });

  it("propose la création DEUX fois : en en-tête et dans l'état vide", () => {
    // Ce n'est pas une duplication accidentelle : sur un écran vide, le
    // bouton de l'en-tête passe facilement inaperçu.
    render(<SettingsListCard {...proprietes({ isEmpty: true })} />);

    expect(
      screen.getAllByRole("button", { name: "Nouveau type" }),
    ).toHaveLength(2);
  });
});

describe("SettingsListCard — liste garnie", () => {
  it("affiche la liste et un seul bouton de création", () => {
    render(<SettingsListCard {...proprietes()} />);

    expect(screen.getByText("Consultation")).toBeInTheDocument();
    expect(screen.queryByText("Aucun type")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Nouveau type" }),
    ).toHaveLength(1);
  });

  it("ouvre la création depuis l'en-tête", async () => {
    const onCreate = vi.fn();
    render(<SettingsListCard {...proprietes({ onCreate })} />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Nouveau type" }));

    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("rappelle toujours le titre et la description de la section", () => {
    render(<SettingsListCard {...proprietes()} />);

    expect(screen.getByText("Types de rendez-vous")).toBeInTheDocument();
    expect(
      screen.getByText("Les motifs proposés à la réservation."),
    ).toBeInTheDocument();
  });
});
