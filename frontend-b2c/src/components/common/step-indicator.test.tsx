/**
 * Tests du fil d'Ariane partagé (tunnel de réservation et inscription).
 *
 * Le composant n'importe que `cn` : il se teste au rendu NU, sans le moindre
 * provider. Ce qu'on vérifie n'est pas l'apparence — les classes Tailwind ne
 * sont même pas appliquées ici — mais la SÉMANTIQUE : une étape passée doit
 * être un vrai bouton atteignable au clavier, et l'étape courante doit porter
 * `aria-current="step"`. Ces deux propriétés sont invisibles à l'oeil et se
 * perdent au premier remaniement de style.
 *
 * Les libellés utilisés ici sont ceux du tunnel de réservation : c'est le
 * parcours le plus long (cinq étapes), donc celui qui exerce le mieux les
 * trois états (passée, courante, future).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StepIndicator } from "@/components/common/step-indicator";

const LABELS = ["Clinique", "Motif", "Animal", "Créneau", "Confirmation"];

/** Rend le fil d'Ariane du tunnel de réservation, dans l'état demandé. */
function renderIndicator(
  props: Partial<React.ComponentProps<typeof StepIndicator>> & { step: number },
) {
  return render(
    <StepIndicator
      labels={LABELS}
      ariaLabel="Étapes de la réservation"
      onStepClick={vi.fn()}
      {...props}
    />,
  );
}

describe("StepIndicator", () => {
  it("présente les cinq étapes comme une liste ordonnée", () => {
    // <ol> : les lecteurs d'écran annoncent « liste de 5 éléments » et la
    // position de chacun, ce qu'un empilement de <div> ne ferait pas.
    renderIndicator({ step: 1 });

    expect(
      screen.getByRole("list", { name: "Étapes de la réservation" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("ne rend cliquables que les étapes PASSÉES", () => {
    // À l'étape 3, seules « Clinique » et « Motif » sont derrière nous.
    renderIndicator({ step: 3 });

    const boutons = screen.getAllByRole("button");
    expect(boutons).toHaveLength(2);
    // Le numéro dans la pastille est aria-hidden (décoratif) : seul le
    // libellé porte le nom accessible du bouton.
    expect(boutons[0]).toHaveAccessibleName("Clinique");
    expect(boutons[1]).toHaveAccessibleName("Motif");
  });

  it("n'offre aucun retour à la première étape", () => {
    // Rien n'est encore « passé » : proposer un retour n'aurait pas de sens.
    renderIndicator({ step: 1 });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("marque l'étape courante avec aria-current", () => {
    // Le style (pastille pleine, libellé en gras) est purement visuel : sans
    // aria-current, une personne utilisant un lecteur d'écran ne saurait pas
    // où elle en est dans le parcours.
    renderIndicator({ step: 3 });

    const courante = screen.getByText("Animal").closest("[aria-current]");
    expect(courante).toHaveAttribute("aria-current", "step");
  });

  it("ne marque jamais deux étapes comme courantes", () => {
    renderIndicator({ step: 4 });
    expect(document.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });

  it("remonte le numéro de l'étape cliquée", async () => {
    const onStepClick = vi.fn();
    renderIndicator({ step: 4, onStepClick });

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Motif/ }));

    // Le numéro, pas l'index : c'est ce que les parcours appelants
    // manipulent (BookingStep côté réservation, RegisterStep côté
    // inscription).
    expect(onStepClick).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("laisse les étapes futures inertes", async () => {
    // À l'étape 2, « Créneau » ne doit être ni cliquable ni annoncé comme
    // atteignable : on ne peut pas sauter le choix de l'animal.
    const onStepClick = vi.fn();
    renderIndicator({ step: 2, onStepClick });

    expect(
      screen.queryByRole("button", { name: /Créneau/ }),
    ).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByText("Créneau"));
    expect(onStepClick).not.toHaveBeenCalled();
  });

  it("laisse inertes les étapes situées avant minStep", async () => {
    // Le besoin du parcours d'INSCRIPTION : à l'étape 2, le compte est déjà
    // créé, revenir à l'étape 1 n'a plus de sens (le formulaire de création
    // n'existe plus). L'étape reste affichée comme franchie, mais n'est plus
    // un bouton.
    const onStepClick = vi.fn();
    renderIndicator({ step: 3, minStep: 2, onStepClick });

    expect(
      screen.queryByRole("button", { name: /Clinique/ }),
    ).not.toBeInTheDocument();
    // L'étape 2, elle, reste bien atteignable.
    expect(screen.getByRole("button", { name: /Motif/ })).toBeInTheDocument();

    await userEvent.setup().click(screen.getByText("Clinique"));
    expect(onStepClick).not.toHaveBeenCalled();
  });
});
