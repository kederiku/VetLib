/**
 * Tests du tableau de bord.
 *
 * Ce qui compte ici, c'est le CHIFFRE : un tableau de bord qui affiche un
 * mauvais total est pire que pas de tableau de bord, parce qu'on le croit.
 * On vérifie donc les compteurs, l'agrégat « accès coupés » (le seul calcul
 * fait côté front), et le fait que les deux listes ne demandent que cinq
 * lignes — sinon l'écran d'accueil tirerait deux pages complètes à chaque
 * ouverture.
 */
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardContent } from "@/components/dashboard/dashboard-content";
import {
  buildAdmin,
  buildClinicSummary,
  buildOwnerSummary,
} from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ reponse: vi.fn() }));

vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/tableau-de-bord",
}));

const STATS = {
  active_clinics: 12,
  suspended_clinics: 2,
  active_owners: 340,
  inactive_owners: 5,
  active_staff: 48,
  inactive_staff: 3,
};

/** Route chaque appel selon son URL : trois requêtes partent en parallèle. */
function routerLesAppels() {
  simulations.reponse.mockImplementation((url: string) => {
    if (url.startsWith("/api/v1/admin/stats")) {
      return Promise.resolve({
        status: 200,
        data: STATS,
        headers: new Headers(),
      });
    }
    if (url.startsWith("/api/v1/admin/clinics")) {
      return Promise.resolve({
        status: 200,
        data: { items: [buildClinicSummary()], total: 12, limit: 5, offset: 0 },
        headers: new Headers(),
      });
    }
    if (url.startsWith("/api/v1/admin/owners")) {
      return Promise.resolve({
        status: 200,
        data: { items: [buildOwnerSummary()], total: 340, limit: 5, offset: 0 },
        headers: new Headers(),
      });
    }
    return Promise.resolve({
      status: 200,
      data: buildAdmin(),
      headers: new Headers(),
    });
  });
}

/** Paramètres du premier appel dont l'URL commence par ce préfixe. */
function appelVers(prefixe: string): URLSearchParams {
  const url = simulations.reponse.mock.calls
    .map((appel) => appel[0] as string)
    .find((candidat) => candidat.startsWith(prefixe));
  return new URLSearchParams((url ?? "").split("?")[1] ?? "");
}

beforeEach(() => {
  routerLesAppels();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DashboardContent", () => {
  it("affiche les compteurs renvoyés par le serveur", async () => {
    renderWithProviders(<DashboardContent />);

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("340")).toBeInTheDocument();
    expect(screen.getByText("48")).toBeInTheDocument();
  });

  it("additionne les trois populations coupées en un seul chiffre", async () => {
    // 2 cliniques + 5 propriétaires + 3 membres : trois compteurs séparés
    // obligeraient à faire l'addition de tête pour répondre à « est-ce que
    // quelque chose ne va pas ? ».
    renderWithProviders(<DashboardContent />);

    expect(await screen.findByText("10")).toBeInTheDocument();
    expect(
      screen.getByText("2 cliniques, 5 propriétaires, 3 membres"),
    ).toBeInTheDocument();
  });

  it("ne demande que cinq lignes à chaque liste, les plus récentes", async () => {
    renderWithProviders(<DashboardContent />);

    await waitFor(() => {
      expect(appelVers("/api/v1/admin/clinics").get("limit")).toBe("5");
    });
    expect(appelVers("/api/v1/admin/clinics").get("sort_dir")).toBe("desc");
    expect(appelVers("/api/v1/admin/owners").get("limit")).toBe("5");
  });

  it("renvoie vers les écrans complets depuis chaque carte", async () => {
    renderWithProviders(<DashboardContent />);
    const cliniques = (await screen.findByText("Dernières cliniques")).closest(
      "[data-slot='card']",
    );

    expect(
      within(cliniques as HTMLElement).getByRole("link", { name: "Tout voir" }),
    ).toHaveAttribute("href", "/cliniques");
  });

  it("affiche une erreur récupérable si les compteurs ne chargent pas", async () => {
    simulations.reponse.mockRejectedValue(new Error("réseau"));
    renderWithProviders(<DashboardContent />);

    expect(
      await screen.findByText("Impossible de charger les compteurs"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Réessayer" }),
    ).toBeInTheDocument();
  });
});
