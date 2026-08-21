/**
 * Tests des libellés de rendez-vous affichés dans l'agenda.
 *
 * Un rendez-vous peut venir de deux mondes : un compte propriétaire créé sur
 * le portail B2C, ou une saisie libre du personnel pour un client de passage.
 * Les deux chemins remplissent des champs différents, et l'agenda doit
 * afficher un nom correct dans tous les cas — y compris les cas partiels.
 */
import { describe, expect, it } from "vitest";

import { formatClientName, formatPetLabel } from "@/lib/appointments/status";
import { buildAgendaEntry } from "@/test/fixtures";

describe("formatClientName", () => {
  it("affiche prénom et nom pour un compte propriétaire", () => {
    const entry = buildAgendaEntry({
      owner_first_name: "Marie",
      owner_last_name: "Dupont",
    });
    expect(formatClientName(entry)).toBe("Marie Dupont");
  });

  it("se contente du prénom quand le nom est absent", () => {
    const entry = buildAgendaEntry({
      owner_first_name: "Marie",
      owner_last_name: null,
    });
    expect(formatClientName(entry)).toBe("Marie");
  });

  it("utilise le nom du client de passage à défaut de compte", () => {
    const entry = buildAgendaEntry({ guest_name: "M. Bernard" });
    expect(formatClientName(entry)).toBe("M. Bernard");
  });

  it("préfère le compte propriétaire au client de passage", () => {
    const entry = buildAgendaEntry({
      owner_first_name: "Marie",
      owner_last_name: "Dupont",
      guest_name: "Saisie libre",
    });
    expect(formatClientName(entry)).toBe("Marie Dupont");
  });

  it("ne laisse jamais la case vide", () => {
    // Un rendez-vous sans aucun nom ne doit pas produire un bloc muet dans
    // l'agenda : il resterait incliquable visuellement.
    expect(formatClientName(buildAgendaEntry())).toBe("Client inconnu");
  });
});

describe("formatPetLabel", () => {
  it("ajoute l'espèce quand la fiche patient est connue", () => {
    const entry = buildAgendaEntry({ pet_name: "Rex", pet_species: "chien" });
    expect(formatPetLabel(entry)).toBe("Rex (chien)");
  });

  it("affiche le seul nom quand l'espèce est inconnue", () => {
    const entry = buildAgendaEntry({ pet_name: "Rex", pet_species: null });
    expect(formatPetLabel(entry)).toBe("Rex");
  });

  it("accepte l'animal saisi librement pour un client de passage", () => {
    const entry = buildAgendaEntry({ guest_pet_name: "Minou" });
    expect(formatPetLabel(entry)).toBe("Minou");
  });

  it("renvoie null quand aucun animal n'est renseigné", () => {
    // null (et non chaîne vide) : l'appelant sait ainsi qu'il ne doit rien
    // afficher du tout, plutôt qu'une ligne vide.
    expect(formatPetLabel(buildAgendaEntry())).toBeNull();
  });
});
