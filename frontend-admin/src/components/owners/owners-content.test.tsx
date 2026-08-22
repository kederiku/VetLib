/**
 * Tests de l'écran Propriétaires.
 *
 * Variation du gabarit des cliniques : on ne re-teste donc pas la mécanique
 * de pagination (couverte par `clinics-content.test.tsx`), mais ce qui est
 * propre à cet écran — le filtre de statut, et l'ABSENCE d'action de
 * création. Un client s'inscrit lui-même ; proposer « nouveau propriétaire »
 * dans la console laisserait croire à une capacité qui n'existe pas.
 */
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnersContent } from "@/components/owners/owners-content";
import { buildOwnerSummary } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  reponse: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: simulations.replace,
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => simulations.params,
  usePathname: () => "/proprietaires",
}));

function dernierAppel(): URLSearchParams {
  const url = simulations.reponse.mock.calls.at(-1)?.[0] as string;
  return new URLSearchParams(url.split("?")[1] ?? "");
}

beforeEach(() => {
  simulations.params = new URLSearchParams();
  simulations.reponse.mockResolvedValue({
    status: 200,
    data: {
      items: [buildOwnerSummary({ id: "d1", last_name: "Martin" })],
      total: 1,
      limit: 20,
      offset: 0,
    },
    headers: new Headers(),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("OwnersContent", () => {
  it("affiche les propriétaires reçus", async () => {
    renderWithProviders(<OwnersContent />);
    expect(await screen.findByText("Claire Martin")).toBeInTheDocument();
  });

  it("ne propose AUCUNE création de compte", () => {
    renderWithProviders(<OwnersContent />);
    expect(
      screen.queryByRole("button", { name: /nouveau/i }),
    ).not.toBeInTheDocument();
  });

  it("envoie le filtre de statut lu dans l'URL", async () => {
    simulations.params = new URLSearchParams("statut=inactive");
    renderWithProviders(<OwnersContent />);

    await waitFor(() => {
      expect(dernierAppel().get("status")).toBe("inactive");
    });
  });

  it("trie par défaut sur la date d'inscription, décroissante", async () => {
    renderWithProviders(<OwnersContent />);
    await waitFor(() => {
      expect(dernierAppel().get("sort_by")).toBe("created_at");
    });
    expect(dernierAppel().get("sort_dir")).toBe("desc");
  });
});
