/**
 * Couleur stable par praticien pour la grille agenda.
 *
 * Le modèle de données n'attribue pas de couleur aux praticiens : on la
 * DÉRIVE de leur id par hachage, pour qu'un praticien garde la même
 * teinte d'une session à l'autre et d'un écran à l'autre (grille,
 * répartition du tableau de bord), sans rien stocker.
 *
 * CONTRAINTE TAILWIND : les classes doivent être des LITTÉRAUX présents
 * dans le source — Tailwind v4 scanne les fichiers, une classe
 * construite (`bg-chart-${i}`) ne serait jamais compilée. D'où ce
 * lookup statique sur les 5 tokens --chart-* de globals.css.
 */

export type ResourceColorClasses = {
  /** Fond translucide du bloc de rendez-vous. */
  surface: string;
  /** Barre/bordure d'accent du bloc. */
  border: string;
  /** Pastille pleine (légende, en-têtes de colonnes, barres du dashboard). */
  dot: string;
};

const RESOURCE_COLOR_CLASSES: readonly ResourceColorClasses[] = [
  {
    surface: "bg-chart-1/15 hover:bg-chart-1/25",
    border: "border-chart-1",
    dot: "bg-chart-1",
  },
  {
    surface: "bg-chart-2/15 hover:bg-chart-2/25",
    border: "border-chart-2",
    dot: "bg-chart-2",
  },
  {
    surface: "bg-chart-3/15 hover:bg-chart-3/25",
    border: "border-chart-3",
    dot: "bg-chart-3",
  },
  {
    surface: "bg-chart-4/15 hover:bg-chart-4/25",
    border: "border-chart-4",
    dot: "bg-chart-4",
  },
  {
    surface: "bg-chart-5/15 hover:bg-chart-5/25",
    border: "border-chart-5",
    dot: "bg-chart-5",
  },
];

/**
 * Classes de couleur d'un praticien, dérivées de son id.
 *
 * Hachage volontairement simple (somme des codes de caractères) : il ne
 * s'agit pas de cryptographie mais d'une répartition stable sur 5
 * couleurs. Deux praticiens peuvent partager une teinte (5 couleurs
 * seulement) : acceptable en phase 1, le nom reste le discriminant.
 */
export function resourceColorClasses(resourceId: string): ResourceColorClasses {
  let hash = 0;
  for (let i = 0; i < resourceId.length; i += 1) {
    hash = (hash + resourceId.charCodeAt(i)) % RESOURCE_COLOR_CLASSES.length;
  }
  return RESOURCE_COLOR_CLASSES[hash];
}
