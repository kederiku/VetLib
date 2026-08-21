/**
 * Tests des dérivations sur la liste des rendez-vous.
 *
 * C'est le module le plus rentable à tester du portail : toutes les vues
 * (tableau de bord, onglets à venir / passés, historique d'un animal,
 * filtres) en descendent, il est déterministe, et une régression y
 * serait invisible à l'oeil — une liste mal triée reste une liste.
 *
 * Rappel de fuseau : le backend renvoie de l'ISO UTC et l'affichage se
 * fait en heure de Paris. En août, Paris est à UTC+2.
 */
import { describe, expect, it } from "vitest";

import {
  distinctClinics,
  filterAppointments,
  forPet,
  groupByMonth,
  lastVisit,
  nextAppointment,
  nextForPet,
  SANS_ANIMAL,
  splitByTime,
} from "@/lib/appointments/derive";
import { buildOwnerAppointment } from "@/test/fixtures";

const MAINTENANT = new Date("2026-08-20T10:00:00Z");

const passe1 = buildOwnerAppointment({
  id: "p1",
  starts_at: "2026-07-10T08:00:00Z",
});
const passe2 = buildOwnerAppointment({
  id: "p2",
  starts_at: "2026-08-01T08:00:00Z",
});
const futur1 = buildOwnerAppointment({
  id: "f1",
  starts_at: "2026-08-25T08:00:00Z",
});
const futur2 = buildOwnerAppointment({
  id: "f2",
  starts_at: "2026-09-15T08:00:00Z",
});

describe("splitByTime", () => {
  it("sépare le futur du passé, et trie chacun dans son sens de lecture", () => {
    // À venir : le prochain d'abord (on lit vers l'avant).
    // Passés : le plus récent d'abord (on lit vers l'arrière).
    const { upcoming, past } = splitByTime(
      [futur2, passe1, futur1, passe2],
      MAINTENANT,
    );

    expect(upcoming.map((a) => a.id)).toEqual(["f1", "f2"]);
    expect(past.map((a) => a.id)).toEqual(["p2", "p1"]);
  });

  it("classe un rendez-vous ANNULÉ mais futur dans « à venir »", () => {
    // Le partage se fait sur l'heure, pas sur le statut : le
    // propriétaire doit voir que son créneau de jeudi est tombé.
    const annule = buildOwnerAppointment({
      id: "a1",
      starts_at: "2026-08-25T08:00:00Z",
      status: "cancelled",
    });

    const { upcoming, past } = splitByTime([annule], MAINTENANT);

    expect(upcoming.map((a) => a.id)).toEqual(["a1"]);
    expect(past).toHaveLength(0);
  });

  it("range un rendez-vous en cours dans le passé", () => {
    // starts_at <= maintenant : il a commencé, il n'est plus « à venir ».
    const enCours = buildOwnerAppointment({
      id: "c1",
      starts_at: "2026-08-20T09:30:00Z",
      ends_at: "2026-08-20T10:30:00Z",
    });

    expect(splitByTime([enCours], MAINTENANT).past.map((a) => a.id)).toEqual([
      "c1",
    ]);
  });

  it("supporte une liste vide", () => {
    expect(splitByTime([], MAINTENANT)).toEqual({ upcoming: [], past: [] });
  });
});

describe("nextAppointment", () => {
  it("retient le plus proche dans le futur", () => {
    expect(nextAppointment([futur2, passe1, futur1], MAINTENANT)?.id).toBe("f1");
  });

  it("renvoie null quand plus rien n'est à venir", () => {
    expect(nextAppointment([passe1, passe2], MAINTENANT)).toBeNull();
  });
});

describe("forPet, nextForPet et lastVisit", () => {
  const rexPasse = buildOwnerAppointment({
    id: "rp",
    pet_id: "rex",
    starts_at: "2026-08-05T08:00:00Z",
  });
  const rexFutur = buildOwnerAppointment({
    id: "rf",
    pet_id: "rex",
    starts_at: "2026-08-28T08:00:00Z",
  });
  const mistigri = buildOwnerAppointment({
    id: "m1",
    pet_id: "mistigri",
    starts_at: "2026-08-26T08:00:00Z",
  });
  const tous = [rexPasse, rexFutur, mistigri];

  it("ne retient que les rendez-vous de l'animal demandé", () => {
    expect(forPet(tous, "rex").map((a) => a.id)).toEqual(["rp", "rf"]);
  });

  it("donne le prochain rendez-vous de CET animal", () => {
    expect(nextForPet(tous, "rex", MAINTENANT)?.id).toBe("rf");
    expect(nextForPet(tous, "mistigri", MAINTENANT)?.id).toBe("m1");
  });

  it("donne la dernière visite de CET animal", () => {
    expect(lastVisit(tous, "rex", MAINTENANT)?.id).toBe("rp");
    // Mistigri n'a qu'un rendez-vous, et il est à venir.
    expect(lastVisit(tous, "mistigri", MAINTENANT)).toBeNull();
  });
});

describe("filterAppointments", () => {
  const avecAnimal = buildOwnerAppointment({ id: "a", pet_id: "rex" });
  const sansAnimal = buildOwnerAppointment({ id: "b", pet_id: null });
  const autreClinique = buildOwnerAppointment({
    id: "c",
    pet_id: "rex",
    clinic_id: "clinique-2",
  });
  const tous = [avecAnimal, sansAnimal, autreClinique];

  it("ne filtre rien sans critère", () => {
    expect(filterAppointments(tous)).toHaveLength(3);
    expect(filterAppointments(tous, { petId: null, clinicId: null })).toHaveLength(3);
  });

  it("filtre par animal", () => {
    expect(filterAppointments(tous, { petId: "rex" }).map((a) => a.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("sait isoler les rendez-vous SANS fiche animal", () => {
    // Cas des rendez-vous créés par la clinique : un UUID ne pourrait
    // pas exprimer « aucun », et null signifie déjà « tous ».
    expect(
      filterAppointments(tous, { petId: SANS_ANIMAL }).map((a) => a.id),
    ).toEqual(["b"]);
  });

  it("combine les deux critères", () => {
    expect(
      filterAppointments(tous, {
        petId: "rex",
        clinicId: "clinique-2",
      }).map((a) => a.id),
    ).toEqual(["c"]);
  });
});

describe("distinctClinics", () => {
  it("liste les cliniques présentes, sans doublon et triées par nom", () => {
    // Dérivées des rendez-vous eux-mêmes : clinic_name est dénormalisé
    // par le backend, aucune requête à l'annuaire n'est nécessaire.
    const liste = distinctClinics([
      buildOwnerAppointment({ clinic_id: "2", clinic_name: "Zoo Vet" }),
      buildOwnerAppointment({ clinic_id: "1", clinic_name: "Ambroise" }),
      buildOwnerAppointment({ clinic_id: "2", clinic_name: "Zoo Vet" }),
    ]);

    expect(liste).toEqual([
      { id: "1", name: "Ambroise" },
      { id: "2", name: "Zoo Vet" },
    ]);
  });
});

describe("groupByMonth", () => {
  it("regroupe par mois calendaire en conservant l'ordre reçu", () => {
    const groupes = groupByMonth([
      buildOwnerAppointment({ id: "1", starts_at: "2026-08-20T08:00:00Z" }),
      buildOwnerAppointment({ id: "2", starts_at: "2026-08-02T08:00:00Z" }),
      buildOwnerAppointment({ id: "3", starts_at: "2026-07-30T08:00:00Z" }),
    ]);

    expect(groupes.map((g) => g.key)).toEqual(["2026-08", "2026-07"]);
    expect(groupes[0].appointments.map((a) => a.id)).toEqual(["1", "2"]);
    expect(groupes[1].appointments.map((a) => a.id)).toEqual(["3"]);
  });

  it("groupe sur le mois de PARIS et non sur celui d'UTC", () => {
    // Le 1er septembre à 00h30 heure de Paris, c'est le 31 août 22h30
    // en UTC : lu en UTC, ce rendez-vous atterrirait en août.
    const groupes = groupByMonth([
      buildOwnerAppointment({ id: "1", starts_at: "2026-08-31T22:30:00Z" }),
    ]);

    expect(groupes[0].key).toBe("2026-09");
  });
});
