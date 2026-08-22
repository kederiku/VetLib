/**
 * Barre d'outils d'une datatable : recherche debouncée, et filtres.
 *
 * La recherche est le seul élément commun à tous les écrans ; les filtres
 * (statut, rôle…) arrivent en `children`, ce qui évite de paramétrer ce
 * composant pour chaque combinaison possible.
 */
"use client";

import { SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReactNode } from "react";

export function DataTableToolbar({
  recherche,
  onRechercheChange,
  onEffacer,
  placeholder,
  children,
}: {
  recherche: string;
  onRechercheChange: (valeur: string) => void;
  onEffacer: () => void;
  placeholder: string;
  /** Filtres additionnels, rendus à droite du champ de recherche. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-64 flex-1 max-w-md">
        {/* Icône décorative dans le champ : aria-hidden, le label porte le sens. */}
        <SearchIcon
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          // aria-label et non <label> visible : le placeholder décrit déjà
          // le champ à l'oeil, mais un placeholder n'est PAS un label pour
          // un lecteur d'écran (il disparaît à la saisie).
          aria-label={placeholder}
          placeholder={placeholder}
          value={recherche}
          onChange={(evenement) => onRechercheChange(evenement.target.value)}
          className="pl-9 pr-9"
        />
        {recherche !== "" && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Effacer la recherche"
            className="absolute right-1 top-1/2 -translate-y-1/2"
            onClick={onEffacer}
          >
            <XIcon aria-hidden />
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}
