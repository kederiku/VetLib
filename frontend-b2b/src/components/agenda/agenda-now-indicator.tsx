/**
 * Ligne "maintenant" de la grille agenda.
 *
 * Trait rouge + pastille sur la colonne d'aujourd'hui, à la hauteur de
 * l'heure courante (heure de Paris, comme tout le positionnement). Le
 * tick de mise à jour (60 s) vit dans CE composant, volontairement
 * isolé : c'est lui seul qui se re-rend chaque minute, pas la grille et
 * ses dizaines de blocs.
 */
"use client";

import { useEffect, useState } from "react";

import type { AgendaWindow } from "@/lib/agenda/layout";
import { minutesToPct } from "@/lib/agenda/layout";
import { parisNowMinutes } from "@/lib/date/format";

export function AgendaNowIndicator({ window }: { window: AgendaWindow }) {
  const [nowMinutes, setNowMinutes] = useState(() => parisNowMinutes());

  useEffect(() => {
    // 60 s : une précision à la minute suffit largement pour se repérer.
    const interval = setInterval(() => {
      setNowMinutes(parisNowMinutes());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const topPct = minutesToPct(nowMinutes, window);
  // Hors de la fenêtre affichée (nuit) : pas de ligne.
  if (topPct === null) {
    return null;
  }

  return (
    // pointer-events-none : la ligne ne doit pas voler les clics des
    // cellules de création situées dessous. aria-hidden : repère
    // purement visuel, l'heure courante n'apporte rien au lecteur
    // d'écran ici.
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-0 left-0 z-20"
      style={{ top: `${topPct}%` }}
    >
      <div className="relative h-px bg-destructive">
        <div className="absolute top-1/2 -left-1 size-2 -translate-y-1/2 rounded-full bg-destructive" />
      </div>
    </div>
  );
}
