/**
 * Liste de définitions d'une fiche : libellé à gauche, valeur à droite.
 *
 * Un vrai `<dl>`, et pas une grille de `<div>` : c'est l'élément que la
 * norme prévoit pour des couples clé/valeur, et les lecteurs d'écran
 * annoncent alors « email, contact@… » au lieu de deux textes sans lien.
 *
 * Une valeur absente s'affiche en tiret plutôt qu'en vide : une case vide se
 * lit comme un défaut d'affichage, un tiret comme « non renseigné ».
 */
import type { ReactNode } from "react";

export type Definition = { libelle: string; valeur: ReactNode };

export function DefinitionList({ entrees }: { entrees: Definition[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {entrees.map((entree) => (
        <div key={entree.libelle} className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium text-muted-foreground">
            {entree.libelle}
          </dt>
          <dd className="text-sm">{entree.valeur ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
