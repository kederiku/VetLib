/**
 * Tests du dialogue de création d'une clinique.
 *
 * Le comportement critique n'est pas le formulaire — c'est ce qui se passe
 * APRÈS : le mot de passe du gérant n'est lisible qu'une fois, et un
 * dialogue qui se fermerait tout seul le perdrait définitivement. On vérifie
 * donc que la remise s'affiche, que le dialogue refuse de se fermer tant
 * qu'elle est à l'écran, et que le chemin « sans gérant » ne l'affiche pas
 * du tout.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClinicCreateDialog } from "@/components/clinics/clinic-create-dialog";
import { buildClinicSummary } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ reponse: vi.fn(), push: vi.fn() }));

vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: simulations.push,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const CLINIQUE = buildClinicSummary();
const GERANT = {
  user_id: "00000000-0000-0000-0000-0000000000e1",
  email: "gerant@lilas.fr",
  role: "manager",
  temporary_password: "orage-tulipe-galet-fresque-avoine",
};

/** Réponse 201 du backend, avec ou sans gérant. */
function creationReussie(avecGerant: boolean) {
  return {
    status: 201,
    data: {
      clinic: { ...CLINIQUE, address: null, timezone: "Europe/Paris" },
      manager: avecGerant ? GERANT : null,
    },
    headers: new Headers(),
  };
}

/**
 * L'interrupteur « créer aussi un gérant ».
 *
 * Ciblé par son ROLE et non par son libellé : le libellé est porté à la fois
 * par le <label> et par le groupe de champ qui l'englobe, et `getByLabelText`
 * en trouverait donc deux.
 */
function interrupteurGerant() {
  return screen.getByRole("switch", { name: "Créer aussi le premier gérant" });
}

/** Remplit le minimum vital et soumet. */
async function remplirEtSoumettre(
  utilisateur: ReturnType<typeof userEvent.setup>,
  { avecGerant }: { avecGerant: boolean },
) {
  await utilisateur.type(
    screen.getByLabelText("Nom de la clinique"),
    "Clinique des Lilas",
  );
  await utilisateur.type(
    screen.getByLabelText("Email de contact"),
    "contact@lilas.fr",
  );

  if (avecGerant) {
    await utilisateur.type(
      screen.getByLabelText("Email du gérant"),
      "gerant@lilas.fr",
    );
    await utilisateur.type(screen.getByLabelText("Prénom"), "Claire");
    await utilisateur.type(screen.getByLabelText("Nom"), "Martin");
  } else {
    // La case est cochée par défaut : c'est le cas courant.
    await utilisateur.click(interrupteurGerant());
  }

  await utilisateur.click(
    screen.getByRole("button", { name: "Créer la clinique" }),
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ClinicCreateDialog", () => {
  it("remet le mot de passe du gérant et NE ferme PAS le dialogue", async () => {
    const utilisateur = userEvent.setup();
    const onOpenChange = vi.fn();
    simulations.reponse.mockResolvedValue(creationReussie(true));
    renderWithProviders(
      <ClinicCreateDialog open onOpenChange={onOpenChange} />,
    );

    await remplirEtSoumettre(utilisateur, { avecGerant: true });

    await waitFor(() => {
      expect(screen.getByLabelText("Mot de passe temporaire")).toHaveValue(
        GERANT.temporary_password,
      );
    });
    // Le dialogue reste ouvert : fermer ici perdrait le secret.
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(simulations.push).not.toHaveBeenCalled();
  });

  it("ferme et ouvre la fiche une fois le mot de passe noté", async () => {
    const utilisateur = userEvent.setup();
    const onOpenChange = vi.fn();
    simulations.reponse.mockResolvedValue(creationReussie(true));
    renderWithProviders(
      <ClinicCreateDialog open onOpenChange={onOpenChange} />,
    );

    await remplirEtSoumettre(utilisateur, { avecGerant: true });
    await utilisateur.click(
      await screen.findByRole("button", { name: /j'ai noté le mot de passe/i }),
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(simulations.push).toHaveBeenCalledWith(`/cliniques/${CLINIQUE.id}`);
  });

  it("va droit à la fiche quand aucun gérant n'est créé", async () => {
    const utilisateur = userEvent.setup();
    const onOpenChange = vi.fn();
    simulations.reponse.mockResolvedValue(creationReussie(false));
    renderWithProviders(
      <ClinicCreateDialog open onOpenChange={onOpenChange} />,
    );

    await remplirEtSoumettre(utilisateur, { avecGerant: false });

    await waitFor(() => {
      expect(simulations.push).toHaveBeenCalledWith(
        `/cliniques/${CLINIQUE.id}`,
      );
    });
    expect(
      screen.queryByLabelText("Mot de passe temporaire"),
    ).not.toBeInTheDocument();
  });

  it("n'exige pas les champs du gérant quand la case est décochée", async () => {
    const utilisateur = userEvent.setup();
    simulations.reponse.mockResolvedValue(creationReussie(false));
    renderWithProviders(<ClinicCreateDialog open onOpenChange={vi.fn()} />);

    await utilisateur.click(interrupteurGerant());
    expect(screen.queryByLabelText("Email du gérant")).not.toBeInTheDocument();
  });
});
