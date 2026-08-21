/**
 * Tests de la source de vérité de navigation.
 *
 * Deux contrats y sont verrouillés. Le premier : le titre de page est
 * dérivé du pathname par PRÉFIXE, pour qu'une sous-page ne fasse pas
 * perdre le repère de sa section. Le second, plus subtil : le tunnel de
 * réservation a son propre titre alors que son URL commence par celle
 * de la section « Mes rendez-vous » — c'est le préfixe le plus long qui
 * doit gagner, et rien dans l'ordre de déclaration ne le garantit
 * naturellement.
 */
import { describe, expect, it } from "vitest";

import { NAV_ITEMS, pageTitleForPath } from "@/lib/navigation";

describe("NAV_ITEMS", () => {
  it("déclare les quatre sections du portail, dans l'ordre d'affichage", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/tableau-de-bord",
      "/rendez-vous",
      "/animaux",
      "/mon-compte",
    ]);
  });

  it("donne à chaque entrée un libellé et une icône", () => {
    for (const item of NAV_ITEMS) {
      expect(item.title.length).toBeGreaterThan(0);
      // lucide-react v1 expose des composants memo/forwardRef, donc des
      // OBJETS et non des fonctions : on verifie la presence, pas le type.
      expect(item.icon).toBeDefined();
    }
  });

  it("n'expose pas le tunnel de réservation : c'est une action, pas une destination", () => {
    expect(NAV_ITEMS.map((item) => item.href)).not.toContain(
      "/rendez-vous/nouveau",
    );
  });
});

describe("pageTitleForPath", () => {
  it("nomme chacune des quatre sections", () => {
    expect(pageTitleForPath("/tableau-de-bord")).toBe("Tableau de bord");
    expect(pageTitleForPath("/rendez-vous")).toBe("Mes rendez-vous");
    expect(pageTitleForPath("/animaux")).toBe("Mes animaux");
    expect(pageTitleForPath("/mon-compte")).toBe("Mon compte");
  });

  it("conserve le titre de la section sur une sous-page", () => {
    expect(pageTitleForPath("/animaux/abc-123")).toBe("Mes animaux");
    expect(pageTitleForPath("/rendez-vous/abc-123")).toBe("Mes rendez-vous");
  });

  it("donne son propre titre au tunnel, malgré le préfixe partagé", () => {
    // /rendez-vous/nouveau commence par /rendez-vous : sans priorité
    // explicite, le header afficherait "Mes rendez-vous" pendant toute
    // la prise de rendez-vous.
    expect(pageTitleForPath("/rendez-vous/nouveau")).toBe(
      "Prendre rendez-vous",
    );
  });

  it("ne nomme rien hors des écrans connus", () => {
    expect(pageTitleForPath("/mentions-legales")).toBeNull();
    expect(pageTitleForPath("/")).toBeNull();
  });
});
