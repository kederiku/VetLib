/**
 * Moteur de POSITIONNEMENT de la grille agenda : fonctions pures.
 *
 * Entrée : les rendez-vous d'une colonne (un jour, ou un praticien) et
 * la fenêtre horaire affichée. Sortie : pour chaque rendez-vous, sa
 * géométrie en POURCENTAGES de la colonne (top/height = position dans
 * le temps, left/width = partage horizontal en cas de chevauchement).
 * Aucun accès au DOM ni à l'horloge : tout est calculable et testable
 * à la main, le composant React ne fait qu'appliquer les pourcentages
 * en style inline.
 *
 * Règle de fuseau du projet : les minutes viennent de
 * getParisMinutesOfDay (heure de la clinique), jamais de getHours()
 * (heure du navigateur) — sinon tous les blocs glisseraient pour un
 * poste hors de France.
 */
import type { AgendaEntryResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { getParisMinutesOfDay } from "@/lib/date/format";

/** Fenêtre horaire affichée, en minutes depuis minuit (heure clinique). */
export type AgendaWindow = {
  startMin: number;
  endMin: number;
};

/** Un rendez-vous muni de sa géométrie dans la colonne (en %). */
export type PositionedEvent = {
  entry: AgendaEntryResponse;
  topPct: number;
  heightPct: number;
  leftPct: number;
  widthPct: number;
};

// Bornes par défaut : 7 h - 20 h couvre la journée type d'une clinique.
// La fenêtre s'étend si un rendez-vous déborde (garde, urgence tardive).
const DEFAULT_START_MIN = 7 * 60;
const DEFAULT_END_MIN = 20 * 60;

// Durée d'affichage minimale d'un bloc : un rendez-vous de 5 minutes
// resterait cliquable et lisible (l'équivalent d'un quart d'heure).
const MIN_BLOCK_MINUTES = 15;

/**
 * Fenêtre horaire couvrant TOUS les rendez-vous de la période affichée.
 *
 * Toujours au moins 7 h - 20 h ; étendue à l'heure PLEINE précédant le
 * rendez-vous le plus tôt et suivant le plus tardif. Calculée sur la
 * période entière (pas jour par jour) : naviguer dans la même semaine
 * ne fait pas "sauter" la grille.
 */
export function computeWindow(entries: AgendaEntryResponse[]): AgendaWindow {
  let startMin = DEFAULT_START_MIN;
  let endMin = DEFAULT_END_MIN;

  for (const entry of entries) {
    const entryStart = getParisMinutesOfDay(entry.starts_at);
    const entryEnd = getParisMinutesOfDay(entry.ends_at);
    // Math.floor/ceil sur l'heure : la fenêtre s'aligne sur des heures
    // pleines, jamais sur 8 h 23.
    startMin = Math.min(startMin, Math.floor(entryStart / 60) * 60);
    // Un rendez-vous finissant après minuit (entryEnd < entryStart)
    // étend simplement la fenêtre jusqu'à minuit.
    endMin = Math.max(
      endMin,
      entryEnd < entryStart ? 24 * 60 : Math.ceil(entryEnd / 60) * 60,
    );
  }

  return {
    startMin: Math.max(0, startMin),
    endMin: Math.min(24 * 60, endMin),
  };
}

// Représentation intermédiaire pendant l'empaquetage : le rendez-vous
// et ses bornes en minutes, puis la piste qui lui est affectée.
type WorkingEvent = {
  entry: AgendaEntryResponse;
  startMin: number;
  endMin: number;
  track: number;
};

/**
 * Positionne les rendez-vous d'UNE colonne (un jour ou un praticien).
 *
 * Algorithme "pistes", version simplifiée de celui de Google Calendar :
 * 1. trier par début croissant (à début égal, le plus long d'abord :
 *    il structure la colonne, les courts se glissent à côté) ;
 * 2. regrouper en CLUSTERS les rendez-vous transitivement liés par
 *    chevauchement (un cluster se ferme quand le suivant commence après
 *    la fin de tout ce qui précède) ;
 * 3. dans chaque cluster, affecter chaque rendez-vous à la PREMIÈRE
 *    piste libre (dont le dernier occupant est terminé) ;
 * 4. n pistes dans le cluster => chaque bloc occupe 1/n de la largeur.
 */
export function layoutDayEvents(
  entries: AgendaEntryResponse[],
  window: AgendaWindow,
): PositionedEvent[] {
  const total = window.endMin - window.startMin;
  if (total <= 0 || entries.length === 0) {
    return [];
  }

  // Étape 0 : minutes murales + garde-fous. Un rendez-vous qui déborde
  // de la fenêtre est ROGNÉ visuellement (le détail montre les vraies
  // heures) ; une fin avant le début (passage de minuit) est ramenée à
  // la fin de fenêtre.
  const working: WorkingEvent[] = entries.map((entry) => {
    const rawStart = getParisMinutesOfDay(entry.starts_at);
    const rawEnd = getParisMinutesOfDay(entry.ends_at);
    const startMin = Math.max(window.startMin, rawStart);
    const endMin = Math.min(
      window.endMin,
      Math.max(
        rawEnd < rawStart ? window.endMin : rawEnd,
        startMin + MIN_BLOCK_MINUTES,
      ),
    );
    return { entry, startMin, endMin, track: 0 };
  });

  // Étape 1 : tri début croissant, puis durée décroissante.
  working.sort(
    (a, b) =>
      a.startMin - b.startMin ||
      b.endMin - b.startMin - (a.endMin - a.startMin),
  );

  const positioned: PositionedEvent[] = [];
  // Cluster courant : ses membres, la fin de piste la plus tardive, et
  // la fin de chaque piste (index = numéro de piste).
  let cluster: WorkingEvent[] = [];
  let clusterMaxEnd = -1;
  let trackEnds: number[] = [];

  const flushCluster = () => {
    const trackCount = trackEnds.length;
    for (const event of cluster) {
      positioned.push({
        entry: event.entry,
        topPct: ((event.startMin - window.startMin) / total) * 100,
        heightPct: ((event.endMin - event.startMin) / total) * 100,
        // Petite gouttière droite (2 %) : deux blocs côte à côte ne se
        // touchent pas, l'oeil les sépare sans bordure épaisse.
        leftPct: (event.track / trackCount) * 100,
        widthPct: 100 / trackCount - (trackCount > 1 ? 2 : 0),
      });
    }
    cluster = [];
    trackEnds = [];
    clusterMaxEnd = -1;
  };

  for (const event of working) {
    // Nouveau cluster : ce rendez-vous commence après la fin de TOUT ce
    // qui précède — plus aucun chevauchement possible avec l'existant.
    if (cluster.length > 0 && event.startMin >= clusterMaxEnd) {
      flushCluster();
    }

    // Première piste libre, sinon nouvelle piste.
    let track = trackEnds.findIndex((end) => end <= event.startMin);
    if (track === -1) {
      track = trackEnds.length;
      trackEnds.push(0);
    }
    event.track = track;
    trackEnds[track] = event.endMin;

    cluster.push(event);
    clusterMaxEnd = Math.max(clusterMaxEnd, event.endMin);
  }
  flushCluster();

  return positioned;
}

/**
 * Position verticale (en %) d'un instant donné dans la fenêtre, ou null
 * hors fenêtre. Sert à la ligne "maintenant" et au pré-remplissage du
 * clic sur un créneau.
 */
export function minutesToPct(
  minutes: number,
  window: AgendaWindow,
): number | null {
  if (minutes < window.startMin || minutes > window.endMin) {
    return null;
  }
  return ((minutes - window.startMin) / (window.endMin - window.startMin)) * 100;
}
