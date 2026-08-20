/**
 * Utilitaires partagés du frontend. Pour l'instant : cn(), l'assembleur de
 * classes Tailwind utilisé par tous les composants shadcn (voir
 * src/components/ui/button.tsx).
 */
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combine des classes CSS conditionnelles puis résout les conflits Tailwind.
 *
 * - clsx : accepte chaînes, tableaux, objets { classe: booléen } et ignore
 *   les valeurs falsy -> pratique pour les classes conditionnelles.
 * - twMerge : quand deux classes Tailwind ciblent la même propriété
 *   (ex : "px-3 px-4"), garde la DERNIERE au lieu de laisser le CSS
 *   trancher par ordre de la feuille de style. C'est ce qui permet à un
 *   appelant d'écraser les classes par défaut d'un composant via className.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
