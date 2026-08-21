/**
 * Tests du vocabulaire des espèces d'animaux.
 *
 * Ce module est un simple dictionnaire, mais il est partagé par la fiche
 * animal, le formulaire de création et le tunnel de prise de rendez-vous : une
 * entrée manquante s'y traduirait par un libellé vide ou une icône absente au
 * milieu d'un parcours. Le test vérifie surtout la COHÉRENCE entre le
 * dictionnaire et l'ordre d'affichage, les deux pouvant diverger.
 */
import { describe, expect, it } from "vitest";

import { SPECIES, SPECIES_ORDER } from "@/lib/pets/species";

describe("SPECIES", () => {
  it("couvre les quatre espèces exposées par le backend", () => {
    expect(Object.keys(SPECIES).sort()).toEqual(["cat", "dog", "nac", "other"]);
  });

  it("associe à chaque espèce un libellé français et une icône", () => {
    for (const [code, meta] of Object.entries(SPECIES)) {
      expect(meta.label, `libellé manquant pour ${code}`).toBeTruthy();
      expect(meta.icon, `icône manquante pour ${code}`).toBeDefined();
    }
  });

  it("emploie les libellés métier attendus", () => {
    expect(SPECIES.dog.label).toBe("Chien");
    expect(SPECIES.cat.label).toBe("Chat");
    // NAC = nouveaux animaux de compagnie (lapins, furets, reptiles...).
    expect(SPECIES.nac.label).toBe("NAC");
    expect(SPECIES.other.label).toBe("Autre");
  });
});

describe("SPECIES_ORDER", () => {
  it("liste exactement les espèces du dictionnaire", () => {
    // Le vrai risque : ajouter une espèce dans SPECIES en oubliant de
    // l'ajouter ici, ce qui la rendrait invisible dans les formulaires.
    expect([...SPECIES_ORDER].sort()).toEqual(Object.keys(SPECIES).sort());
  });

  it("va du plus courant au plus rare", () => {
    expect(SPECIES_ORDER).toEqual(["dog", "cat", "nac", "other"]);
  });

  it("ne contient aucun doublon", () => {
    expect(new Set(SPECIES_ORDER).size).toBe(SPECIES_ORDER.length);
  });
});
