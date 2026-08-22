/**
 * Tests de l'écran Personnel.
 *
 * Ce qui lui est propre : DEUX filtres (rôle et statut), et la colonne
 * Clinique — la seule qui rende visible le caractère inter-tenant de cette
 * liste. On vérifie aussi qu'un compte actif dans une clinique suspendue est
 * signalé comme tel : sans cette mention, la ligne dirait « Actif » et
 * l'exploitant chercherait longtemps pourquoi la personne ne peut pas se
 * connecter.
 */
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StaffContent } from "@/components/staff/staff-content";
import { buildStaffSummary } from "@/test/fixtures";
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
  usePathname: () => "/personnel",
}));

function dernierAppel(): URLSearchParams {
  const url = simulations.reponse.mock.calls.at(-1)?.[0] as string;
  return new URLSearchParams(url.split("?")[1] ?? "");
}

function repondre(items: ReturnType<typeof buildStaffSummary>[]) {
  simulations.reponse.mockResolvedValue({
    status: 200,
    data: { items, total: items.length, limit: 20, offset: 0 },
    headers: new Headers(),
  });
}

beforeEach(() => {
  simulations.params = new URLSearchParams();
  repondre([buildStaffSummary()]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("StaffContent", () => {
  it("montre de quelle clinique dépend chaque compte", async () => {
    renderWithProviders(<StaffContent />);
    // La preuve visible de la lecture inter-tenant : deux cliniques
    // différentes peuvent apparaître dans la même page.
    expect(
      await screen.findByRole("link", { name: "Clinique des Lilas" }),
    ).toHaveAttribute(
      "href",
      "/cliniques/00000000-0000-0000-0000-0000000000c1",
    );
  });

  it("traduit le rôle en français", async () => {
    renderWithProviders(<StaffContent />);
    expect(await screen.findByText("Gérant")).toBeInTheDocument();
  });

  it("signale un compte actif dont la clinique est suspendue", async () => {
    repondre([buildStaffSummary({ is_active: true, clinic_is_active: false })]);
    renderWithProviders(<StaffContent />);

    expect(await screen.findByText("Actif")).toBeInTheDocument();
    expect(screen.getByText("Clinique suspendue")).toBeInTheDocument();
  });

  it("envoie les deux filtres lus dans l'URL", async () => {
    simulations.params = new URLSearchParams("role=manager&statut=active");
    renderWithProviders(<StaffContent />);

    await waitFor(() => {
      expect(dernierAppel().get("role")).toBe("manager");
    });
    expect(dernierAppel().get("status")).toBe("active");
  });

  it("ignore un rôle forgé dans l'URL", async () => {
    simulations.params = new URLSearchParams("role=platform");
    renderWithProviders(<StaffContent />);

    await waitFor(() => {
      expect(simulations.reponse).toHaveBeenCalled();
    });
    expect(dernierAppel().get("role")).toBeNull();
  });
});
