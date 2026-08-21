/**
 * Tests des schémas de validation de la planification.
 *
 * Le plus important est `weeklyScheduleSchema` : il encode la semaine type
 * d'un praticien, c'est-à-dire ce qui détermine les créneaux proposés aux
 * propriétaires. Deux règles y sont subtiles et invisibles à la relecture :
 * les jours FERMÉS ne sont pas validés (ils conservent leurs horaires en
 * mémoire), et deux plages du même jour ne peuvent pas se chevaucher.
 *
 * Une erreur ici ne casse pas l'affichage : elle ouvre à la réservation des
 * créneaux pendant lesquels la clinique est fermée, ou l'inverse.
 */
import { describe, expect, it } from "vitest";

import {
  appointmentTypeSchema,
  exceptionSchema,
  newAppointmentSchema,
  practitionerSchema,
  weeklyScheduleSchema,
} from "@/lib/scheduling/schemas";

/** Une plage ordinaire. */
function plage(start = "09:00", end = "18:00") {
  return { start, end };
}

/** Une semaine dont on ne précise que le jour qui nous intéresse. */
function semaine(jour0: { open: boolean; ranges: { start: string; end: string }[] }) {
  return {
    days: [
      jour0,
      ...Array.from({ length: 6 }, () => ({ open: false, ranges: [plage()] })),
    ],
  };
}

/** Chemins d'erreur signalés, sous forme lisible. */
function chemins(valeurs: unknown): string[] {
  const resultat = weeklyScheduleSchema.safeParse(valeurs);
  return resultat.success
    ? []
    : resultat.error.issues.map((issue) => issue.path.join("."));
}

describe("weeklyScheduleSchema — structure", () => {
  it("accepte une semaine valide", () => {
    expect(
      weeklyScheduleSchema.safeParse(semaine({ open: true, ranges: [plage()] }))
        .success,
    ).toBe(true);
  });

  it("exige exactement sept jours", () => {
    // Le backend indexe les jours de 0 à 6 : un tableau plus court ou plus
    // long produirait une semaine incohérente côté serveur.
    expect(weeklyScheduleSchema.safeParse({ days: [] }).success).toBe(false);
    expect(
      weeklyScheduleSchema.safeParse({
        days: Array.from({ length: 8 }, () => ({ open: false, ranges: [plage()] })),
      }).success,
    ).toBe(false);
  });

  it("exige au moins une plage par jour, même fermé", () => {
    // Un jour sans plage ne pourrait plus être rouvert depuis l'interface.
    expect(chemins(semaine({ open: false, ranges: [] }))).toContain(
      "days.0.ranges",
    );
  });
});

describe("weeklyScheduleSchema — jours fermés", () => {
  it("ne valide pas les horaires d'un jour fermé", () => {
    // Rouvrir le mardi doit retrouver ses anciens horaires : ils restent
    // donc en mémoire, même incohérents, tant que le jour est fermé.
    expect(
      chemins(semaine({ open: false, ranges: [plage("18:00", "09:00")] })),
    ).toEqual([]);
  });

  it("ne valide pas non plus un horaire vide sur un jour fermé", () => {
    expect(chemins(semaine({ open: false, ranges: [plage("", "")] }))).toEqual(
      [],
    );
  });
});

describe("weeklyScheduleSchema — validité d'une plage", () => {
  it("refuse une heure non renseignée", () => {
    // Un <input type="time"> vidé vaut "" : il faut le rattraper avant
    // l'envoi, sinon le backend répond un 422 illisible.
    expect(chemins(semaine({ open: true, ranges: [plage("", "18:00")] }))).toEqual(
      ["days.0.ranges.0.end"],
    );
  });

  it("refuse une fermeture antérieure à l'ouverture", () => {
    expect(
      chemins(semaine({ open: true, ranges: [plage("18:00", "09:00")] })),
    ).toEqual(["days.0.ranges.0.end"]);
  });

  it("refuse une plage de durée nulle", () => {
    // La comparaison est stricte : ouvrir et fermer à la même heure n'a
    // pas de sens et ne produirait aucun créneau.
    expect(
      chemins(semaine({ open: true, ranges: [plage("09:00", "09:00")] })),
    ).toEqual(["days.0.ranges.0.end"]);
  });

  it("signale l'erreur sous LA plage fautive", () => {
    // Le chemin compte autant que le message : c'est lui qui place le
    // texte rouge sous la bonne ligne du formulaire, et non en vrac.
    const chemin = chemins(
      semaine({
        open: true,
        ranges: [plage("09:00", "12:00"), plage("18:00", "14:00")],
      }),
    );
    expect(chemin).toEqual(["days.0.ranges.1.end"]);
  });
});

describe("weeklyScheduleSchema — chevauchement", () => {
  it("accepte deux plages disjointes (pause déjeuner)", () => {
    // Le cas nominal d'une clinique : matin, pause, après-midi.
    expect(
      chemins(
        semaine({
          open: true,
          ranges: [plage("09:00", "12:00"), plage("14:00", "18:00")],
        }),
      ),
    ).toEqual([]);
  });

  it("accepte deux plages qui se touchent sans se recouvrir", () => {
    expect(
      chemins(
        semaine({
          open: true,
          ranges: [plage("09:00", "12:00"), plage("12:00", "18:00")],
        }),
      ),
    ).toEqual([]);
  });

  it("refuse deux plages qui se chevauchent", () => {
    expect(
      chemins(
        semaine({
          open: true,
          ranges: [plage("09:00", "13:00"), plage("12:00", "18:00")],
        }),
      ),
    ).toEqual(["days.0.ranges.1.end"]);
  });

  it("détecte le chevauchement même si les plages sont saisies en désordre", () => {
    // Les plages sont triées avant comparaison : l'ordre de saisie ne doit
    // pas permettre de passer entre les mailles.
    expect(
      chemins(
        semaine({
          open: true,
          ranges: [plage("14:00", "18:00"), plage("09:00", "15:00")],
        }),
      ),
    ).toHaveLength(1);
  });

  it("n'empile pas deux erreurs sur une plage déjà invalide", () => {
    // Une plage incomplète est écartée du contrôle de chevauchement :
    // inutile de reprocher deux choses à la fois au même champ.
    expect(
      chemins(
        semaine({
          open: true,
          ranges: [plage("09:00", "18:00"), plage("", "")],
        }),
      ),
    ).toEqual(["days.0.ranges.1.end"]);
  });
});

describe("appointmentTypeSchema", () => {
  const valide = { name: "Consultation", duration_minutes: 30, active: true };

  it("accepte un type valide", () => {
    expect(appointmentTypeSchema.safeParse(valide).success).toBe(true);
  });

  it("impose une durée multiple de cinq minutes", () => {
    // La grille de l'agenda est découpée en tranches de 5 minutes : une
    // durée de 32 minutes produirait un bloc désaligné.
    expect(
      appointmentTypeSchema.safeParse({ ...valide, duration_minutes: 32 })
        .success,
    ).toBe(false);
    expect(
      appointmentTypeSchema.safeParse({ ...valide, duration_minutes: 35 })
        .success,
    ).toBe(true);
  });

  it("borne la durée entre 5 minutes et 8 heures", () => {
    for (const duree of [0, 4, 485]) {
      expect(
        appointmentTypeSchema.safeParse({ ...valide, duration_minutes: duree })
          .success,
        `durée ${duree}`,
      ).toBe(false);
    }
    expect(
      appointmentTypeSchema.safeParse({ ...valide, duration_minutes: 480 })
        .success,
    ).toBe(true);
  });

  it("refuse une durée décimale", () => {
    expect(
      appointmentTypeSchema.safeParse({ ...valide, duration_minutes: 30.5 })
        .success,
    ).toBe(false);
  });

  it("exige un nom non vide, espaces exclus", () => {
    expect(
      appointmentTypeSchema.safeParse({ ...valide, name: "   " }).success,
    ).toBe(false);
  });
});

describe("practitionerSchema", () => {
  it("accepte un praticien valide et refuse un nom vide", () => {
    expect(
      practitionerSchema.safeParse({ name: "Dr Martin", active: true }).success,
    ).toBe(true);
    expect(
      practitionerSchema.safeParse({ name: "  ", active: true }).success,
    ).toBe(false);
  });

  it("plafonne le nom à 200 caractères", () => {
    expect(
      practitionerSchema.safeParse({ name: "a".repeat(201), active: true })
        .success,
    ).toBe(false);
  });
});

describe("newAppointmentSchema", () => {
  const valide = {
    resource_id: "00000000-0000-0000-0000-0000000000a1",
    appointment_type_id: "00000000-0000-0000-0000-0000000000b1",
    date: new Date(2026, 7, 20),
    time: "09:30",
    guest_name: "M. Bernard",
  };

  it("accepte une saisie minimale", () => {
    expect(newAppointmentSchema.safeParse(valide).success).toBe(true);
  });

  it("impose le format HH:MM à l'heure", () => {
    for (const time of ["9:30", "0930", "9h30", ""]) {
      expect(
        newAppointmentSchema.safeParse({ ...valide, time }).success,
        `heure "${time}"`,
      ).toBe(false);
    }
  });

  it("ne vérifie que le FORMAT, pas la plage horaire", () => {
    // Constat, pas souhait : la règle est /^\d{2}:\d{2}$/, donc "25:00"
    // passe la validation côté client. Ce n'est pas exploitable en pratique
    // (un <input type="time"> ne peut pas produire cette valeur) et le
    // backend refuserait de toute façon. Ce test fige le contrat réel : si
    // quelqu'un durcit un jour la règle, il verra ce test rougir et saura
    // que c'était un choix connu, pas un oubli.
    expect(
      newAppointmentSchema.safeParse({ ...valide, time: "25:00" }).success,
    ).toBe(true);
  });

  it("exige le nom du client de passage", () => {
    expect(
      newAppointmentSchema.safeParse({ ...valide, guest_name: "" }).success,
    ).toBe(false);
  });

  it("rend l'animal et le motif facultatifs", () => {
    expect(
      newAppointmentSchema.safeParse({
        ...valide,
        guest_pet_name: "Rex",
        reason: "Vaccination annuelle",
      }).success,
    ).toBe(true);
  });
});

describe("exceptionSchema", () => {
  it("accepte une absence sur une période", () => {
    expect(
      exceptionSchema.safeParse({
        range: { from: new Date(2026, 7, 24), to: new Date(2026, 7, 28) },
      }).success,
    ).toBe(true);
  });

  it("exige les deux bornes de la période", () => {
    // Un calendrier laissé à moitié sélectionné ne doit pas être envoyé.
    expect(
      exceptionSchema.safeParse({ range: { from: new Date(2026, 7, 24) } })
        .success,
    ).toBe(false);
  });

  it("plafonne le motif à 200 caractères", () => {
    expect(
      exceptionSchema.safeParse({
        range: { from: new Date(2026, 7, 24), to: new Date(2026, 7, 28) },
        reason: "a".repeat(201),
      }).success,
    ).toBe(false);
  });
});
