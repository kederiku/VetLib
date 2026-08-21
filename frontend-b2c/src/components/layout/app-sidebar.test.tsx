/**
 * Tests de la barre latérale de navigation.
 *
 * Elle reprend les contrats que l'ancienne barre horizontale
 * (owner-shell) verrouillait, et qu'un portage naïf du preset shadcn
 * aurait perdus : un landmark de navigation NOMMÉ (le preset n'en émet
 * aucun) et aria-current="page" sur l'entrée active (le data-active du
 * preset est purement visuel, un lecteur d'écran ne l'annonce pas).
 *
 * Le marquage se fait par PRÉFIXE : une sous-page ne doit pas faire
 * perdre le repère de sa section.
 *
 * Piège Base UI : un SidebarMenuButton rendu en Link conserve
 * role="link" — alors qu'un Button rendu en Link, lui, devient
 * role="button". Les deux formes coexistent dans la coquille.
 */
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { buildOwner } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

const navigation = vi.hoisted(() => ({ pathname: "/tableau-de-bord" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function afficher(surcharges: Parameters<typeof buildOwner>[0] = {}) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(getGetCurrentOwnerQueryKey(), {
    status: 200,
    data: buildOwner(surcharges),
    headers: new Headers(),
  });
  return renderWithProviders(<AppSidebar />, {
    queryClient,
    withAppShell: true,
  });
}

beforeEach(() => {
  navigation.pathname = "/tableau-de-bord";
});

describe("AppSidebar — contenu", () => {
  it("expose les quatre sections du portail", () => {
    afficher();

    for (const libelle of [
      "Tableau de bord",
      "Mes rendez-vous",
      "Mes animaux",
      "Mon compte",
    ]) {
      expect(screen.getByRole("link", { name: libelle })).toBeInTheDocument();
    }
  });

  it("nomme la zone de navigation pour les lecteurs d'écran", () => {
    // Le preset shadcn n'émet aucun landmark : sans le <nav> ajouté, il
    // serait impossible de sauter directement à la navigation.
    afficher();

    expect(
      screen.getByRole("navigation", { name: "Navigation principale" }),
    ).toBeInTheDocument();
  });

  it("rappelle qui est connecté dans l'en-tête de marque", () => {
    // Utile sur un ordinateur familial, où plusieurs comptes se
    // succèdent sur le même navigateur.
    afficher({ first_name: "Marie", last_name: "Dupont" });

    expect(screen.getByText("Marie Dupont")).toBeInTheDocument();
  });

  it("évite un saut de mise en page tant que la session n'est pas résolue", () => {
    renderWithProviders(<AppSidebar />, { withAppShell: true });

    expect(screen.getByText("Espace propriétaire")).toBeInTheDocument();
  });
});

describe("AppSidebar — entrée active", () => {
  it("marque la section courante", () => {
    navigation.pathname = "/animaux";
    afficher();

    expect(screen.getByRole("link", { name: "Mes animaux" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("garde la section active sur une SOUS-page", () => {
    // /animaux/<id> appartient à la section "Mes animaux" : perdre le
    // repère au premier clic serait déroutant.
    navigation.pathname = "/animaux/abc-123";
    afficher();

    expect(screen.getByRole("link", { name: "Mes animaux" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("ne marque JAMAIS deux sections à la fois", () => {
    navigation.pathname = "/rendez-vous/nouveau";
    const { container } = afficher();

    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it("ne marque rien sur une route inconnue", () => {
    navigation.pathname = "/mentions-legales";
    const { container } = afficher();

    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });
});
