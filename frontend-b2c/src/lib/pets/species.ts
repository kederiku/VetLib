/**
 * Vocabulaire d'affichage des especes d'animaux, cote proprietaire.
 *
 * Le backend expose quatre especes volontairement grossieres (elles
 * servent au tri des agendas, pas a la medecine) : dog, cat, nac, other.
 * Ce module associe a chaque code son libelle francais et son icone
 * lucide, pour que la fiche animal, le formulaire et le wizard de prise
 * de rendez-vous partagent exactement la meme representation.
 */
import { Cat, Dog, PawPrint, Rabbit } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Species } from "@/lib/api/generated/vetoLibAPI.schemas";

/**
 * Record<Species, ...> : si le backend ajoute une espece, TypeScript
 * exigera son entree ici (libelle + icone) avant de compiler.
 * NAC = nouveaux animaux de compagnie (lapins, furets, reptiles...),
 * d'ou l'icone lapin ; "other" retombe sur la patte generique.
 */
export const SPECIES: Record<Species, { label: string; icon: LucideIcon }> = {
  dog: { label: "Chien", icon: Dog },
  cat: { label: "Chat", icon: Cat },
  nac: { label: "NAC", icon: Rabbit },
  other: { label: "Autre", icon: PawPrint },
};

/**
 * Ordre d'affichage des especes dans les formulaires (radio) : du plus
 * courant au plus rare. Object.keys(SPECIES) donnerait le meme ordre
 * aujourd'hui, mais le figer ici rend l'intention explicite et
 * independante de l'ordre d'ecriture du Record.
 */
export const SPECIES_ORDER: readonly Species[] = [
  "dog",
  "cat",
  "nac",
  "other",
];
