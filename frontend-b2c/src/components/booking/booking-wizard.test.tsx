/**
 * Tests de l'orchestrateur du tunnel de réservation.
 *
 * Le composant assemble cinq étapes autour du réducteur déjà testé
 * séparément. Ce qui lui appartient en propre, et qui est vérifié ici : quelle
 * étape est montée à quel moment, le comportement du bouton « Retour » — qui
 * quitte le tunnel à la première étape et recule ensuite — et l'écran de
 * confirmation final.
 *
 * Les cinq étapes ont leurs propres tests : on les simule pour n'éprouver que
 * l'aiguillage.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BookingWizard } from "@/components/booking/booking-wizard";
import { renderWithProviders } from "@/test/render";
import {
  buildAvailabilitySlot,
  buildPet,
  buildPublicAppointmentType,
  buildPublicClinic,
} from "@/test/fixtures";

// Chaque étape est remplacée par un bouton qui déclenche sa sélection :
// on pilote ainsi le parcours sans dépendre du réseau ni de l'interface
// réelle de chaque étape.
vi.mock("@/components/booking/step-clinic", () => ({
  StepClinic: ({ onSelect }: { onSelect: (c: unknown) => void }) => (
    <button type="button" onClick={() => onSelect(buildPublicClinic())}>
      Étape clinique
    </button>
  ),
}));
vi.mock("@/components/booking/step-type", () => ({
  StepType: ({ onSelect }: { onSelect: (t: unknown) => void }) => (
    <button type="button" onClick={() => onSelect(buildPublicAppointmentType())}>
      Étape motif
    </button>
  ),
}));
vi.mock("@/components/booking/step-pet", () => ({
  StepPet: ({
    onSelectPet,
    onContinue,
  }: Record<string, (p?: unknown) => void>) => (
    <div>
      <button type="button" onClick={() => onSelectPet(buildPet())}>
        Choisir l&apos;animal
      </button>
      <button type="button" onClick={() => onContinue()}>
        Étape animal
      </button>
    </div>
  ),
}));
vi.mock("@/components/booking/step-slot", () => ({
  StepSlot: ({ onSelect }: { onSelect: (s: unknown) => void }) => (
    <button type="button" onClick={() => onSelect(buildAvailabilitySlot())}>
      Étape créneau
    </button>
  ),
}));
vi.mock("@/components/booking/step-confirm", () => ({
  StepConfirm: ({ onSubmitted }: { onSubmitted: () => void }) => (
    <button type="button" onClick={onSubmitted}>
      Étape confirmation
    </button>
  ),
}));

/** Avance dans le tunnel en cliquant les étapes simulées, dans l'ordre. */
async function avancer(jusqua: 1 | 2 | 3 | 4 | 5) {
  const user = userEvent.setup();
  if (jusqua >= 2) await user.click(screen.getByText("Étape clinique"));
  if (jusqua >= 3) await user.click(screen.getByText("Étape motif"));
  if (jusqua >= 4) {
    await user.click(screen.getByText("Choisir l'animal"));
    await user.click(screen.getByText("Étape animal"));
  }
  if (jusqua >= 5) await user.click(screen.getByText("Étape créneau"));
  return user;
}

describe("BookingWizard — progression", () => {
  it("démarre au choix de la clinique", () => {
    renderWithProviders(<BookingWizard />);
    expect(screen.getByText("Étape clinique")).toBeInTheDocument();
  });

  it("enchaîne les cinq étapes dans l'ordre", async () => {
    // Un seul parcours continu, avec une assertion après chaque pas :
    // relancer le helper depuis le début échouerait, l'étape précédente
    // n'étant plus montée.
    renderWithProviders(<BookingWizard />);
    const user = userEvent.setup();

    await user.click(screen.getByText("Étape clinique"));
    expect(screen.getByText("Étape motif")).toBeInTheDocument();

    await user.click(screen.getByText("Étape motif"));
    expect(screen.getByText("Étape animal")).toBeInTheDocument();

    await user.click(screen.getByText("Choisir l'animal"));
    await user.click(screen.getByText("Étape animal"));
    expect(screen.getByText("Étape créneau")).toBeInTheDocument();

    await user.click(screen.getByText("Étape créneau"));
    expect(screen.getByText("Étape confirmation")).toBeInTheDocument();
  });

  it("ne monte qu'une étape à la fois", async () => {
    renderWithProviders(<BookingWizard />);
    await avancer(2);

    expect(screen.queryByText("Étape clinique")).not.toBeInTheDocument();
  });
});

describe("BookingWizard — retour", () => {
  it("quitte le tunnel depuis la première étape", () => {
    // À l'étape 1, il n'y a rien derrière : le retour ramène à la liste
    // des rendez-vous plutôt que de ne rien faire.
    renderWithProviders(<BookingWizard />);

    expect(screen.getByRole("button", { name: /Retour/ })).toHaveAttribute(
      "href",
      "/rendez-vous",
    );
  });

  it("recule d'une étape ensuite", async () => {
    renderWithProviders(<BookingWizard />);
    const user = await avancer(2);

    await user.click(screen.getByRole("button", { name: /Retour/ }));

    expect(screen.getByText("Étape clinique")).toBeInTheDocument();
  });
});

describe("BookingWizard — confirmation", () => {
  it("affiche l'écran de succès après l'envoi", async () => {
    renderWithProviders(<BookingWizard />);
    const user = await avancer(5);

    await user.click(screen.getByText("Étape confirmation"));

    expect(screen.getByText("Demande envoyée !")).toBeInTheDocument();
    // Le rendez-vous part en attente : le dire tout de suite évite que le
    // propriétaire croie sa venue déjà acquise.
    expect(
      screen.getByText("En attente de confirmation"),
    ).toBeInTheDocument();
  });

  it("propose les deux suites naturelles", async () => {
    renderWithProviders(<BookingWizard />);
    const user = await avancer(5);
    await user.click(screen.getByText("Étape confirmation"));

    expect(
      screen.getByRole("button", { name: "Voir mes rendez-vous" }),
    ).toHaveAttribute("href", "/rendez-vous");
    expect(screen.getByRole("button", { name: "Mon compte" })).toHaveAttribute(
      "href",
      "/mon-compte",
    );
  });

  it("remplace tout le tunnel par l'écran de succès", async () => {
    renderWithProviders(<BookingWizard />);
    const user = await avancer(5);
    await user.click(screen.getByText("Étape confirmation"));

    expect(screen.queryByText("Étape confirmation")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
