/**
 * Tests de l'en-tête de l'espace clinique.
 *
 * Deux règles y sont portées. Le titre de page est DÉRIVÉ de la route, sans
 * état à synchroniser : c'est ce qui garantit qu'il ne se désaccorde jamais du
 * contenu affiché. Et le raccourci « nouveau rendez-vous » n'apparaît que
 * lorsqu'il sert : masqué sur l'agenda, qui a déjà son propre bouton, et
 * masqué pour qui n'a pas le droit d'écrire.
 */
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SiteHeader } from "@/components/layout/site-header";
import { getGetCurrentUserQueryKey } from "@/lib/api/generated/auth/auth";
import { buildUser } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * Monte l'en-tête avec une session amorcée. withAppShell est indispensable :
 * le bouton de repli de la barre latérale lit son contexte, absent sans les
 * providers de la coquille.
 */
function afficher(permissions: string[] = ["appointment:write"]) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(getGetCurrentUserQueryKey(), {
    status: 200,
    data: buildUser({ permissions }),
    headers: new Headers(),
  });
  return renderWithProviders(<SiteHeader />, { queryClient, withAppShell: true });
}

beforeEach(() => {
  navigation.pathname = "/dashboard";
  vi.clearAllMocks();
});

describe("SiteHeader — titre de page", () => {
  it("nomme la section courante", () => {
    afficher();
    expect(screen.getByText("Tableau de bord")).toBeInTheDocument();
  });

  it("suit la route sur une sous-page", () => {
    navigation.pathname = "/reglages/horaires";
    afficher();
    expect(screen.getByText("Réglages")).toBeInTheDocument();
  });

  it("n'affiche aucun titre sur une route inconnue", () => {
    // Mieux vaut pas de titre qu'un titre vide, qui décalerait la barre.
    navigation.pathname = "/mentions-legales";
    afficher();

    expect(screen.queryByText("Tableau de bord")).not.toBeInTheDocument();
    expect(screen.queryByText("Agenda")).not.toBeInTheDocument();
  });
});

describe("SiteHeader — raccourci de création", () => {
  it("propose le raccourci sur le tableau de bord", () => {
    afficher(["appointment:write"]);
    expect(
      screen.getByRole("button", { name: /Nouveau rendez-vous/i }),
    ).toBeInTheDocument();
  });

  it("le masque sur l'agenda, qui a déjà le sien", () => {
    // Deux boutons identiques côte à côte sur le même écran seraient du
    // bruit, pas une commodité.
    navigation.pathname = "/agenda";
    afficher(["appointment:write"]);

    expect(
      screen.queryByRole("button", { name: /Nouveau rendez-vous/i }),
    ).not.toBeInTheDocument();
  });

  it("le masque sans le droit d'écriture", () => {
    // Ce n'est pas une protection — le backend refuse la création — mais
    // proposer un bouton qui mène à un refus serait une impasse.
    afficher(["appointment:read"]);

    expect(
      screen.queryByRole("button", { name: /Nouveau rendez-vous/i }),
    ).not.toBeInTheDocument();
  });
});

describe("SiteHeader — commandes permanentes", () => {
  it("expose le menu du compte et le réglage de thème", () => {
    afficher();

    expect(
      screen.getByRole("button", { name: "Menu du compte" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /thème|theme/i }),
    ).toBeInTheDocument();
  });
});
