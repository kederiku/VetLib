/**
 * Tests de l'étiquetage des heures de la grille d'agenda.
 *
 * `minutesToTimeLabel` transforme une position dans la grille (minutes depuis
 * minuit) en libellé du rail horaire. Une erreur de rembourrage produirait
 * « 9:0 » au lieu de « 09:00 » : la colonne des heures se désalignerait sur
 * toute la hauteur de l'écran.
 */
import { describe, expect, it } from "vitest";

import { minutesToTimeLabel } from "@/components/agenda/agenda-grid-column";

describe("minutesToTimeLabel", () => {
  it("complète heures et minutes sur deux chiffres", () => {
    expect(minutesToTimeLabel(0)).toBe("00:00");
    expect(minutesToTimeLabel(9 * 60)).toBe("09:00");
    expect(minutesToTimeLabel(9 * 60 + 5)).toBe("09:05");
  });

  it("étiquette les demi-heures de la grille", () => {
    // La grille est découpée en tranches de 30 minutes : ce sont les
    // valeurs réellement rencontrées.
    expect(minutesToTimeLabel(7 * 60 + 30)).toBe("07:30");
    expect(minutesToTimeLabel(13 * 60 + 30)).toBe("13:30");
  });

  it("gère la dernière minute de la journée", () => {
    expect(minutesToTimeLabel(23 * 60 + 59)).toBe("23:59");
  });
});
