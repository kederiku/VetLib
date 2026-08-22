/**
 * Tests de la confirmation de suspension d'une clinique.
 *
 * C'est la seule action de la console protégée par une saisie du nom, et ce
 * garde-fou n'a de valeur que s'il est EXACT : un test qui accepterait une
 * casse différente ou des espaces au milieu le viderait de son sens. On
 * vérifie donc la comparaison, l'affichage de l'effectif concerné (le coût
 * du geste, chiffré), et le fait que le bouton reste inerte tant que la
 * saisie ne correspond pas.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClinicSuspendDialog } from "@/components/clinics/clinic-suspend-dialog";
import { buildClinicSummary } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ reponse: vi.fn() }));

vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

const CLINIQUE = buildClinicSummary({
  name: "Clinique des Lilas",
  staff_count: 4,
});

function afficher(onOpenChange = vi.fn()) {
  renderWithProviders(
    <ClinicSuspendDialog
      clinicId={CLINIQUE.id}
      nom={CLINIQUE.name}
      effectif={CLINIQUE.staff_count}
      open
      onOpenChange={onOpenChange}
    />,
  );
  return {
    saisie: screen.getByLabelText(/saisissez le nom exact/i),
    bouton: screen.getByRole("button", { name: "Suspendre l'accès" }),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ClinicSuspendDialog", () => {
  it("chiffre le coût du geste : le nombre de comptes coupés", () => {
    // « Ça va couper 4 personnes » est l'information qui fait hésiter ;
    // sans elle, la confirmation n'est qu'une formalité de plus.
    afficher();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("garde le bouton inerte tant que le nom n'est pas exact", async () => {
    const utilisateur = userEvent.setup();
    const { saisie, bouton } = afficher();

    expect(bouton).toBeDisabled();

    // Casse différente : refusée. C'est délibéré -- on veut une relecture.
    await utilisateur.type(saisie, "clinique des lilas");
    expect(bouton).toBeDisabled();

    await utilisateur.clear(saisie);
    await utilisateur.type(saisie, "Clinique des");
    expect(bouton).toBeDisabled();
  });

  it("accepte le nom exact, espaces de bordure tolérés", async () => {
    const utilisateur = userEvent.setup();
    const { saisie, bouton } = afficher();

    // Les espaces autour viennent d'un copier-coller, pas d'une inattention :
    // les refuser punirait le geste le plus prudent.
    await utilisateur.type(saisie, "  Clinique des Lilas  ");
    expect(bouton).toBeEnabled();
  });

  it("appelle la suspension puis referme le dialogue", async () => {
    const utilisateur = userEvent.setup();
    const onOpenChange = vi.fn();
    simulations.reponse.mockResolvedValue({
      status: 200,
      data: { ...CLINIQUE, is_active: false },
      headers: new Headers(),
    });
    const { saisie, bouton } = afficher(onOpenChange);

    await utilisateur.type(saisie, CLINIQUE.name);
    await utilisateur.click(bouton);

    await waitFor(() => {
      expect(simulations.reponse).toHaveBeenCalledOnce();
    });
    const [url, options] = simulations.reponse.mock.calls[0] as [
      string,
      { method: string },
    ];
    expect(url).toContain(`/api/v1/admin/clinics/${CLINIQUE.id}/suspend`);
    expect(options.method).toBe("POST");
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
