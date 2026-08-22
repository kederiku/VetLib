/**
 * Tests des fonctions de présentation des datatables.
 *
 * Ce sont des fonctions pures, donc testables exhaustivement pour trois fois
 * rien — et elles en valent la peine : une erreur de décalage de un dans
 * `calculerPlage` produit un « 21–40 sur 137 » parfaitement plausible et
 * parfaitement faux, que personne ne remarque à l'oeil.
 */
import { describe, expect, it } from "vitest";

import {
  ariaSortPourColonne,
  calculerPlage,
  libellePlage,
  nombreDePages,
} from "@/lib/table/format";

describe("nombreDePages", () => {
  it("arrondit au supérieur : une page partielle reste une page", () => {
    expect(nombreDePages(21, 20)).toBe(2);
  });

  it("ne descend jamais sous 1, même sans résultat", () => {
    // « Page 1 sur 0 » n'a pas de sens, et le bouton « suivant » se
    // calculant sur ce nombre, il deviendrait actif sur une liste vide.
    expect(nombreDePages(0, 20)).toBe(1);
  });

  it("tombe juste quand le total est un multiple de la taille", () => {
    expect(nombreDePages(40, 20)).toBe(2);
  });

  it("se protège d'une taille nulle plutôt que de diviser par zéro", () => {
    expect(nombreDePages(40, 0)).toBe(1);
  });
});

describe("calculerPlage", () => {
  it("rend des bornes 1-indexées à partir d'un offset 0-indexé", () => {
    expect(calculerPlage(137, 20, 20)).toEqual({ debut: 21, fin: 40 });
  });

  it("borne la fin au total sur une dernière page partielle", () => {
    expect(calculerPlage(137, 120, 17)).toEqual({ debut: 121, fin: 137 });
  });

  it("ne dépasse pas le total même si le serveur renvoie plus que prévu", () => {
    expect(calculerPlage(10, 0, 20)).toEqual({ debut: 1, fin: 10 });
  });

  it("rend null quand il n'y a rien à annoncer", () => {
    expect(calculerPlage(0, 0, 0)).toBeNull();
    expect(calculerPlage(137, 500, 0)).toBeNull();
  });
});

describe("libellePlage", () => {
  it("écrit l'intervalle avec un tiret demi-cadratin et des espaces insécables", () => {
    // Les caractères EXACTS importent, et c'est le seul endroit où on peut
    // les vérifier : le tiret demi-cadratin (U+2013) est le signe des
    // intervalles en français, et les espaces insécables (U+00A0) autour de
    // « sur » empêchent « sur 137 » de se retrouver seul en fin de ligne.
    // Écrits en séquences d'échappement, sinon la relecture d'une diff ne
    // distingue pas une espace insécable d'une espace ordinaire.
    expect(libellePlage(137, 20, 20)).toBe("21\u201340\u00a0sur\u00a0137");
  });

  it("sépare les milliers", () => {
    // Le séparateur de milliers d'Intl en fr-FR est une espace insécable
    // ÉTROITE (U+202F), différente de celle du libellé : on la vérifie donc
    // aussi explicitement, plutôt que par un joker qui masquerait le jour où
    // Intl changerait d'avis.
    expect(libellePlage(12_345, 0, 20)).toBe("1\u201320\u00a0sur\u00a012\u202f345");
  });

  it("dit « Aucun résultat » plutôt que « 0–0 sur 0 »", () => {
    expect(libellePlage(0, 0, 0)).toBe("Aucun résultat");
  });
});

describe("ariaSortPourColonne", () => {
  it("ne pose rien sur une colonne non triable", () => {
    // undefined et non "none" : « none » signifie « triable, pas triée ».
    expect(ariaSortPourColonne(false, false, "asc")).toBeUndefined();
  });

  it("pose « none » sur une colonne triable mais non triée", () => {
    expect(ariaSortPourColonne(true, false, "desc")).toBe("none");
  });

  it("traduit le sens de la colonne effectivement triée", () => {
    expect(ariaSortPourColonne(true, true, "asc")).toBe("ascending");
    expect(ariaSortPourColonne(true, true, "desc")).toBe("descending");
  });
});
