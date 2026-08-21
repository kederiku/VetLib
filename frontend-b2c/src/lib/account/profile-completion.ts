/**
 * Complétude de la fiche propriétaire.
 *
 * L'inscription en trois étapes laisse volontairement passer l'adresse
 * et le téléphone (étape 2 facultative) : un compte parfaitement
 * utilisable peut donc rester incomplet indéfiniment. Ce module dit ce
 * qui manque, pour que le tableau de bord le rappelle une fois — et
 * cesse de le rappeler dès que c'est rempli.
 *
 * Un bloc d'invite qui DISPARAIT quand la tâche est faite ne peut pas
 * devenir du décor ignoré ; un bandeau permanent, si.
 */
import type { OwnerResponse } from "@/lib/api/generated/vetoLibAPI.schemas";

export type ChampManquant = "phone" | "address";

/**
 * Les champs facultatifs encore vides, dans l'ordre où on les cite.
 *
 * Le téléphone est cité en premier : c'est celui qui a une conséquence
 * concrète (la clinique ne peut pas joindre en cas d'imprévu), alors que
 * l'adresse ne sert qu'au dossier.
 */
export function missingProfileFields(
  owner: OwnerResponse | undefined,
): ChampManquant[] {
  if (owner === undefined) return [];
  const manquants: ChampManquant[] = [];
  // Une chaîne vide vaut absence : le backend accepte null, mais un
  // formulaire mal rempli peut avoir enregistré "".
  if (owner.phone === null || owner.phone.trim() === "") manquants.push("phone");
  if (owner.address === null) manquants.push("address");
  return manquants;
}

/** La phrase qui explique ce qui manque, et pourquoi cela compte. */
export function missingProfileDescription(manquants: ChampManquant[]): string {
  const aPhone = manquants.includes("phone");
  const aAddress = manquants.includes("address");
  if (aPhone && aAddress) {
    return "Il manque votre téléphone et votre adresse : la clinique ne peut ni vous joindre en cas d'imprévu, ni constituer votre dossier.";
  }
  if (aPhone) {
    return "Sans numéro de téléphone, la clinique ne peut pas vous joindre en cas d'imprévu sur un rendez-vous.";
  }
  return "Votre adresse aide la clinique à constituer votre dossier.";
}

/** Libellé court de chaque champ, pour les pastilles de rappel. */
export const CHAMP_LABELS: Record<ChampManquant, string> = {
  phone: "Téléphone",
  address: "Adresse",
};
