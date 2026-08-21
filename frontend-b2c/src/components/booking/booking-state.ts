/**
 * Machine a etats du wizard de prise de rendez-vous (useReducer).
 *
 * POURQUOI un reducer plutot que des useState epars ou des searchParams :
 * les cinq etapes partagent un invariant central — "CHANGER UN CHOIX EN
 * AMONT INVALIDE TOUT L'AVAL". Re-choisir la clinique rend le motif et
 * le creneau caducs ; re-choisir le motif rend le creneau caduc (les
 * durees different). Un reducer concentre cette regle en UN endroit
 * teste par le compilateur, la ou des setState disperses laisseraient
 * des combinaisons incoherentes (un creneau de la clinique A avec le
 * motif de la clinique B). L'etat reste LOCAL (pas d'URL) : un parcours
 * de reservation abandonne n'a pas vocation a etre partageable ni a
 * survivre a un rechargement.
 *
 * On stocke les objets COMPLETS (PublicClinicResponse, slot...) et pas
 * seulement des ids : l'ecran de confirmation re-affiche noms, villes et
 * durees sans re-interroger l'API.
 */
import type {
  AvailabilitySlotResponse,
  PetResponse,
  PublicAppointmentTypeResponse,
  PublicClinicResponse,
} from "@/lib/api/generated/vetoLibAPI.schemas";

// Les cinq etapes : 1 Clinique, 2 Motif, 3 Animal, 4 Creneau,
// 5 Confirmation. Union de litteraux plutot que number : impossible de
// dispatcher GO_TO_STEP 7 sans erreur de compilation.
export type BookingStep = 1 | 2 | 3 | 4 | 5;

export interface BookingState {
  step: BookingStep;
  clinic: PublicClinicResponse | null;
  appointmentType: PublicAppointmentTypeResponse | null;
  pet: PetResponse | null;
  /** Commentaire libre optionnel ("" = aucun). */
  reason: string;
  slot: AvailabilitySlotResponse | null;
  /** true apres le 201 : le wizard affiche l'ecran de succes. */
  submitted: boolean;
}

export const initialBookingState: BookingState = {
  step: 1,
  clinic: null,
  appointmentType: null,
  pet: null,
  reason: "",
  slot: null,
  submitted: false,
};

export type BookingAction =
  /** Etape 1 : choisir la clinique (reset motif + creneau, avance en 2). */
  | { type: "SELECT_CLINIC"; clinic: PublicClinicResponse }
  /** Etape 2 : choisir le motif (reset creneau, avance en 3). */
  | { type: "SELECT_TYPE"; appointmentType: PublicAppointmentTypeResponse }
  /** Etape 3 : cocher un animal (n'avance PAS : on peut encore saisir le motif). */
  | { type: "SELECT_PET"; pet: PetResponse }
  /**
   * Pre-selection AUTOMATIQUE de l'animal, depuis ?animal=<id> dans
   * l'URL (arrivee depuis une fiche animal ou un rendez-vous passe).
   *
   * Distincte de SELECT_PET, qui traduit un CHOIX de l'utilisateur :
   * celle-ci est idempotente et ne s'applique QUE si rien n'a encore ete
   * choisi. Sans cette garde, un refetch d'arriere-plan de la liste des
   * animaux re-cocherait celui de l'URL par-dessus celui que
   * l'utilisateur vient de selectionner -- un bug classique et
   * particulierement deroutant.
   */
  | { type: "PRESELECT_PET"; pet: PetResponse }
  /** Etape 3 : saisie du commentaire libre. */
  | { type: "SET_REASON"; reason: string }
  /** Etape 3 : bouton Continuer (avance en 4, exige un animal coche). */
  | { type: "CONFIRM_PET" }
  /** Etape 4 : choisir un creneau (avance en 5). */
  | { type: "SELECT_SLOT"; slot: AvailabilitySlotResponse }
  /** Navigation ARRIERE uniquement (pastilles passees, bouton Retour). */
  | { type: "GO_TO_STEP"; step: BookingStep }
  /** 409 du backend : le creneau est tombe, retour etape 4 sans creneau. */
  | { type: "SLOT_CONFLICT" }
  /** 404 du backend : l'animal n'existe plus, retour etape 3 sans animal. */
  | { type: "PET_INVALID" }
  /** 201 du backend : bascule sur l'ecran de succes. */
  | { type: "SUBMITTED" };

/**
 * Le reducer. Chaque branche retourne un NOUVEL objet (immutabilite :
 * React ne re-rend que si la reference change) et applique l'invariant
 * "changer en amont invalide l'aval" en remettant a null les choix
 * dependants.
 */
export function bookingReducer(
  state: BookingState,
  action: BookingAction,
): BookingState {
  switch (action.type) {
    case "SELECT_CLINIC":
      // Nouvelle clinique : ses motifs et ses creneaux n'ont rien a voir
      // avec ceux de la precedente -> on les efface. L'animal et le
      // commentaire, eux, ne dependent pas de la clinique : conserves.
      return {
        ...state,
        clinic: action.clinic,
        appointmentType: null,
        slot: null,
        step: 2,
      };

    case "SELECT_TYPE":
      // Nouveau motif : les creneaux dependent de sa duree -> effaces.
      return { ...state, appointmentType: action.appointmentType, slot: null, step: 3 };

    case "SELECT_PET":
      // L'animal n'influence pas les disponibilites : rien d'autre a
      // invalider, et on reste sur l'etape (le commentaire se saisit
      // apres le choix de l'animal).
      return { ...state, pet: action.pet };

    case "PRESELECT_PET":
      // Ne remplace JAMAIS un choix deja fait, et n'avance pas d'etape :
      // la clinique et le motif restent a choisir. Sauter des etapes
      // casserait la chaine d'invalidation et laisserait l'utilisateur
      // sur un ecran dont il ignore le contexte.
      if (state.pet !== null) {
        return state;
      }
      return { ...state, pet: action.pet };

    case "SET_REASON":
      return { ...state, reason: action.reason };

    case "CONFIRM_PET":
      // Garde-fou : sans animal coche, l'action est ignoree (le bouton
      // Continuer est de toute facon desactive cote UI).
      if (state.pet === null) {
        return state;
      }
      return { ...state, step: 4 };

    case "SELECT_SLOT":
      return { ...state, slot: action.slot, step: 5 };

    case "GO_TO_STEP":
      // ARRIERE seulement : revenir ne detruit aucun choix (ils restent
      // affiches pre-selectionnes), c'est re-CHOISIR qui invalide l'aval
      // via les actions SELECT_*. Une cible >= etape courante est
      // ignoree : avancer exige de passer par les actions de selection.
      if (action.step >= state.step) {
        return state;
      }
      return { ...state, step: action.step };

    case "SLOT_CONFLICT":
      // Le creneau choisi a ete pris entre-temps (course perdue) ou
      // n'est plus propose : on le retire et on ramene l'utilisateur au
      // calendrier pour en choisir un autre.
      return { ...state, slot: null, step: 4 };

    case "PET_INVALID":
      // L'animal a ete supprime entre-temps (autre onglet) : on le
      // DESELECTIONNE en plus de revenir a l'etape 3 — un simple
      // GO_TO_STEP le laisserait coche et le bouton Continuer
      // renverrait le meme 404 en boucle.
      return { ...state, pet: null, step: 3 };

    case "SUBMITTED":
      return { ...state, submitted: true };
  }
}
