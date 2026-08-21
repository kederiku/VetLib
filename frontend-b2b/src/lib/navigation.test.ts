/**
 * Tests de la navigation principale de l'espace clinique.
 *
 * `pageTitleForPath` alimente le titre du header. Le point non trivial est le
 * match par PRÉFIXE : sur une sous-page d'agenda, le header doit continuer
 * d'afficher « Agenda ». Un match exact ferait disparaître le titre dès qu'on
 * ouvre un détail.
 */
import { describe, expect, it } from "vitest";

import { NAV_ITEMS, pageTitleForPath } from "@/lib/navigation";

describe("pageTitleForPath", () => {
  it("nomme les sections connues", () => {
    expect(pageTitleForPath("/dashboard")).toBe("Tableau de bord");
    expect(pageTitleForPath("/agenda")).toBe("Agenda");
    expect(pageTitleForPath("/reglages")).toBe("Réglages");
  });

  it("conserve le titre sur une sous-page", () => {
    // C'est toute la subtilité : startsWith, pas d'égalité stricte.
    expect(pageTitleForPath("/agenda/2026-08-20")).toBe("Agenda");
    expect(pageTitleForPath("/reglages/horaires")).toBe("Réglages");
  });

  it("renvoie null pour une route inconnue", () => {
    // null (et non une chaîne vide) : le header sait alors qu'il ne doit
    // rien afficher du tout, plutôt qu'un titre vide qui décalerait la mise
    // en page.
    expect(pageTitleForPath("/")).toBeNull();
    expect(pageTitleForPath("/mentions-legales")).toBeNull();
  });
});

describe("NAV_ITEMS", () => {
  it("décrit les trois sections de l'espace clinique", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/dashboard",
      "/agenda",
      "/reglages",
    ]);
  });

  it("réserve les réglages aux personnes qui gèrent la clinique", () => {
    // Ce n'est PAS une protection (le backend décide), mais l'entrée ne doit
    // pas apparaître pour une ASV : elle mènerait à un écran « accès réservé ».
    const reglages = NAV_ITEMS.find((item) => item.href === "/reglages");
    expect(reglages?.permission).toBe("clinic:manage");
  });

  it("laisse le tableau de bord et l'agenda accessibles à tous", () => {
    for (const href of ["/dashboard", "/agenda"]) {
      expect(NAV_ITEMS.find((item) => item.href === href)?.permission)
        .toBeUndefined();
    }
  });

  it("donne à chaque entrée un titre et une icône", () => {
    for (const item of NAV_ITEMS) {
      expect(item.title, `titre manquant pour ${item.href}`).toBeTruthy();
      expect(item.icon, `icône manquante pour ${item.href}`).toBeDefined();
    }
  });
});
