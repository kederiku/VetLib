/**
 * Tests des conversions de dates du portail propriétaires.
 *
 * Le sujet est piégeux et vaut largement des tests : le backend renvoie des
 * instants en UTC, la clinique raisonne en heure de Paris, et le visiteur peut
 * consulter le site depuis n'importe quel fuseau. Une erreur d'un jour dans le
 * regroupement des créneaux ne fait pas planter la page — elle affiche
 * simplement les disponibilités du mauvais jour.
 *
 * Les assertions portent sur des clés "YYYY-MM-DD" et non sur des libellés
 * formatés : le rendu textuel de Intl dépend de la version d'ICU embarquée
 * par Node, qui n'est pas la même sur un poste macOS et sur un runner Linux.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  localDayKey,
  parisToday,
  toParisDateKey,
} from "@/lib/date/format";

describe("toParisDateKey", () => {
  it("donne le jour calendaire de Paris d'un instant UTC", () => {
    expect(toParisDateKey("2026-08-20T12:00:00Z")).toBe("2026-08-20");
  });

  it("rattache un créneau de début de nuit au bon jour de Paris", () => {
    // 22:30Z le 20 août = 00:30 le 21 août à Paris (UTC+2 en été).
    // Sans conversion, ce créneau apparaîtrait la veille.
    expect(toParisDateKey("2026-08-20T22:30:00Z")).toBe("2026-08-21");
  });

  it("rattache un créneau de fin de nuit au bon jour de Paris en hiver", () => {
    // 23:30Z le 20 janvier = 00:30 le 21 janvier à Paris (UTC+1 en hiver).
    expect(toParisDateKey("2026-01-20T23:30:00Z")).toBe("2026-01-21");
  });

  it("ne décale pas un créneau de début de matinée", () => {
    // 06:00Z le 20 août = 08:00 le même jour à Paris.
    expect(toParisDateKey("2026-08-20T06:00:00Z")).toBe("2026-08-20");
  });

  it("complète les mois et les jours sur deux chiffres", () => {
    // Une clé "2026-1-5" casserait le tri alphabétique des jours.
    expect(toParisDateKey("2026-01-05T12:00:00Z")).toBe("2026-01-05");
  });

  it("donne le même résultat pour deux écritures du même instant", () => {
    expect(toParisDateKey("2026-08-20T22:30:00Z")).toBe(
      toParisDateKey("2026-08-21T00:30:00+02:00"),
    );
  });
});

describe("localDayKey", () => {
  it("lit les composantes locales d'une Date du calendrier", () => {
    // react-day-picker construit ses cases à midi local : on lit donc
    // getFullYear/getMonth/getDate, jamais toISOString() qui repasserait
    // par UTC et pourrait décaler d'un jour.
    expect(localDayKey(new Date(2026, 7, 20, 12, 0, 0))).toBe("2026-08-20");
  });

  it("complète sur deux chiffres", () => {
    expect(localDayKey(new Date(2026, 0, 5, 12, 0, 0))).toBe("2026-01-05");
  });

  it("ne décale pas la date pour une heure tardive", () => {
    // Le piège que cette fonction évite : à 23h locale, toISOString()
    // renverrait déjà le lendemain pour un fuseau à l'est de Greenwich.
    expect(localDayKey(new Date(2026, 7, 20, 23, 30, 0))).toBe("2026-08-20");
  });
});

describe("parisToday", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renvoie le jour de Paris, pas celui du navigateur", () => {
    // On fige l'horloge à 22:30 UTC : il est déjà minuit passé à Paris.
    // Un visiteur dont le navigateur est resté « hier » doit tout de même
    // voir le calendrier ouvert sur le bon jour.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T22:30:00Z"));
    expect(localDayKey(parisToday())).toBe("2026-08-21");
  });

  it("renvoie une Date à minuit local, comparable aux cases du calendrier", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));
    const jour = parisToday();
    expect(jour.getHours()).toBe(0);
    expect(jour.getMinutes()).toBe(0);
    expect(localDayKey(jour)).toBe("2026-08-20");
  });
});
