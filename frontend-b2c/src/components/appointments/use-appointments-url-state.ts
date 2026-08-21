/**
 * État de l'écran « Mes rendez-vous » porté par l'URL.
 *
 * /rendez-vous?vue=passes&animal=<uuid>&clinique=<uuid> : l'onglet et les
 * deux filtres vivent dans les query params, plus dans des useState.
 * Bénéfices concrets : F5 ne ramène plus sur « À venir », le bouton
 * Précédent du navigateur fonctionne, et surtout la fiche d'un animal
 * peut pointer « Voir tout son historique » vers un écran déjà filtré.
 *
 * Parsing DEFENSIF : l'URL est une entrée utilisateur, modifiable à la
 * main. Toute valeur invalide retombe sur le défaut au lieu de casser
 * l'écran. Les valeurs par défaut sont OMISES de l'URL, pour que
 * /rendez-vous tout court reste l'adresse de l'écran au repos.
 */
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SANS_ANIMAL } from "@/lib/appointments/derive";

/** Les deux onglets de l'écran. */
export type VueRendezVous = "a-venir" | "passes";

/**
 * Valeur sentinelle « aucun filtre ». Absente de l'URL, elle n'existe
 * que dans le composant Select, qui a besoin d'une valeur pour son
 * entrée « Tous les animaux » (null n'est pas une option sélectionnable).
 */
export const TOUS = "all";

// UUID : les identifiants d'animal et de clinique n'ont pas d'autre
// forme. Une valeur bricolee dans l'URL ne doit pas devenir un filtre.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseVue(param: string | null): VueRendezVous {
  return param === "passes" ? "passes" : "a-venir";
}

/**
 * Un identifiant d'entité, la sentinelle « sans animal », ou TOUS.
 *
 * SANS_ANIMAL est accepté tel quel : ce n'est pas un UUID mais une
 * valeur métier légitime (les rendez-vous créés par la clinique sans
 * fiche patient rattachée).
 */
function parseFiltre(param: string | null, avecSansAnimal: boolean): string {
  if (param === null) return TOUS;
  if (avecSansAnimal && param === SANS_ANIMAL) return SANS_ANIMAL;
  return UUID_PATTERN.test(param) ? param : TOUS;
}

export type AppointmentsUrlState = {
  vue: VueRendezVous;
  /** TOUS, SANS_ANIMAL, ou un identifiant d'animal. */
  animal: string;
  /** TOUS ou un identifiant de clinique. */
  clinique: string;
  setVue: (vue: VueRendezVous) => void;
  setAnimal: (animal: string) => void;
  setClinique: (clinique: string) => void;
  /** Vrai dès qu'un filtre est actif (l'onglet n'en est pas un). */
  filtreActif: boolean;
  reinitialiserFiltres: () => void;
};

export function useAppointmentsUrlState(): AppointmentsUrlState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const vue = parseVue(searchParams.get("vue"));
  const animal = parseFiltre(searchParams.get("animal"), true);
  const clinique = parseFiltre(searchParams.get("clinique"), false);

  /**
   * Réécrit l'URL avec les valeurs demandées, en OMETTANT les défauts.
   *
   * replace et non push : ajuster un filtre n'est pas une étape de
   * navigation, l'empiler dans l'historique obligerait à cliquer dix
   * fois « Précédent » pour revenir à l'écran d'où l'on vient.
   * scroll: false : changer d'onglet ne doit pas renvoyer en haut de
   * page quand on parcourt un long historique.
   */
  const ecrire = (
    valeurs: Partial<{ vue: VueRendezVous; animal: string; clinique: string }>,
  ) => {
    const suivant = { vue, animal, clinique, ...valeurs };
    const params = new URLSearchParams();
    if (suivant.vue !== "a-venir") params.set("vue", suivant.vue);
    if (suivant.animal !== TOUS) params.set("animal", suivant.animal);
    if (suivant.clinique !== TOUS) params.set("clinique", suivant.clinique);
    const requete = params.toString();
    router.replace(requete === "" ? pathname : `${pathname}?${requete}`, {
      scroll: false,
    });
  };

  return {
    vue,
    animal,
    clinique,
    setVue: (valeur) => ecrire({ vue: valeur }),
    setAnimal: (valeur) => ecrire({ animal: valeur }),
    setClinique: (valeur) => ecrire({ clinique: valeur }),
    filtreActif: animal !== TOUS || clinique !== TOUS,
    reinitialiserFiltres: () => ecrire({ animal: TOUS, clinique: TOUS }),
  };
}
