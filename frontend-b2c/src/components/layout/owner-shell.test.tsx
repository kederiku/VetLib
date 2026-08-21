/**
 * Tests de la coquille de navigation du portail propriétaires.
 *
 * Le seul comportement non trivial du composant est le marquage de la section
 * active par PRÉFIXE : sur /rendez-vous/nouveau, « Mes rendez-vous » doit
 * rester actif. Le fond grisé ne suffit pas à le signaler — `aria-current` est
 * ce que lit un lecteur d'écran, et c'est ce que ce test verrouille.
 *
 * PARTICULARITÉ DE RENDU : les entrées de navigation sont des boutons rendus
 * en tant que liens. La bibliothèque d'interface pose alors role="button" sur
 * la balise <a> : le rôle accessible est donc « button », même si l'élément
 * porte bien un href — que l'on vérifie séparément.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerShell } from "@/components/layout/owner-shell";

const navigation = vi.hoisted(() => ({ pathname: "/rendez-vous" }));

// usePathname renvoie null hors de Next, ce qui ferait exploser le
// pathname.startsWith() de la première ligne du composant.
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  navigation.pathname = "/rendez-vous";
});

describe("OwnerShell", () => {
  it("expose les trois sections et le contenu de la page", () => {
    render(
      <OwnerShell>
        <p>Contenu de la page</p>
      </OwnerShell>,
    );

    expect(
      screen.getByRole("navigation", { name: "Navigation principale" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Contenu de la page")).toBeInTheDocument();
  });

  it("ramène au portail depuis le logo", () => {
    render(
      <OwnerShell>
        <p>x</p>
      </OwnerShell>,
    );

    // Le logo est un vrai lien, pas un bouton rendu en lien : son rôle
    // accessible reste « link ».
    expect(screen.getByRole("link", { name: /VetoLib/ })).toHaveAttribute(
      "href",
      "/rendez-vous",
    );
  });

  it("marque la section courante avec aria-current", () => {
    navigation.pathname = "/animaux";
    render(
      <OwnerShell>
        <p>x</p>
      </OwnerShell>,
    );

    expect(screen.getByRole("button", { name: "Mes animaux" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "Mes rendez-vous" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("garde la section active sur une SOUS-page", () => {
    // Toute la subtilité : startsWith et non une égalité stricte.
    // /rendez-vous/nouveau est le tunnel de réservation, une sous-page.
    navigation.pathname = "/rendez-vous/nouveau";
    render(
      <OwnerShell>
        <p>x</p>
      </OwnerShell>,
    );

    expect(
      screen.getByRole("button", { name: "Mes rendez-vous" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("ne marque qu'une seule section à la fois", () => {
    navigation.pathname = "/mon-compte";
    render(
      <OwnerShell>
        <p>x</p>
      </OwnerShell>,
    );

    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it("ne marque rien sur une route inconnue", () => {
    navigation.pathname = "/mentions-legales";
    render(
      <OwnerShell>
        <p>x</p>
      </OwnerShell>,
    );

    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });
});
