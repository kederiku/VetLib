/**
 * Tests du fil d'Ariane du tunnel de réservation.
 *
 * Le composant n'importe que `cn` : il se teste au rendu NU, sans le moindre
 * provider. Ce qu'on vérifie n'est pas l'apparence — les classes Tailwind ne
 * sont même pas appliquées ici — mais la SÉMANTIQUE : une étape passée doit
 * être un vrai bouton atteignable au clavier, et l'étape courante doit porter
 * `aria-current="step"`. Ces deux propriétés sont invisibles à l'oeil et se
 * perdent au premier remaniement de style.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StepIndicator } from "@/components/booking/step-indicator";

describe("StepIndicator", () => {
  it("présente les cinq étapes comme une liste ordonnée", () => {
    // <ol> : les lecteurs d'écran annoncent « liste de 5 éléments » et la
    // position de chacun, ce qu'un empilement de <div> ne ferait pas.
    render(<StepIndicator step={1} onStepClick={vi.fn()} />);

    expect(
      screen.getByRole("list", { name: "Étapes de la réservation" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("ne rend cliquables que les étapes PASSÉES", () => {
    // À l'étape 3, seules « Clinique » et « Motif » sont derrière nous.
    render(<StepIndicator step={3} onStepClick={vi.fn()} />);

    const boutons = screen.getAllByRole("button");
    expect(boutons).toHaveLength(2);
    // Le numéro dans la pastille est aria-hidden (décoratif) : seul le
    // libellé porte le nom accessible du bouton.
    expect(boutons[0]).toHaveAccessibleName("Clinique");
    expect(boutons[1]).toHaveAccessibleName("Motif");
  });

  it("n'offre aucun retour à la première étape", () => {
    // Rien n'est encore « passé » : proposer un retour n'aurait pas de sens.
    render(<StepIndicator step={1} onStepClick={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("marque l'étape courante avec aria-current", () => {
    // Le style (pastille pleine, libellé en gras) est purement visuel : sans
    // aria-current, une personne utilisant un lecteur d'écran ne saurait pas
    // où elle en est dans le parcours.
    render(<StepIndicator step={3} onStepClick={vi.fn()} />);

    const courante = screen.getByText("Animal").closest("[aria-current]");
    expect(courante).toHaveAttribute("aria-current", "step");
  });

  it("ne marque jamais deux étapes comme courantes", () => {
    render(<StepIndicator step={4} onStepClick={vi.fn()} />);
    expect(document.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });

  it("remonte le numéro de l'étape cliquée", async () => {
    const onStepClick = vi.fn();
    render(<StepIndicator step={4} onStepClick={onStepClick} />);

    await userEvent.setup().click(screen.getByRole("button", { name: /Motif/ }));

    // Le numéro, pas l'index : le réducteur raisonne en BookingStep.
    expect(onStepClick).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("laisse les étapes futures inertes", async () => {
    // À l'étape 2, « Créneau » ne doit être ni cliquable ni annoncé comme
    // atteignable : on ne peut pas sauter le choix de l'animal.
    const onStepClick = vi.fn();
    render(<StepIndicator step={2} onStepClick={onStepClick} />);

    expect(
      screen.queryByRole("button", { name: /Créneau/ }),
    ).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByText("Créneau"));
    expect(onStepClick).not.toHaveBeenCalled();
  });
});
