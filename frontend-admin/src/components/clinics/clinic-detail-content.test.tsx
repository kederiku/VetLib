/**
 * Tests de la fiche d'une clinique.
 *
 * Trois choses à verrouiller :
 *
 * 1. les trois états (chargement, erreur, contenu) — l'erreur doit rester
 *    RÉCUPÉRABLE, un lien périmé ne doit pas mener à un cul-de-sac ;
 * 2. les actions proposées dépendent du statut : « Suspendre » sur une
 *    clinique active, « Réactiver » sur une clinique suspendue, jamais les
 *    deux ;
 * 3. la fiche embarque la liste de son personnel, qui est une SECONDE
 *    requête, filtrée sur cette clinique par le chemin de l'endpoint.
 */
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClinicDetailContent } from "@/components/clinics/clinic-detail-content";
import { buildClinicSummary, buildStaffSummary } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ reponse: vi.fn() }));

vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/cliniques/00000000-0000-0000-0000-0000000000c1",
}));

const CLINIQUE = buildClinicSummary();

/** Fiche complète + page de personnel, routées par URL. */
function routerLesAppels(surcharges: Record<string, unknown> = {}) {
  simulations.reponse.mockImplementation((url: string) => {
    if (url.includes("/staff")) {
      return Promise.resolve({
        status: 200,
        data: { items: [buildStaffSummary()], total: 1, limit: 20, offset: 0 },
        headers: new Headers(),
      });
    }
    return Promise.resolve({
      status: 200,
      data: {
        ...CLINIQUE,
        address: {
          line1: "12 rue des Lilas",
          line2: null,
          postal_code: "75011",
          city: "Paris",
          country: "FR",
        },
        timezone: "Europe/Paris",
        ...surcharges,
      },
      headers: new Headers(),
    });
  });
}

beforeEach(() => {
  routerLesAppels();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ClinicDetailContent", () => {
  it("affiche l'identité de la clinique, adresse comprise", async () => {
    renderWithProviders(<ClinicDetailContent clinicId={CLINIQUE.id} />);

    expect(
      await screen.findByRole("heading", { name: "Clinique des Lilas" }),
    ).toBeInTheDocument();
    expect(screen.getByText("12 rue des Lilas")).toBeInTheDocument();
    expect(screen.getByText("75011 Paris")).toBeInTheDocument();
  });

  it("propose de suspendre une clinique active, jamais de la réactiver", async () => {
    renderWithProviders(<ClinicDetailContent clinicId={CLINIQUE.id} />);
    await screen.findByRole("heading", { name: "Clinique des Lilas" });

    expect(
      screen.getByRole("button", { name: /suspendre l'accès/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /réactiver/i }),
    ).not.toBeInTheDocument();
  });

  it("propose de réactiver une clinique suspendue, jamais de la suspendre", async () => {
    routerLesAppels({ is_active: false });
    renderWithProviders(<ClinicDetailContent clinicId={CLINIQUE.id} />);
    await screen.findByRole("heading", { name: "Clinique des Lilas" });

    expect(
      screen.getByRole("button", { name: /réactiver l'accès/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /suspendre/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Suspendue")).toBeInTheDocument();
  });

  it("charge le personnel de CETTE clinique", async () => {
    renderWithProviders(<ClinicDetailContent clinicId={CLINIQUE.id} />);

    await waitFor(() => {
      expect(
        simulations.reponse.mock.calls.some((appel) =>
          (appel[0] as string).startsWith(
            `/api/v1/admin/clinics/${CLINIQUE.id}/staff`,
          ),
        ),
      ).toBe(true);
    });
    expect(await screen.findByText("Claire Martin")).toBeInTheDocument();
  });

  it("laisse une issue quand la fiche ne charge pas", async () => {
    // Lien périmé ou réseau coupé : dans les deux cas le geste utile est le
    // même, et l'écran ne doit pas être un cul-de-sac.
    simulations.reponse.mockRejectedValue(new Error("réseau"));
    renderWithProviders(<ClinicDetailContent clinicId={CLINIQUE.id} />);

    expect(
      await screen.findByText("Impossible d'afficher cette clinique"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /toutes les cliniques/i }),
    ).toHaveAttribute("href", "/cliniques");
  });
});
