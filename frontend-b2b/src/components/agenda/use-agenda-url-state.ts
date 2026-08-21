/**
 * État de l'écran Agenda porté par l'URL.
 *
 * /agenda?view=day&date=2026-08-24&resource=<uuid> : la vue, la date
 * d'ancrage et le filtre praticien vivent dans les query params, plus
 * dans des useState. Bénéfices concrets : F5 ne ramène plus à
 * aujourd'hui, un lien "semaine du 24, Dr Martin" se partage entre
 * collègues, et Précédent/Suivant du navigateur fonctionnent.
 *
 * Parsing DÉFENSIF : l'URL est une entrée utilisateur (modifiable à la
 * main) — toute valeur invalide retombe sur le défaut au lieu de casser
 * l'écran. Les valeurs par défaut sont OMISES de l'URL (adresses
 * propres : /agenda tout court pour la semaine courante).
 */
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useIsMobile } from "@/hooks/use-mobile";
import { parisToday, toIsoDate } from "@/lib/date/format";

export type AgendaView = "day" | "week";

// Valeur sentinelle du filtre "tous les praticiens" : exclue des params
// de la requête agenda (le backend attend soit un UUID, soit RIEN) et
// omise de l'URL. Définie ICI (source de vérité de l'état d'agenda) et
// importée par la toolbar.
export const ALL_RESOURCES = "all";

export type AgendaUrlState = {
  view: AgendaView;
  anchorDate: Date;
  resourceId: string;
  setView: (view: AgendaView) => void;
  setAnchorDate: (date: Date) => void;
  setResourceId: (resourceId: string) => void;
};

// "2026-08-24" strict : toute autre forme est rejetée par le parsing.
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// UUID : le backend n'accepte que cette forme pour resource_id, une
// valeur libre bricolée dans l'URL partirait en 422.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseAnchor(param: string | null): Date {
  if (param !== null && DATE_PARAM_PATTERN.test(param)) {
    const [year, month, day] = param.split("-").map(Number);
    const parsed = new Date(year, month - 1, day);
    // new Date(2026, 12, 42) "déborde" silencieusement sur le mois
    // suivant : on vérifie que la date relue correspond à la demande.
    if (toIsoDate(parsed) === param) {
      return parsed;
    }
  }
  return parisToday();
}

export function useAgendaUrlState(): AgendaUrlState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();

  // Vue par défaut selon l'écran : la grille semaine est illisible sur
  // un téléphone, on y ouvre la vue jour. Une URL SANS param view suit
  // donc l'appareil ; en choisir une explicitement l'écrit dans l'URL.
  const defaultView: AgendaView = isMobile ? "day" : "week";
  const viewParam = searchParams.get("view");
  const view: AgendaView =
    viewParam === "day" || viewParam === "week" ? viewParam : defaultView;

  const anchorDate = parseAnchor(searchParams.get("date"));
  // Même parsing défensif que view et date : une valeur qui n'est pas
  // un UUID (URL tronquée, lien bricolé) retombe sur "tous les
  // praticiens" au lieu de partir en 422 à chaque requête d'agenda.
  const resourceParam = searchParams.get("resource");
  const resourceId =
    resourceParam !== null && UUID_PATTERN.test(resourceParam)
      ? resourceParam
      : ALL_RESOURCES;

  // Reconstruit l'URL avec UNE valeur changée, en omettant les défauts.
  const update = (changes: {
    view?: AgendaView;
    anchorDate?: Date;
    resourceId?: string;
  }) => {
    const nextView = changes.view ?? view;
    const nextAnchor = changes.anchorDate ?? anchorDate;
    const nextResource = changes.resourceId ?? resourceId;

    const params = new URLSearchParams();
    if (nextView !== defaultView) {
      params.set("view", nextView);
    }
    if (toIsoDate(nextAnchor) !== toIsoDate(parisToday())) {
      params.set("date", toIsoDate(nextAnchor));
    }
    if (nextResource !== ALL_RESOURCES) {
      params.set("resource", nextResource);
    }

    const qs = params.toString();
    // replace (pas push) : chaque coup de flèche "semaine suivante" ne
    // doit pas empiler une entrée d'historique — Précédent ramènerait
    // 15 fois sur l'agenda. scroll:false : pas de remontée de page.
    router.replace(qs === "" ? pathname : `${pathname}?${qs}`, {
      scroll: false,
    });
  };

  return {
    view,
    anchorDate,
    resourceId,
    setView: (nextView) => update({ view: nextView }),
    setAnchorDate: (date) => update({ anchorDate: date }),
    setResourceId: (nextResourceId) => update({ resourceId: nextResourceId }),
  };
}
