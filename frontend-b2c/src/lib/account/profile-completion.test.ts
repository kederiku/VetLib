/**
 * Tests de la complétude du profil.
 *
 * Le point à verrouiller est le SILENCE quand tout va bien : une invite
 * « complétez votre profil » qui resterait affichée après avoir été
 * satisfaite deviendrait un décor que l'oeil apprend à ignorer, et le
 * jour où elle dirait quelque chose d'utile, personne ne la lirait.
 */
import { describe, expect, it } from "vitest";

import {
  missingProfileDescription,
  missingProfileFields,
} from "@/lib/account/profile-completion";
import { buildAddress, buildOwner } from "@/test/fixtures";

describe("missingProfileFields", () => {
  it("ne signale rien sur une fiche complète", () => {
    expect(
      missingProfileFields(
        buildOwner({ phone: "0612345678", address: buildAddress() }),
      ),
    ).toEqual([]);
  });

  it("ne signale rien tant que la session n'est pas résolue", () => {
    // Reprocher un champ manquant avant de savoir s'il manque serait un
    // faux reproche.
    expect(missingProfileFields(undefined)).toEqual([]);
  });

  it("cite le téléphone avant l'adresse : sa conséquence est concrète", () => {
    expect(
      missingProfileFields(buildOwner({ phone: null, address: null })),
    ).toEqual(["phone", "address"]);
  });

  it("traite une chaîne vide comme une absence", () => {
    // Le backend accepte null, mais un formulaire mal rempli peut avoir
    // enregistré "" ou "   ".
    expect(
      missingProfileFields(
        buildOwner({ phone: "   ", address: buildAddress() }),
      ),
    ).toEqual(["phone"]);
  });

  it("signale l'adresse seule quand le téléphone est là", () => {
    expect(
      missingProfileFields(buildOwner({ phone: "0612345678", address: null })),
    ).toEqual(["address"]);
  });
});

describe("missingProfileDescription", () => {
  it("explique la conséquence, pas seulement le manque", () => {
    expect(missingProfileDescription(["phone"])).toContain("joindre");
    expect(missingProfileDescription(["address"])).toContain("dossier");
  });

  it("fond les deux cas en une seule phrase", () => {
    const phrase = missingProfileDescription(["phone", "address"]);
    expect(phrase).toContain("téléphone");
    expect(phrase).toContain("adresse");
  });
});
