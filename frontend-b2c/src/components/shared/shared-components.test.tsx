/**
 * Tests des primitives de mise en page partagées.
 *
 * Elles portent des décisions structurelles que rien d'autre ne
 * verrouille : la largeur unique des pages (l'incohérence que cette
 * refonte corrige), le fait que le titre de page soit un h1 (repère de
 * navigation pour un lecteur d'écran), et surtout qu'un état d'erreur
 * propose TOUJOURS une sortie -- un bandeau rouge sans bouton Réessayer
 * est une impasse.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { renderWithProviders } from "@/test/render";

describe("PageContainer", () => {
  it("applique la largeur des écrans de liste par défaut", () => {
    const { container } = renderWithProviders(
      <PageContainer>
        <p>contenu</p>
      </PageContainer>,
    );

    expect(container.querySelector("div.max-w-4xl")).not.toBeNull();
  });

  it("resserre la colonne en variante narrow, pour la lecture et les formulaires", () => {
    const { container } = renderWithProviders(
      <PageContainer width="narrow">
        <p>contenu</p>
      </PageContainer>,
    );

    expect(container.querySelector("div.max-w-2xl")).not.toBeNull();
  });
});

describe("PageHeader", () => {
  it("rend le titre en h1 : c'est le repère de la page", () => {
    renderWithProviders(<PageHeader title="Mes animaux" />);

    expect(
      screen.getByRole("heading", { name: "Mes animaux", level: 1 }),
    ).toBeInTheDocument();
  });

  it("affiche la description et les actions quand elles sont fournies", () => {
    renderWithProviders(
      <PageHeader
        title="Mes rendez-vous"
        description="Toutes cliniques confondues."
        actions={<button type="button">Prendre rendez-vous</button>}
      />,
    );

    expect(screen.getByText("Toutes cliniques confondues.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Prendre rendez-vous" }),
    ).toBeInTheDocument();
  });

  it("n'affiche pas de description vide quand elle est omise", () => {
    const { container } = renderWithProviders(<PageHeader title="Titre" />);

    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});

describe("EmptyState", () => {
  it("annonce l'absence de contenu et propose la sortie", () => {
    renderWithProviders(
      <EmptyState
        icon={<span data-testid="icone" />}
        title="Aucun rendez-vous"
        description="Prenez le premier."
        action={<button type="button">Prendre rendez-vous</button>}
      />,
    );

    expect(screen.getByText("Aucun rendez-vous")).toBeInTheDocument();
    expect(screen.getByText("Prenez le premier.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Prendre rendez-vous" }),
    ).toBeInTheDocument();
  });

  it("reste valide sans action (état vide purement informatif)", () => {
    renderWithProviders(
      <EmptyState icon={<span />} title="Aucun rendez-vous passé" />,
    );

    expect(screen.getByText("Aucun rendez-vous passé")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("propose TOUJOURS de réessayer et rappelle la fonction au clic", async () => {
    const reessayer = vi.fn();
    const utilisateur = userEvent.setup();

    renderWithProviders(
      <ErrorState
        title="Impossible de charger vos rendez-vous."
        onRetry={reessayer}
      />,
    );

    expect(
      screen.getByText("Impossible de charger vos rendez-vous."),
    ).toBeInTheDocument();

    await utilisateur.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(reessayer).toHaveBeenCalledTimes(1);
  });

  it("propose une description par défaut quand aucune n'est fournie", () => {
    renderWithProviders(<ErrorState title="Échec." onRetry={vi.fn()} />);

    expect(
      screen.getByText("Vérifiez votre connexion, puis réessayez."),
    ).toBeInTheDocument();
  });
});
