/**
 * Vocabulaire et calculs d'affichage de la fiche animal enrichie.
 *
 * Le backend expose des codes (sex) et une date de naissance brute ; les
 * écrans veulent des libellés français et un âge. Centraliser ici évite
 * que la liste, la fiche et le tableau de bord ne divergent — même rôle
 * que lib/pets/species.ts pour les espèces.
 *
 * REGLE DE FUSEAU du portail : le front FORMATE, il ne calcule jamais
 * d'instant. L'âge fait exception, mais il se calcule sur des JOURS
 * CALENDAIRES ("YYYY-MM-DD") et jamais sur des objets Date soustraits
 * entre eux -- une soustraction de Date mélangerait les fuseaux et
 * décalerait l'anniversaire d'un jour selon l'heure de consultation.
 */
import type { PetResponse, Sex } from "@/lib/api/generated/vetoLibAPI.schemas";
import { toParisDateKey } from "@/lib/date/format";
import { SPECIES } from "@/lib/pets/species";

/**
 * Libellés des sexes. Record<Sex, string> : si le backend ajoute un
 * membre, TypeScript exigera son entrée ici avant de compiler.
 *
 * "Non précisé" et non "Inconnu" : c'est une information que le
 * propriétaire n'a pas encore donnée, pas un mystère sur son animal.
 */
export const SEX_LABELS: Record<Sex, string> = {
  male: "Mâle",
  female: "Femelle",
  unknown: "Non précisé",
};

/** Ordre d'affichage dans les formulaires (radio). */
export const SEX_ORDER: readonly Sex[] = ["male", "female", "unknown"];

/** Libellé français d'une stérilisation, tri-état compris. */
export function formatSterilized(sterilized: boolean | null): string | null {
  if (sterilized === null) return null;
  return sterilized ? "Stérilisé" : "Non stérilisé";
}

/** Composantes année/mois/jour d'une date "YYYY-MM-DD". */
function composantes(cle: string): [number, number, number] | null {
  const parts = cle.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0], parts[1], parts[2]];
}

/**
 * L'âge d'un animal, formulé comme on le dirait.
 *
 * Sous deux mois on compte en semaines, sous un an en mois, au-delà en
 * années : un chiot n'a pas "0 an", et dire "86 mois" d'un chien de sept
 * ans serait illisible. Retourne null si la date manque ou est aberrante.
 *
 * `today` est injecté (jamais de new Date() caché) : la fonction reste
 * pure et testable, et deux appels d'un même rendu donnent le même âge.
 */
export function formatAge(
  birthDate: string | null,
  today: Date,
): string | null {
  if (birthDate === null) return null;
  const naissance = composantes(birthDate);
  const aujourdhui = composantes(toParisDateKey(today.toISOString()));
  if (naissance === null || aujourdhui === null) return null;

  const [an, mois, jour] = naissance;
  const [anJ, moisJ, jourJ] = aujourdhui;

  let annees = anJ - an;
  let moisEcoules = moisJ - mois;
  // L'anniversaire du mois n'est pas encore passé : on retire un mois.
  if (jourJ < jour) moisEcoules -= 1;
  if (moisEcoules < 0) {
    annees -= 1;
    moisEcoules += 12;
  }

  // Date future ou saisie aberrante : mieux vaut ne rien dire qu'annoncer
  // un âge négatif. Le backend refuse déjà ces dates, mais une donnée
  // ancienne pourrait traîner.
  if (annees < 0) return null;

  if (annees >= 1) return annees === 1 ? "1 an" : `${annees} ans`;
  if (moisEcoules >= 2) return `${moisEcoules} mois`;

  // Moins de deux mois : la semaine est la seule unité parlante pour un
  // chiot ou un chaton.
  const jours = Math.round(
    (Date.UTC(anJ, moisJ - 1, jourJ) - Date.UTC(an, mois - 1, jour)) /
      86_400_000,
  );
  const semaines = Math.floor(jours / 7);
  if (semaines >= 1)
    return semaines === 1 ? "1 semaine" : `${semaines} semaines`;
  return jours <= 1 ? "1 jour" : `${jours} jours`;
}

/**
 * Le sous-titre d'un animal : "Chien · Berger australien · 5 ans".
 *
 * Les segments absents DISPARAISSENT, jamais de " ·  · " : une fiche peu
 * remplie doit rester propre, pas afficher ses trous.
 */
export function formatPetSubtitle(pet: PetResponse, today: Date): string {
  return [
    SPECIES[pet.species].label,
    pet.breed,
    formatAge(pet.birth_date, today),
  ]
    .filter((part): part is string => part !== null && part !== "")
    .join(" · ");
}
