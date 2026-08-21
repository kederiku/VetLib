/**
 * Tests de la ligne « maintenant » de la grille d'agenda.
 *
 * C'est le repère qui permet de savoir d'un coup d'oeil où en est la journée.
 * Deux comportements comptent : elle se place proportionnellement à l'heure de
 * la CLINIQUE, et elle disparaît quand l'heure courante sort de la plage
 * affichée — la laisser collée en haut ou en bas de la grille désignerait un
 * instant faux, ce qui est pire que de ne rien montrer.
 *
 * Elle est masquée aux lecteurs d'écran : c'est une information purement
 * visuelle, l'heure étant déjà connue par ailleurs.
 */
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgendaNowIndicator } from "@/components/agenda/agenda-now-indicator";

/** Fenêtre par défaut de la grille : 7h - 20h, soit 780 minutes. */
const FENETRE = { startMin: 7 * 60, endMin: 20 * 60 };

/** Position verticale de la ligne, en pourcentage. */
function position(element: HTMLElement): string | undefined {
  return element.querySelector<HTMLElement>("[aria-hidden]")?.style.top;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AgendaNowIndicator — placement", () => {
  it("se place à mi-hauteur au milieu de la plage", () => {
    // 13h30 heure de Paris est à mi-chemin entre 7h et 20h. En août
    // (UTC+2), cela correspond à 11:30 UTC.
    vi.setSystemTime(new Date("2026-08-20T11:30:00Z"));
    const { container } = render(<AgendaNowIndicator window={FENETRE} />);

    expect(position(container)).toBe("50%");
  });

  it("se place en haut à l'ouverture de la plage", () => {
    // 07:00 heure de Paris = 05:00 UTC en août.
    vi.setSystemTime(new Date("2026-08-20T05:00:00Z"));
    const { container } = render(<AgendaNowIndicator window={FENETRE} />);

    expect(position(container)).toBe("0%");
  });

  it("suit l'heure de la clinique, pas celle du poste", () => {
    // Même instant, exprimé avec un décalage explicite : la position doit
    // être identique.
    vi.setSystemTime(new Date("2026-08-20T13:30:00+02:00"));
    const { container } = render(<AgendaNowIndicator window={FENETRE} />);

    expect(position(container)).toBe("50%");
  });
});

describe("AgendaNowIndicator — hors plage", () => {
  it("disparaît avant l'ouverture", () => {
    // 05:00 heure de Paris = 03:00 UTC. La laisser collée en haut
    // désignerait un instant faux.
    vi.setSystemTime(new Date("2026-08-20T03:00:00Z"));
    const { container } = render(<AgendaNowIndicator window={FENETRE} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("disparaît après la fermeture", () => {
    // 22:00 heure de Paris = 20:00 UTC.
    vi.setSystemTime(new Date("2026-08-20T20:00:00Z"));
    const { container } = render(<AgendaNowIndicator window={FENETRE} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("AgendaNowIndicator — accessibilité", () => {
  it("reste invisible aux lecteurs d'écran", () => {
    // Information purement visuelle : l'annoncer interromprait la lecture
    // de la grille sans rien apporter.
    vi.setSystemTime(new Date("2026-08-20T11:30:00Z"));
    const { container } = render(<AgendaNowIndicator window={FENETRE} />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
