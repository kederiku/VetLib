/**
 * Tests de la barre latérale de navigation.
 *
 * Elle filtre ses entrées selon les permissions de la personne connectée. Ce
 * n'est pas une protection — le backend refuse chaque endpoint — mais afficher
 * « Réglages » à une ASV la conduirait à un écran d'accès refusé. Le marquage
 * de l'entrée active, lui, se fait par PRÉFIXE : une sous-page ne doit pas
 * faire perdre le repère de la section.
 */
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { getGetCurrentUserQueryKey } from "@/lib/api/generated/auth/auth";
import { buildUser } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function afficher(permissions: string[] = []) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(getGetCurrentUserQueryKey(), {
    status: 200,
    data: buildUser({ permissions, clinic_name: "Clinique des Peupliers" }),
    headers: new Headers(),
  });
  return renderWithProviders(<AppSidebar />, { queryClient, withAppShell: true });
}

beforeEach(() => {
  navigation.pathname = "/dashboard";
});

describe("AppSidebar — entrées visibles", () => {
  it("montre les sections ouvertes à tous", () => {
    afficher([]);

    expect(
      screen.getByRole("link", { name: /Tableau de bord/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Agenda/ })).toBeInTheDocument();
  });

  it("masque les réglages sans la permission de gestion", () => {
    afficher(["appointment:read"]);
    expect(screen.queryByRole("link", { name: /Réglages/ })).not.toBeInTheDocument();
  });

  it("montre les réglages au gérant", () => {
    afficher(["clinic:manage"]);
    expect(screen.getByRole("link", { name: /Réglages/ })).toBeInTheDocument();
  });

  it("masque les réglages tant que la session n'est pas résolue", () => {
    // Défaut sûr : ne rien montrer de réservé avant de savoir.
    renderWithProviders(<AppSidebar />, { withAppShell: true });
    expect(screen.queryByRole("link", { name: /Réglages/ })).not.toBeInTheDocument();
  });
});

describe("AppSidebar — repères", () => {
  it("rappelle la clinique connectée", () => {
    // Repère de locataire, utile à un vétérinaire qui travaille pour
    // plusieurs cliniques : il doit voir en permanence où il agit.
    afficher([]);
    expect(screen.getByText("Clinique des Peupliers")).toBeInTheDocument();
  });

  it("marque l'entrée courante", () => {
    // ÉCART D'ACCESSIBILITÉ CONSTATÉ, non corrigé ici : cette barre marque
    // l'entrée active avec data-active (l'attribut du preset shadcn), là où
    // la coquille du portail B2C pose aria-current="page". data-active est
    // purement visuel — un lecteur d'écran ne l'annonce pas. Le test fige le
    // comportement réel ; l'harmonisation, si elle est souhaitée, relève
    // d'un changement du composant et non du test.
    navigation.pathname = "/agenda";
    afficher([]);

    // La bibliothèque d'interface pose l'attribut avec une valeur VIDE
    // quand l'entrée est active, et l'omet sinon : on teste sa présence.
    expect(screen.getByRole("link", { name: /Agenda/ })).toHaveAttribute(
      "data-active",
    );
  });

  it("garde l'entrée active sur une sous-page", () => {
    navigation.pathname = "/agenda/2026-08-20";
    afficher([]);

    // La bibliothèque d'interface pose l'attribut avec une valeur VIDE
    // quand l'entrée est active, et l'omet sinon : on teste sa présence.
    expect(screen.getByRole("link", { name: /Agenda/ })).toHaveAttribute(
      "data-active",
    );
  });

  it("ne marque qu'une entrée à la fois", () => {
    navigation.pathname = "/dashboard";
    afficher(["clinic:manage"]);

    expect(document.querySelectorAll("[data-active]")).toHaveLength(1);
  });
});
