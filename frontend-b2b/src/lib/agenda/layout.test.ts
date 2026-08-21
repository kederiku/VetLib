/**
 * Tests du moteur de positionnement de la grille agenda.
 *
 * Pourquoi ces fonctions méritent des tests unitaires : l'algorithme de
 * placement des rendez-vous qui se chevauchent (clusters et pistes) est le
 * genre de code dont une régression ne "plante" pas — elle superpose
 * silencieusement deux blocs, ou en rétrécit un de moitié. Personne ne le
 * remarque avant qu'un vétérinaire ne rate un rendez-vous.
 *
 * Rappel de fuseau : les instants sont en UTC, l'affichage en heure de Paris.
 * En août Paris est à UTC+2, donc 07:00Z correspond à 09h00 à l'écran.
 */
import { describe, expect, it } from "vitest";

import {
  computeWindow,
  layoutDayEvents,
  minutesToPct,
} from "@/lib/agenda/layout";
import { buildAgendaEntry } from "@/test/fixtures";

// Bornes par défaut de la grille : 7h - 20h, soit 780 minutes affichées.
const DEBUT_DEFAUT = 7 * 60;
const FIN_DEFAUT = 20 * 60;
const FENETRE_DEFAUT = { startMin: DEBUT_DEFAUT, endMin: FIN_DEFAUT };

/** Raccourci : un rendez-vous décrit par ses heures de Paris. */
function rdv(id: string, debutParis: string, finParis: string) {
  // "09:00" -> "2026-08-20T07:00:00Z" (Paris = UTC+2 en août).
  const versUtc = (heureParis: string): string => {
    const [h, m] = heureParis.split(":").map(Number);
    const utc = String(h - 2).padStart(2, "0");
    return `2026-08-20T${utc}:${String(m).padStart(2, "0")}:00Z`;
  };
  return buildAgendaEntry({
    id,
    starts_at: versUtc(debutParis),
    ends_at: versUtc(finParis),
  });
}

describe("computeWindow", () => {
  it("retient 7h-20h quand aucun rendez-vous ne déborde", () => {
    expect(computeWindow([])).toEqual(FENETRE_DEFAUT);
    expect(computeWindow([rdv("a", "09:00", "10:00")])).toEqual(FENETRE_DEFAUT);
  });

  it("s'étend jusqu'à l'heure pleine précédant le rendez-vous le plus tôt", () => {
    // 06:30 doit ouvrir la grille à 06:00, pas à 06:30 : la colonne des
    // heures resterait sinon désalignée de la graduation.
    expect(computeWindow([rdv("a", "06:30", "07:30")]).startMin).toBe(6 * 60);
  });

  it("s'étend jusqu'à l'heure pleine suivant le rendez-vous le plus tardif", () => {
    // Une urgence de fin de journée : 20:15 doit repousser la grille à 21h.
    expect(computeWindow([rdv("a", "19:00", "20:15")]).endMin).toBe(21 * 60);
  });

  it("couvre la période entière, pas le rendez-vous le plus extrême de chaque jour", () => {
    const fenetre = computeWindow([
      rdv("tot", "06:15", "07:00"),
      rdv("tard", "20:00", "21:30"),
    ]);
    expect(fenetre).toEqual({ startMin: 6 * 60, endMin: 22 * 60 });
  });

  it("ne sort jamais des bornes d'une journée", () => {
    const fenetre = computeWindow([rdv("nuit", "23:00", "23:30")]);
    expect(fenetre.startMin).toBeGreaterThanOrEqual(0);
    expect(fenetre.endMin).toBeLessThanOrEqual(24 * 60);
  });
});

describe("layoutDayEvents", () => {
  it("ne rend rien pour une colonne vide", () => {
    expect(layoutDayEvents([], FENETRE_DEFAUT)).toEqual([]);
  });

  it("donne toute la largeur à un rendez-vous seul", () => {
    const [bloc] = layoutDayEvents([rdv("a", "09:00", "10:00")], FENETRE_DEFAUT);
    expect(bloc.leftPct).toBe(0);
    expect(bloc.widthPct).toBe(100);
    // 09:00 = 540 min, soit 120 min après le début de fenêtre sur 780.
    expect(bloc.topPct).toBeCloseTo((120 / 780) * 100, 5);
    expect(bloc.heightPct).toBeCloseTo((60 / 780) * 100, 5);
  });

  it("laisse pleine largeur à deux rendez-vous qui ne se chevauchent pas", () => {
    const blocs = layoutDayEvents(
      [rdv("a", "09:00", "10:00"), rdv("b", "11:00", "12:00")],
      FENETRE_DEFAUT,
    );
    // Deux clusters distincts : chacun ignore l'autre.
    expect(blocs.map((b) => b.widthPct)).toEqual([100, 100]);
    expect(blocs.map((b) => b.leftPct)).toEqual([0, 0]);
  });

  it("partage la colonne en deux quand deux rendez-vous se chevauchent", () => {
    const blocs = layoutDayEvents(
      [rdv("a", "09:00", "10:00"), rdv("b", "09:30", "10:30")],
      FENETRE_DEFAUT,
    );
    // 100/2 moins la gouttière de 2 % qui sépare visuellement les blocs.
    expect(blocs.map((b) => b.widthPct)).toEqual([48, 48]);
    expect(new Set(blocs.map((b) => b.leftPct))).toEqual(new Set([0, 50]));
  });

  it("place un rendez-vous entièrement imbriqué dans une seconde piste", () => {
    // Une consultation courte pendant une chirurgie longue.
    const blocs = layoutDayEvents(
      [rdv("longue", "09:00", "12:00"), rdv("courte", "10:00", "10:30")],
      FENETRE_DEFAUT,
    );
    expect(new Set(blocs.map((b) => b.leftPct))).toEqual(new Set([0, 50]));
  });

  it("partage en trois quand trois rendez-vous se chevauchent", () => {
    const blocs = layoutDayEvents(
      [
        rdv("a", "09:00", "10:00"),
        rdv("b", "09:15", "10:15"),
        rdv("c", "09:30", "10:30"),
      ],
      FENETRE_DEFAUT,
    );
    expect(blocs).toHaveLength(3);
    for (const bloc of blocs) {
      expect(bloc.widthPct).toBeCloseTo(100 / 3 - 2, 5);
    }
  });

  it("réutilise une piste libérée plutôt que d'en ouvrir une nouvelle", () => {
    // b chevauche a ; c commence après la fin de b mais pendant a : il doit
    // reprendre la piste de b (2 pistes au total), pas en créer une 3e.
    const blocs = layoutDayEvents(
      [
        rdv("a", "09:00", "12:00"),
        rdv("b", "09:15", "10:00"),
        rdv("c", "10:00", "11:00"),
      ],
      FENETRE_DEFAUT,
    );
    expect(new Set(blocs.map((b) => b.leftPct))).toEqual(new Set([0, 50]));
  });

  it("donne une hauteur minimale lisible à un rendez-vous très court", () => {
    // Un rendez-vous de 5 minutes doit rester cliquable : il est affiché
    // comme un quart d'heure.
    const [bloc] = layoutDayEvents([rdv("a", "09:00", "09:05")], FENETRE_DEFAUT);
    expect(bloc.heightPct).toBeCloseTo((15 / 780) * 100, 5);
  });

  it("rogne un rendez-vous qui déborde de la fenêtre affichée", () => {
    const [bloc] = layoutDayEvents([rdv("a", "06:00", "08:00")], FENETRE_DEFAUT);
    // Rogné au début de fenêtre : il commence visuellement à 0 %.
    expect(bloc.topPct).toBe(0);
    expect(bloc.heightPct).toBeCloseTo((60 / 780) * 100, 5);
  });
});

describe("minutesToPct", () => {
  it("place les bornes de la fenêtre à 0 % et 100 %", () => {
    expect(minutesToPct(DEBUT_DEFAUT, FENETRE_DEFAUT)).toBe(0);
    expect(minutesToPct(FIN_DEFAUT, FENETRE_DEFAUT)).toBe(100);
  });

  it("place le milieu de la fenêtre à 50 %", () => {
    // 13h30 est à mi-chemin entre 7h et 20h.
    expect(minutesToPct(13 * 60 + 30, FENETRE_DEFAUT)).toBeCloseTo(50, 5);
  });

  it("renvoie null hors de la fenêtre", () => {
    // Sert à masquer la ligne "maintenant" quand l'heure courante n'est
    // pas dans la plage affichée.
    expect(minutesToPct(5 * 60, FENETRE_DEFAUT)).toBeNull();
    expect(minutesToPct(23 * 60, FENETRE_DEFAUT)).toBeNull();
  });
});
