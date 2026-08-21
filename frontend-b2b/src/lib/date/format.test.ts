/**
 * Tests du positionnement horaire de l'agenda dans le fuseau de la clinique.
 *
 * C'est le test le plus important du module : getParisMinutesOfDay décide de
 * la hauteur à laquelle chaque rendez-vous est dessiné. S'il lisait le fuseau
 * du NAVIGATEUR au lieu de celui de la clinique, tous les blocs glisseraient
 * pour un membre du personnel en déplacement — et le décalage changerait deux
 * fois par an, au passage à l'heure d'été.
 *
 * Ces assertions portent volontairement sur des NOMBRES et non sur des chaînes
 * formatées : le rendu textuel de Intl dépend de la version d'ICU embarquée
 * par Node, qui diffère entre un poste macOS et un runner Linux. Un test sur
 * "09:00" passerait en local et pourrait échouer en CI sur une espace
 * insécable.
 */
import { describe, expect, it } from "vitest";

import { getParisMinutesOfDay } from "@/lib/date/format";

describe("getParisMinutesOfDay", () => {
  it("convertit un instant UTC en minutes de l'heure de Paris (heure d'été)", () => {
    // En août, Paris est à UTC+2 : 07:00Z s'affiche 09h00, soit 540 minutes.
    expect(getParisMinutesOfDay("2026-08-20T07:00:00Z")).toBe(9 * 60);
    expect(getParisMinutesOfDay("2026-08-20T07:30:00Z")).toBe(9 * 60 + 30);
  });

  it("convertit correctement en heure d'hiver", () => {
    // En janvier, Paris est à UTC+1 : le même 07:00Z s'affiche 08h00.
    // C'est exactement le bug qu'un décalage codé en dur produirait.
    expect(getParisMinutesOfDay("2026-01-20T07:00:00Z")).toBe(8 * 60);
  });

  it("ne dépend pas du fuseau de la machine qui exécute le test", () => {
    // Les deux instants ci-dessous sont le même moment, écrits avec des
    // décalages différents : ils doivent donner la même position verticale.
    expect(getParisMinutesOfDay("2026-08-20T07:00:00Z")).toBe(
      getParisMinutesOfDay("2026-08-20T09:00:00+02:00"),
    );
  });

  it("place minuit heure de Paris à 0", () => {
    // 22:00Z le 19 août = 00:00 le 20 août à Paris.
    expect(getParisMinutesOfDay("2026-08-19T22:00:00Z")).toBe(0);
  });

  it("gère la dernière minute de la journée", () => {
    // 21:59Z le 20 août = 23:59 heure de Paris.
    expect(getParisMinutesOfDay("2026-08-20T21:59:00Z")).toBe(23 * 60 + 59);
  });
});
