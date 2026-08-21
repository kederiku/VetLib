/**
 * Tests du header des pages connectées.
 *
 * Il porte trois repères : où je suis (titre dérivé de la route), quoi
 * faire (le CTA global) et qui je suis (menu du compte, bascule de
 * thème). Le cas intéressant est le MASQUAGE du CTA dans le tunnel :
 * proposer « Prendre rendez-vous » à quelqu'un qui est déjà en train
 * d'en prendre un est du bruit, et rien d'autre ne verrouille cette
 * règle.
 */
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SiteHeader } from "@/components/layout/site-header";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { buildOwner } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

const navigation = vi.hoisted(() => ({ pathname: "/tableau-de-bord" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// La déconnexion enchaîne mutation, navigation et notification : elle a
// ses propres tests. Ici, seul compte le fait que le menu soit là.
vi.mock("@/lib/auth/use-logout", () => ({
  useLogoutAction: () => ({ logout: vi.fn(), isPending: false }),
}));

function afficher() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(getGetCurrentOwnerQueryKey(), {
    status: 200,
    data: buildOwner(),
    headers: new Headers(),
  });
  return renderWithProviders(<SiteHeader />, {
    queryClient,
    withAppShell: true,
  });
}

beforeEach(() => {
  navigation.pathname = "/tableau-de-bord";
});

describe("SiteHeader — titre de page", () => {
  it("nomme la section courante", () => {
    navigation.pathname = "/animaux";
    afficher();

    expect(screen.getByText("Mes animaux")).toBeInTheDocument();
  });

  it("donne son propre titre au tunnel, malgré le préfixe partagé", () => {
    navigation.pathname = "/rendez-vous/nouveau";
    afficher();

    expect(screen.getByText("Prendre rendez-vous")).toBeInTheDocument();
    expect(screen.queryByText("Mes rendez-vous")).not.toBeInTheDocument();
  });

  it("n'affiche aucun titre sur une route inconnue", () => {
    navigation.pathname = "/mentions-legales";
    afficher();

    expect(screen.queryByText("Mes rendez-vous")).not.toBeInTheDocument();
    expect(screen.queryByText("Tableau de bord")).not.toBeInTheDocument();
  });
});

describe("SiteHeader — actions", () => {
  it("propose le raccourci là où rien d'autre ne le propose", () => {
    // Un Button rendu en Link prend role="button" chez Base UI : on
    // vérifie le href séparément.
    navigation.pathname = "/animaux";
    afficher();

    const cta = screen.getByRole("button", { name: "Prendre rendez-vous" });
    expect(cta).toHaveAttribute("href", "/rendez-vous/nouveau");
  });

  it.each([
    ["le tableau de bord", "/tableau-de-bord"],
    ["la liste des rendez-vous", "/rendez-vous"],
    ["le tunnel lui-même", "/rendez-vous/nouveau"],
  ])("efface le raccourci sur %s, qui porte déjà le sien", (_, chemin) => {
    // Deux boutons identiques à 20 px d'écart sont du bruit — y compris
    // pour un lecteur d'écran, qui annonce deux fois la même action.
    navigation.pathname = chemin;
    afficher();

    expect(
      screen.queryByRole("button", { name: "Prendre rendez-vous" }),
    ).not.toBeInTheDocument();
  });

  it("donne accès au compte et au thème depuis n'importe quel écran", () => {
    afficher();

    expect(
      screen.getByRole("button", { name: "Menu du compte" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Changer de thème" }),
    ).toBeInTheDocument();
  });
});
