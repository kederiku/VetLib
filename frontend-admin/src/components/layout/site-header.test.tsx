/**
 * Tests du header du back-office.
 *
 * Ce qu'ils verrouillent : le titre affiché vient bien de la source de
 * verite de navigation (et suit le match par prefixe), et le header
 * n'affiche rien hors des ecrans connus plutot qu'un titre vide.
 *
 * withAppShell : le bouton de repli appelle le contexte de la barre
 * laterale ; sans SidebarProvider, le rendu leverait.
 */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { SiteHeader } from "@/components/layout/site-header";
import { renderWithProviders } from "@/test/render";

const routeur = vi.hoisted(() => ({ chemin: "/tableau-de-bord" }));

vi.mock("next/navigation", () => ({
  usePathname: () => routeur.chemin,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function afficher(chemin: string) {
  routeur.chemin = chemin;
  return renderWithProviders(<SiteHeader />, { withAppShell: true });
}

describe("SiteHeader", () => {
  it("affiche le titre de l'écran courant", () => {
    afficher("/cliniques");

    expect(screen.getByText("Cliniques")).toBeInTheDocument();
  });

  it("garde le titre de la section sur une sous-page", () => {
    afficher("/cliniques/00000000-0000-0000-0000-000000000001");

    expect(screen.getByText("Cliniques")).toBeInTheDocument();
  });

  it("n'affiche aucun titre hors des écrans connus", () => {
    afficher("/un-chemin-inconnu");

    expect(screen.queryByText("Cliniques")).not.toBeInTheDocument();
    expect(screen.queryByText("Tableau de bord")).not.toBeInTheDocument();
  });
});
