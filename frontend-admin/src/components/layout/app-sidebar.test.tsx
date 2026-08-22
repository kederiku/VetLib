/**
 * Tests de la sidebar du back-office.
 *
 * Deux proprietes : toutes les entrees de NAV_ITEMS sont rendues (une entree
 * ajoutee a la source de verite apparait sans toucher a ce composant), et
 * l'ecran courant porte aria-current="page" -- le data-active du preset
 * shadcn est purement visuel, un lecteur d'ecran ne le voit pas.
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { NAV_ITEMS } from "@/lib/navigation";
import { renderWithProviders } from "@/test/render";

const routeur = vi.hoisted(() => ({ chemin: "/tableau-de-bord" }));

vi.mock("next/navigation", () => ({
  usePathname: () => routeur.chemin,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function afficher(chemin: string) {
  routeur.chemin = chemin;
  return renderWithProviders(<AppSidebar />, { withAppShell: true });
}

describe("AppSidebar", () => {
  it("rend toutes les entrées de la source de vérité", () => {
    afficher("/tableau-de-bord");

    for (const item of NAV_ITEMS) {
      expect(screen.getByText(item.title)).toBeInTheDocument();
    }
  });

  it("annonce l'écran courant aux lecteurs d'écran", () => {
    afficher("/cliniques");

    const lien = screen.getByRole("link", { name: /Cliniques/ });
    expect(lien).toHaveAttribute("aria-current", "page");
  });

  it("garde la section active sur une sous-page", () => {
    afficher("/cliniques/00000000-0000-0000-0000-000000000001");

    expect(screen.getByRole("link", { name: /Cliniques/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("expose un repère de navigation nommé", () => {
    // Le preset shadcn n'emet aucun <nav> : sans ce reperage, impossible de
    // "sauter a la navigation" avec un lecteur d'ecran.
    afficher("/tableau-de-bord");

    expect(
      screen.getByRole("navigation", { name: "Navigation principale" }),
    ).toBeInTheDocument();
  });
});
