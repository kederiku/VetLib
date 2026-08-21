/**
 * Tests des quatre briques d'affichage partagées par tout l'espace clinique.
 *
 * Elles sont simples, mais elles portent les états que l'utilisateur voit le
 * plus souvent en dehors du cas nominal : une liste vide, une erreur de
 * chargement, un en-tête de page. Leur régression est silencieuse — un bouton
 * « Réessayer » qui ne rappelle plus rien laisse l'écran bloqué sans qu'aucune
 * erreur ne soit levée.
 *
 * Aucun provider n'est nécessaire : ces composants ne dépendent que de leurs
 * propriétés.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarIcon } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";

describe("EmptyState", () => {
  it("affiche le titre seul quand rien d'autre n'est fourni", () => {
    render(<EmptyState icon={<CalendarIcon />} title="Aucun rendez-vous" />);

    expect(screen.getByText("Aucun rendez-vous")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("affiche la description quand elle est fournie", () => {
    render(
      <EmptyState
        icon={<CalendarIcon />}
        title="Aucun rendez-vous"
        description="La journée est libre."
      />,
    );

    expect(screen.getByText("La journée est libre.")).toBeInTheDocument();
  });

  it("affiche l'action d'amorçage quand elle est fournie", () => {
    // Un état vide sans issue est une impasse : proposer la création est
    // ce qui transforme un écran vide en point de départ.
    render(
      <EmptyState
        icon={<CalendarIcon />}
        title="Aucun praticien"
        action={<button type="button">Ajouter un praticien</button>}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Ajouter un praticien" }),
    ).toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("propose toujours de réessayer", () => {
    // Point important : un état d'erreur SANS bouton laisserait l'utilisateur
    // face à un écran mort, sans autre recours que recharger la page.
    render(<ErrorState title="Impossible de charger l'agenda." onRetry={vi.fn()} />);

    expect(screen.getByText("Impossible de charger l'agenda.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });

  it("rappelle la fonction de reprise au clic", async () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Échec" onRetry={onRetry} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Réessayer" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("fournit un conseil par défaut", () => {
    // La cause la plus fréquente reste la connexion : autant le dire, plutôt
    // que d'afficher un titre nu.
    render(<ErrorState title="Échec" onRetry={vi.fn()} />);
    expect(
      screen.getByText("Vérifiez votre connexion, puis réessayez."),
    ).toBeInTheDocument();
  });

  it("accepte une description sur mesure", () => {
    render(
      <ErrorState
        title="Échec"
        description="Le praticien a peut-être été supprimé."
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Le praticien a peut-être été supprimé."),
    ).toBeInTheDocument();
  });
});

describe("PageHeader", () => {
  it("rend le titre comme titre de niveau 1", () => {
    // Un seul h1 par page : c'est ce sur quoi navigue un lecteur d'écran
    // pour savoir où il vient d'arriver.
    render(<PageHeader title="Réglages" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Réglages" }),
    ).toBeInTheDocument();
  });

  it("n'affiche description et actions que si elles existent", () => {
    const { rerender } = render(<PageHeader title="Réglages" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(
      <PageHeader
        title="Réglages"
        description="Horaires, praticiens et types de rendez-vous."
        actions={<button type="button">Nouveau</button>}
      />,
    );

    expect(
      screen.getByText("Horaires, praticiens et types de rendez-vous."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nouveau" })).toBeInTheDocument();
  });
});

describe("PageContainer", () => {
  it("rend son contenu", () => {
    render(
      <PageContainer>
        <p>Contenu de la page</p>
      </PageContainer>,
    );

    expect(screen.getByText("Contenu de la page")).toBeInTheDocument();
  });

  it("resserre la colonne en variante étroite", () => {
    // Les écrans de formulaire se lisent mieux sur une colonne courte : la
    // variante existe pour ça, une régression la rendrait invisible.
    const { container } = render(
      <PageContainer width="narrow">
        <p>x</p>
      </PageContainer>,
    );

    expect(container.firstChild).toHaveClass("max-w-3xl");
  });

  it("utilise la pleine largeur par défaut", () => {
    const { container } = render(
      <PageContainer>
        <p>x</p>
      </PageContainer>,
    );

    expect(container.firstChild).toHaveClass("max-w-6xl");
  });

  it("accepte des classes supplémentaires sans perdre les siennes", () => {
    const { container } = render(
      <PageContainer className="pb-0">
        <p>x</p>
      </PageContainer>,
    );

    expect(container.firstChild).toHaveClass("pb-0");
    expect(container.firstChild).toHaveClass("max-w-6xl");
  });
});
