/**
 * Utilitaires partagés du frontend. Fichier standard du preset shadcn/ui.
 */
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Compose des classes Tailwind conditionnelles SANS conflit.
 *
 * Deux étapes :
 * 1. clsx aplatit tous les formats d'entrée (chaînes, tableaux, objets
 *    { "classe": condition }) en une seule chaîne ;
 * 2. twMerge résout les conflits Tailwind en gardant la DERNIÈRE classe :
 *    cn("px-3", "px-5") -> "px-5". Sans lui, les deux classes resteraient
 *    et le résultat dépendrait de l'ordre du CSS généré, pas de l'appel.
 *
 * C'est ce qui permet aux composants shadcn (ex : Button) d'accepter une
 * prop className qui surcharge proprement leurs styles par défaut.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
