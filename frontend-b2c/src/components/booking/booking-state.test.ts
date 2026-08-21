/**
 * Tests du réducteur du tunnel de prise de rendez-vous.
 *
 * Ce réducteur porte UN invariant : « changer un choix en amont invalide tout
 * l'aval ». Une régression ici ne provoque aucune erreur visible — elle laisse
 * simplement passer une combinaison incohérente (le créneau de la clinique A
 * avec le motif de la clinique B), que le backend refusera par un 409 obscur
 * en toute fin de parcours, après que le propriétaire a tout saisi.
 *
 * C'est exactement le type de bug qu'un test unitaire attrape et qu'une
 * relecture manque : chaque branche prise isolément a l'air correcte.
 */
import { describe, expect, it } from "vitest";

import {
  bookingReducer,
  initialBookingState,
  type BookingState,
} from "@/components/booking/booking-state";
import {
  buildAvailabilitySlot,
  buildPet,
  buildPublicAppointmentType,
  buildPublicClinic,
} from "@/test/fixtures";

/** Un tunnel entièrement rempli, à la dernière étape. */
function etatComplet(): BookingState {
  return {
    step: 5,
    clinic: buildPublicClinic(),
    appointmentType: buildPublicAppointmentType(),
    pet: buildPet(),
    reason: "Boite un peu depuis hier",
    slot: buildAvailabilitySlot(),
    submitted: false,
  };
}

describe("bookingReducer — SELECT_CLINIC", () => {
  it("efface le motif ET le créneau, puis avance à l'étape 2", () => {
    // Motifs et créneaux appartiennent à UNE clinique : les conserver
    // enverrait au backend l'identifiant d'un autre établissement.
    const etat = bookingReducer(etatComplet(), {
      type: "SELECT_CLINIC",
      clinic: buildPublicClinic({ id: "autre", name: "Clinique du Parc" }),
    });

    expect(etat.clinic?.name).toBe("Clinique du Parc");
    expect(etat.appointmentType).toBeNull();
    expect(etat.slot).toBeNull();
    expect(etat.step).toBe(2);
  });

  it("conserve l'animal et le commentaire", () => {
    // Ni l'un ni l'autre ne dépend de la clinique : les effacer obligerait
    // le propriétaire à tout ressaisir pour un simple changement d'avis.
    const etat = bookingReducer(etatComplet(), {
      type: "SELECT_CLINIC",
      clinic: buildPublicClinic({ id: "autre" }),
    });

    expect(etat.pet?.name).toBe("Rex");
    expect(etat.reason).toBe("Boite un peu depuis hier");
  });
});

describe("bookingReducer — SELECT_TYPE", () => {
  it("efface le créneau et avance à l'étape 3", () => {
    // Les créneaux proposés dépendent de la DURÉE du motif : un créneau de
    // 30 minutes n'est plus valable pour une consultation de 45.
    const etat = bookingReducer(etatComplet(), {
      type: "SELECT_TYPE",
      appointmentType: buildPublicAppointmentType({ duration_minutes: 45 }),
    });

    expect(etat.slot).toBeNull();
    expect(etat.step).toBe(3);
    // La clinique reste : on n'a pas changé d'établissement.
    expect(etat.clinic).not.toBeNull();
  });
});

describe("bookingReducer — SELECT_PET", () => {
  it("n'avance PAS d'étape", () => {
    // L'étape 3 sert à la fois au choix de l'animal et à la saisie du
    // commentaire : avancer au clic priverait l'utilisateur du champ libre.
    const avant: BookingState = { ...initialBookingState, step: 3 };
    const etat = bookingReducer(avant, { type: "SELECT_PET", pet: buildPet() });

    expect(etat.pet?.name).toBe("Rex");
    expect(etat.step).toBe(3);
  });

  it("n'invalide aucun choix en aval", () => {
    // L'animal n'entre pas dans le calcul des disponibilités.
    const etat = bookingReducer(etatComplet(), {
      type: "SELECT_PET",
      pet: buildPet({ id: "autre", name: "Minou", species: "cat" }),
    });

    expect(etat.slot).not.toBeNull();
    expect(etat.appointmentType).not.toBeNull();
  });
});

describe("bookingReducer — SET_REASON", () => {
  it("enregistre le commentaire sans rien déplacer", () => {
    const etat = bookingReducer(etatComplet(), {
      type: "SET_REASON",
      reason: "Vomissements",
    });

    expect(etat.reason).toBe("Vomissements");
    expect(etat.step).toBe(5);
  });
});

describe("bookingReducer — CONFIRM_PET", () => {
  it("ignore l'action tant qu'aucun animal n'est coché", () => {
    // Garde-fou en profondeur : le bouton est déjà désactivé côté interface,
    // mais l'état ne doit pas dépendre de la seule discipline de l'affichage.
    const avant: BookingState = { ...initialBookingState, step: 3, pet: null };
    const etat = bookingReducer(avant, { type: "CONFIRM_PET" });

    // Identité de référence : l'état n'a même pas été recopié.
    expect(etat).toBe(avant);
  });

  it("avance à l'étape 4 quand un animal est coché", () => {
    const avant: BookingState = {
      ...initialBookingState,
      step: 3,
      pet: buildPet(),
    };

    expect(bookingReducer(avant, { type: "CONFIRM_PET" }).step).toBe(4);
  });
});

describe("bookingReducer — SELECT_SLOT", () => {
  it("enregistre le créneau et avance à l'étape de confirmation", () => {
    const avant: BookingState = { ...initialBookingState, step: 4 };
    const etat = bookingReducer(avant, {
      type: "SELECT_SLOT",
      slot: buildAvailabilitySlot({ starts_at: "2026-08-21T08:00:00Z" }),
    });

    expect(etat.slot?.starts_at).toBe("2026-08-21T08:00:00Z");
    expect(etat.step).toBe(5);
  });
});

describe("bookingReducer — GO_TO_STEP", () => {
  it("autorise le retour en arrière sans rien détruire", () => {
    const etat = bookingReducer(etatComplet(), { type: "GO_TO_STEP", step: 2 });

    expect(etat.step).toBe(2);
    // Revenir n'invalide rien : c'est RE-CHOISIR (les actions SELECT_*) qui
    // invalide l'aval. Les choix restent affichés, présélectionnés.
    expect(etat.appointmentType).not.toBeNull();
    expect(etat.slot).not.toBeNull();
  });

  it("refuse tout saut vers l'avant, étape courante comprise", () => {
    // Avancer exige de passer par une action de sélection : sans quoi on
    // atteindrait l'étape 5 sans créneau choisi.
    const avant: BookingState = { ...initialBookingState, step: 2 };

    expect(bookingReducer(avant, { type: "GO_TO_STEP", step: 4 })).toBe(avant);
    expect(bookingReducer(avant, { type: "GO_TO_STEP", step: 2 })).toBe(avant);
  });
});

describe("bookingReducer — retours d'erreur du backend", () => {
  it("SLOT_CONFLICT retire le créneau et ramène au calendrier", () => {
    // 409 : quelqu'un a réservé le créneau pendant l'hésitation.
    const etat = bookingReducer(etatComplet(), { type: "SLOT_CONFLICT" });

    expect(etat.slot).toBeNull();
    expect(etat.step).toBe(4);
    // Le reste du parcours est conservé : rien à ressaisir.
    expect(etat.pet).not.toBeNull();
    expect(etat.appointmentType).not.toBeNull();
  });

  it("PET_INVALID DÉSÉLECTIONNE l'animal, en plus de revenir à l'étape 3", () => {
    // 404 : l'animal a été supprimé depuis un autre onglet. Un simple retour
    // le laisserait coché, et le bouton Continuer renverrait le même 404 en
    // boucle — c'est précisément ce que ce test verrouille.
    const etat = bookingReducer(etatComplet(), { type: "PET_INVALID" });

    expect(etat.pet).toBeNull();
    expect(etat.step).toBe(3);
  });

  it("SUBMITTED bascule sur l'écran de succès", () => {
    const etat = bookingReducer(etatComplet(), { type: "SUBMITTED" });

    expect(etat.submitted).toBe(true);
  });
});

describe("bookingReducer — immutabilité", () => {
  it("ne mute jamais l'état reçu", () => {
    // React ne re-rend que si la RÉFÉRENCE change : une mutation en place
    // produirait un écran figé, sans la moindre erreur en console.
    const avant = etatComplet();
    const copie = structuredClone(avant);

    bookingReducer(avant, { type: "SET_REASON", reason: "autre chose" });
    bookingReducer(avant, { type: "SLOT_CONFLICT" });
    bookingReducer(avant, { type: "PET_INVALID" });

    expect(avant).toEqual(copie);
  });
});
