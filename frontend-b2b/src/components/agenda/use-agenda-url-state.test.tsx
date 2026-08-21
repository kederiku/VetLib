/**
 * Tests de l'état de l'agenda porté par l'URL.
 *
 * Mettre la vue, la date et le praticien dans l'URL rend l'agenda
 * partageable : un vétérinaire peut envoyer un lien vers « le mardi 25, agenda
 * du Dr Leroy ». Cela impose deux exigences opposées.
 *
 * D'abord la ROBUSTESSE en lecture : une URL peut être tapée, tronquée ou
 * héritée d'une version antérieure. Chaque paramètre est donc validé, et toute
 * valeur douteuse retombe sur un défaut — jamais sur un écran cassé ou une
 * date « Invalid Date ».
 *
 * Ensuite la SOBRIÉTÉ en écriture : les valeurs par défaut sont omises de
 * l'URL, pour qu'un agenda ouvert sur aujourd'hui affiche /agenda tout court
 * et non /agenda?view=week&date=2026-08-20&resource=all.
 */
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALL_RESOURCES,
  useAgendaUrlState,
} from "@/components/agenda/use-agenda-url-state";
import { toIsoDate } from "@/lib/date/format";
import { renderHookWithProviders } from "@/test/render";

const navigation = vi.hoisted(() => ({
  parametres: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: navigation.replace,
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/agenda",
  useSearchParams: () => navigation.parametres,
}));

/** Monte le hook avec les paramètres d'URL donnés. */
function monter(recherche = "") {
  navigation.parametres = new URLSearchParams(recherche);
  return renderHookWithProviders(() => useAgendaUrlState());
}

/** Dernière URL demandée au routeur. */
function derniereUrl(): string {
  const appels = navigation.replace.mock.calls;
  return appels[appels.length - 1][0] as string;
}

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

beforeEach(() => {
  // parisToday() est relu à chaque rendu : sans horloge figée, « la date du
  // jour » changerait entre deux assertions autour de minuit.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-20T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useAgendaUrlState — lecture de la vue", () => {
  it("accepte les deux vues valides", () => {
    expect(monter("view=day").result.current.view).toBe("day");
    expect(monter("view=week").result.current.view).toBe("week");
  });

  it("retombe sur la semaine quand le paramètre est absent ou farfelu", () => {
    // Sur un poste de bureau, la semaine est le défaut : c'est la vue qui
    // sert à organiser la charge.
    expect(monter().result.current.view).toBe("week");
    expect(monter("view=month").result.current.view).toBe("week");
    expect(monter("view=").result.current.view).toBe("week");
  });
});

describe("useAgendaUrlState — lecture de la date", () => {
  it("accepte une date bien formée", () => {
    const { result } = monter("date=2026-08-25");
    expect(toIsoDate(result.current.anchorDate)).toBe("2026-08-25");
  });

  it("retombe sur aujourd'hui quand le format est invalide", () => {
    for (const parametre of ["date=demain", "date=2026-8-5", "date="]) {
      const { result } = monter(parametre);
      expect(toIsoDate(result.current.anchorDate), parametre).toBe("2026-08-20");
    }
  });

  it("refuse une date bien formée mais inexistante", () => {
    // 42 août : le format passe la première grille, mais la reconstruction
    // déborderait sur septembre. Le contrôle aller-retour l'attrape, sans
    // quoi l'agenda s'ouvrirait sur un jour que l'utilisateur n'a pas
    // demandé.
    const { result } = monter("date=2026-08-42");
    expect(toIsoDate(result.current.anchorDate)).toBe("2026-08-20");
  });

  it("refuse un 30 février", () => {
    const { result } = monter("date=2026-02-30");
    expect(toIsoDate(result.current.anchorDate)).toBe("2026-08-20");
  });
});

describe("useAgendaUrlState — lecture du praticien", () => {
  it("accepte un identifiant bien formé", () => {
    expect(monter(`resource=${UUID}`).result.current.resourceId).toBe(UUID);
  });

  it("ignore une valeur qui n'est pas un identifiant", () => {
    // Sans ce contrôle, une valeur inventée partirait telle quelle dans la
    // requête d'agenda et produirait une liste vide sans explication.
    for (const parametre of ["resource=dr-martin", "resource=123", "resource="]) {
      expect(monter(parametre).result.current.resourceId, parametre).toBe(
        ALL_RESOURCES,
      );
    }
  });
});

describe("useAgendaUrlState — écriture dans l'URL", () => {
  it("omet les valeurs par défaut", () => {
    // Revenir à la vue par défaut sur aujourd'hui doit rendre l'URL nue :
    // c'est ce qui garantit qu'un lien partagé reste lisible.
    const { result } = monter("view=day");
    act(() => result.current.setView("week"));

    expect(derniereUrl()).toBe("/agenda");
  });

  it("inscrit une vue non par défaut", () => {
    const { result } = monter();
    act(() => result.current.setView("day"));

    expect(derniereUrl()).toBe("/agenda?view=day");
  });

  it("inscrit une date autre qu'aujourd'hui", () => {
    const { result } = monter();
    act(() => result.current.setAnchorDate(new Date(2026, 7, 25)));

    expect(derniereUrl()).toBe("/agenda?date=2026-08-25");
  });

  it("inscrit le praticien sélectionné", () => {
    const { result } = monter();
    act(() => result.current.setResourceId(UUID));

    expect(derniereUrl()).toBe(`/agenda?resource=${UUID}`);
  });

  it("cumule les paramètres non par défaut", () => {
    const { result } = monter(`view=day&resource=${UUID}`);
    act(() => result.current.setAnchorDate(new Date(2026, 7, 25)));

    const url = derniereUrl();
    expect(url).toContain("view=day");
    expect(url).toContain("date=2026-08-25");
    expect(url).toContain(`resource=${UUID}`);
  });

  it("ne fait pas remonter la page en haut", () => {
    // scroll: false — changer de jour depuis le bas de la grille ne doit
    // pas ramener l'utilisateur au début de la journée.
    const { result } = monter();
    act(() => result.current.setView("day"));

    expect(navigation.replace).toHaveBeenCalledWith(
      expect.any(String),
      { scroll: false },
    );
  });

  it("conserve les autres paramètres en changeant l'un d'eux", () => {
    const { result } = monter("view=day&date=2026-08-25");
    act(() => result.current.setResourceId(UUID));

    const url = derniereUrl();
    expect(url).toContain("view=day");
    expect(url).toContain("date=2026-08-25");
    expect(url).toContain(`resource=${UUID}`);
  });
});
