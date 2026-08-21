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

import {
  formatDateRangeLabel,
  formatDayLong,
  formatDayShort,
  formatTime,
  formatTimeRange,
  getParisMinutesOfDay,
  getWeekStart,
  parisWallTimeToIso,
  toIsoDate,
  toParisDayKey,
  toParisDisplayDate,
  WEEKDAYS,
} from "@/lib/date/format";

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

describe("toParisDayKey", () => {
  it("donne le jour calendaire vu par la clinique", () => {
    expect(toParisDayKey("2026-08-20T12:00:00Z")).toBe("2026-08-20");
  });

  it("rattache un rendez-vous de début de nuit au bon jour", () => {
    // 22:30Z le 20 août = 00:30 le 21 août à Paris. Sans conversion, ce
    // rendez-vous serait rangé dans la colonne de la veille.
    expect(toParisDayKey("2026-08-20T22:30:00Z")).toBe("2026-08-21");
  });

  it("complète mois et jour sur deux chiffres", () => {
    // Une clé "2026-1-5" casserait le tri alphabétique des colonnes.
    expect(toParisDayKey("2026-01-05T12:00:00Z")).toBe("2026-01-05");
  });
});

describe("parisWallTimeToIso", () => {
  it("convertit une heure murale d'été en instant UTC", () => {
    // 09:30 à la clinique en août (UTC+2) = 07:30 UTC.
    expect(parisWallTimeToIso("2026-08-20", "09:30")).toBe(
      "2026-08-20T07:30:00.000Z",
    );
  });

  it("convertit une heure murale d'hiver en instant UTC", () => {
    // Même heure murale en janvier (UTC+1) = 08:30 UTC. Un décalage codé
    // en dur donnerait ici un rendez-vous décalé d'une heure.
    expect(parisWallTimeToIso("2026-01-20", "08:30")).toBe(
      "2026-01-20T07:30:00.000Z",
    );
  });

  it("reste juste la nuit du passage à l'heure d'été", () => {
    // Le 29 mars 2026, à 02:00 Paris on saute à 03:00. C'est la nuit où
    // une conversion naïve se trompe d'une heure : la double lecture du
    // décalage dans l'implémentation existe pour ce cas précis.
    expect(parisWallTimeToIso("2026-03-29", "03:00")).toBe(
      "2026-03-29T01:00:00.000Z",
    );
    expect(parisWallTimeToIso("2026-03-29", "01:00")).toBe(
      "2026-03-29T00:00:00.000Z",
    );
  });

  it("reste juste la nuit du passage à l'heure d'hiver", () => {
    // Le 25 octobre 2026, 03:00 Paris est déjà en UTC+1.
    expect(parisWallTimeToIso("2026-10-25", "03:00")).toBe(
      "2026-10-25T02:00:00.000Z",
    );
  });

  it("est l'exact inverse de getParisMinutesOfDay", () => {
    // Cet aller-retour est l'invariant qui compte : l'heure choisie dans
    // la grille doit être celle qu'on relit après l'aller-retour serveur.
    for (const jour of ["2026-01-15", "2026-06-15", "2026-03-29", "2026-10-25"]) {
      for (const heure of ["00:00", "09:30", "14:15", "23:45"]) {
        const iso = parisWallTimeToIso(jour, heure);
        const [h, m] = heure.split(":").map(Number);
        expect(getParisMinutesOfDay(iso), `${jour} ${heure}`).toBe(h * 60 + m);
      }
    }
  });
});

describe("getWeekStart", () => {
  it("renvoie le LUNDI de la semaine, pas le dimanche", () => {
    // Le défaut de date-fns est dimanche (convention américaine) : une
    // semaine d'agenda décalée d'un jour serait immédiatement visible,
    // mais l'erreur est facile à réintroduire lors d'un refactor.
    const jeudi = new Date(2026, 7, 20); // jeudi 20 août 2026
    expect(getWeekStart(jeudi).getDay()).toBe(1);
    expect(toIsoDate(getWeekStart(jeudi))).toBe("2026-08-17");
  });

  it("laisse un lundi inchangé", () => {
    const lundi = new Date(2026, 7, 17);
    expect(toIsoDate(getWeekStart(lundi))).toBe("2026-08-17");
  });

  it("rattache le dimanche à la semaine qui vient de s'écouler", () => {
    // Dimanche 23 août appartient à la semaine du lundi 17.
    const dimanche = new Date(2026, 7, 23);
    expect(toIsoDate(getWeekStart(dimanche))).toBe("2026-08-17");
  });
});

describe("toIsoDate", () => {
  it("lit les composantes LOCALES, jamais UTC", () => {
    // toISOString() convertirait en UTC et pourrait changer de jour près
    // de minuit : le paramètre date_from partirait alors sur le mauvais jour.
    expect(toIsoDate(new Date(2026, 7, 20, 23, 30))).toBe("2026-08-20");
    expect(toIsoDate(new Date(2026, 0, 5, 0, 15))).toBe("2026-01-05");
  });
});

describe("toParisDisplayDate", () => {
  it("réancre le jour à midi UTC", () => {
    // Midi UTC tombe toujours le même jour à Paris (UTC+1 ou +2), quel que
    // soit le fuseau du poste : c'est ce qui empêche le titre de colonne de
    // se décaler d'un jour pour un utilisateur à l'est de la France.
    const instant = toParisDisplayDate(new Date(2026, 7, 20));
    expect(instant.toISOString()).toBe("2026-08-20T12:00:00.000Z");
    expect(toParisDayKey(instant.toISOString())).toBe("2026-08-20");
  });
});

describe("WEEKDAYS", () => {
  it("suit la convention du backend : 0 = lundi", () => {
    // WeeklyRangePayload.weekday commence au lundi. Une inversion ici
    // décalerait toute la semaine type d'un jour, sans erreur visible.
    expect(WEEKDAYS).toHaveLength(7);
    expect(WEEKDAYS[0]).toEqual({ value: 0, label: "Lundi" });
    expect(WEEKDAYS[6]).toEqual({ value: 6, label: "Dimanche" });
  });

  it("numérote les jours sans trou ni doublon", () => {
    expect(WEEKDAYS.map((jour) => jour.value)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("formatteurs d'affichage", () => {
  // Ces fonctions passent par Intl : le rendu textuel exact (espaces fines
  // insécables, abréviations) dépend de la version d'ICU embarquée par Node,
  // qui diffère entre un poste macOS et un runner Linux. On vérifie donc la
  // SUBSTANCE (le bon jour, la bonne heure) et non la ponctuation.
  it("formate l'heure de la clinique, pas celle du navigateur", () => {
    expect(formatTime("2026-08-20T07:00:00Z")).toContain("09");
    expect(formatTime("2026-01-20T07:00:00Z")).toContain("08");
  });

  it("formate une plage horaire avec ses deux bornes", () => {
    const plage = formatTimeRange(
      "2026-08-20T07:00:00Z",
      "2026-08-20T07:30:00Z",
    );
    expect(plage).toContain("09");
    expect(plage).toContain("30");
  });

  it("nomme le jour en français", () => {
    // 20 août 2026 est un jeudi.
    expect(formatDayLong("2026-08-20T12:00:00Z")).toContain("jeudi");
    expect(formatDayLong("2026-08-20T12:00:00Z")).toContain("20");
  });

  it("accepte indifféremment une chaîne ISO ou un objet Date", () => {
    const parIso = formatDayShort("2026-08-20T12:00:00Z");
    const parDate = formatDayShort(new Date("2026-08-20T12:00:00Z"));
    expect(parIso).toBe(parDate);
  });

  it("fusionne les bornes d'une période sur le même mois", () => {
    const libelle = formatDateRangeLabel(
      toParisDisplayDate(new Date(2026, 7, 17)),
      toParisDisplayDate(new Date(2026, 7, 23)),
    );
    expect(libelle).toContain("17");
    expect(libelle).toContain("23");
    expect(libelle).toContain("2026");
  });
});
