/**
 * Fonctions PURES de présentation des datatables.
 *
 * Elles sont isolées ici parce qu'elles sont la partie la plus facile à
 * casser et la moins visible à l'oeil : une erreur de décalage de un dans
 * `calculerPlage` produit un « 21–40 sur 137 » plausible mais faux, que
 * personne ne remarque. Isolées et pures, elles se testent exhaustivement
 * pour trois fois rien.
 */

/** Nombre de pages, jamais zéro : une liste vide reste « page 1 sur 1 ». */
export function nombreDePages(total: number, taille: number): number {
  if (taille <= 0) return 1;
  return Math.max(1, Math.ceil(total / taille));
}

/**
 * Bornes 1-indexées de la tranche affichée, pour le compteur « x–y sur N ».
 *
 * Renvoie `null` quand il n'y a rien à afficher : l'appelant montre alors un
 * libellé dédié plutôt qu'un « 0–0 sur 0 » qui n'apprend rien.
 */
export function calculerPlage(
  total: number,
  offset: number,
  affichees: number,
): { debut: number; fin: number } | null {
  if (total === 0 || affichees === 0) return null;
  const debut = offset + 1;
  // min avec `total` : sur la dernière page, `offset + affichees` peut
  // dépasser le total si le serveur a renvoyé moins de lignes que demandé.
  return { debut, fin: Math.min(offset + affichees, total) };
}

// Instance mémoïsée au niveau du module : construire un Intl.NumberFormat
// coûte, et le faire à chaque rendu d'un tableau serait du gaspillage pur.
const SEPARATEUR_DE_MILLIERS = new Intl.NumberFormat("fr-FR");

/**
 * Libellé du compteur de pagination.
 *
 * Tiret demi-cadratin (–) et non trait d'union : c'est le signe typographique
 * des intervalles en français. Espaces insécables autour, pour que « sur 1 »
 * ne se retrouve jamais seul sur une ligne.
 */
export function libellePlage(
  total: number,
  offset: number,
  affichees: number,
): string {
  const plage = calculerPlage(total, offset, affichees);
  if (plage === null) return "Aucun résultat";
  const debut = SEPARATEUR_DE_MILLIERS.format(plage.debut);
  const fin = SEPARATEUR_DE_MILLIERS.format(plage.fin);
  return `${debut}–${fin} sur ${SEPARATEUR_DE_MILLIERS.format(total)}`;
}

/**
 * Valeur de `aria-sort` pour l'en-tête d'une colonne.
 *
 * Seule la colonne effectivement triée porte `ascending` ou `descending` ;
 * une colonne triable mais non triée porte `none`, et une colonne non
 * triable ne porte rien du tout. Sans cet attribut, un lecteur d'écran
 * annonce « bouton » sans dire dans quel sens le tableau est trié — le
 * `data-*` du preset shadcn, lui, est purement visuel.
 */
export function ariaSortPourColonne(
  triable: boolean,
  triee: boolean,
  sens: "asc" | "desc",
): "ascending" | "descending" | "none" | undefined {
  if (!triable) return undefined;
  if (!triee) return "none";
  return sens === "asc" ? "ascending" : "descending";
}
