/**
 * Filtre déroulant d'une datatable (statut, rôle...).
 *
 * Trois écrans ont besoin exactement du même objet : un `Select` dont la
 * valeur vit dans l'URL, avec une option « tous » qui correspond à
 * l'ABSENCE de paramètre. Le mutualiser évite surtout de réécrire trois fois
 * les deux pièges de la primitive Base UI :
 *
 * - `onValueChange` est typé `unknown`, d'où le garde `typeof === "string"` ;
 * - `SelectValue` affiche la VALEUR brute (« inactive ») tant qu'on n'a pas
 *   donné au Root la table `items` [{value, label}] : sans elle, le filtre
 *   afficherait le jargon de l'API au lieu du libellé français.
 */
"use client";

import { useMemo } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type OptionDeFiltre = { valeur: string; libelle: string };

export function DataTableFilterSelect({
  id,
  label,
  valeur,
  options,
  onChange,
  className = "w-44",
}: {
  id: string;
  /** Libellé accessible ; masqué à l'oeil, l'option courante suffit à lire le filtre. */
  label: string;
  valeur: string;
  options: readonly OptionDeFiltre[];
  onChange: (valeur: string) => void;
  className?: string;
}) {
  // La primitive attend {value, label} ; nos options sont en français.
  const items = useMemo(
    () =>
      options.map((option) => ({
        value: option.valeur,
        label: option.libelle,
      })),
    [options],
  );

  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Select
        items={items}
        value={valeur}
        onValueChange={(nouvelle) => {
          if (typeof nouvelle === "string") onChange(nouvelle);
        }}
      >
        <SelectTrigger id={id} className={className}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.valeur} value={option.valeur}>
              {option.libelle}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
