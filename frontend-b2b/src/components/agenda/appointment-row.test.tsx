/**
 * Tests de la ligne de rendez-vous du tableau de bord.
 *
 * Cette ligne est ce que l'accueil lit toute la journée. Chaque information y
 * est conditionnelle : le téléphone n'existe que pour un compte propriétaire,
 * l'animal peut venir d'une fiche patient ou d'une saisie libre, le motif est
 * facultatif. Une régression ne casse rien — elle fait simplement disparaître
 * le numéro de téléphone dont l'accueil a besoin pour rappeler.
 *
 * Les boutons d'action sont rendus par un composant enfant qui déclenche des
 * mutations : on le simule pour tester CETTE ligne, et non l'ensemble.
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppointmentRow } from "@/components/agenda/appointment-row";
import { buildAgendaEntry } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

// Les actions sont testées séparément : ici elles ne feraient qu'introduire
// des mutations sans rapport avec l'affichage de la ligne.
vi.mock("@/components/agenda/appointment-actions", () => ({
  AppointmentActions: () => null,
}));

describe("AppointmentRow — informations toujours présentes", () => {
  it("affiche le motif, le praticien et le statut", () => {
    renderWithProviders(
      <AppointmentRow
        entry={buildAgendaEntry({
          appointment_type_name: "Vaccination",
          resource_name: "Dr Martin",
          status: "pending",
        })}
      />,
    );

    expect(screen.getByText("Vaccination")).toBeInTheDocument();
    expect(screen.getByText(/Dr Martin/)).toBeInTheDocument();
    expect(screen.getByText("À confirmer")).toBeInTheDocument();
  });

  it("affiche la plage horaire en heure de la clinique", () => {
    // 07:00 UTC en août = 09:00 à la clinique. C'est cette heure-là que
    // l'accueil doit lire, pas celle du poste.
    const { container } = renderWithProviders(
      <AppointmentRow
        entry={buildAgendaEntry({
          starts_at: "2026-08-20T07:00:00Z",
          ends_at: "2026-08-20T07:30:00Z",
        })}
      />,
    );

    expect(container.textContent).toContain("09");
    expect(container.textContent).toContain("30");
  });
});

describe("AppointmentRow — nom du client", () => {
  it("préfère le compte propriétaire", () => {
    renderWithProviders(
      <AppointmentRow
        entry={buildAgendaEntry({
          owner_first_name: "Marie",
          owner_last_name: "Dupont",
          guest_name: "Saisie libre",
        })}
      />,
    );

    expect(screen.getByText(/Marie Dupont/)).toBeInTheDocument();
    expect(screen.queryByText(/Saisie libre/)).not.toBeInTheDocument();
  });

  it("retombe sur le client de passage", () => {
    renderWithProviders(
      <AppointmentRow entry={buildAgendaEntry({ guest_name: "M. Bernard" })} />,
    );

    expect(screen.getByText(/M\. Bernard/)).toBeInTheDocument();
  });

  it("ne laisse jamais la ligne anonyme", () => {
    renderWithProviders(<AppointmentRow entry={buildAgendaEntry()} />);
    expect(screen.getByText(/Client inconnu/)).toBeInTheDocument();
  });
});

describe("AppointmentRow — informations facultatives", () => {
  it("affiche l'animal avec son espèce quand la fiche existe", () => {
    renderWithProviders(
      <AppointmentRow
        entry={buildAgendaEntry({ pet_name: "Rex", pet_species: "chien" })}
      />,
    );

    expect(screen.getByText(/Rex \(chien\)/)).toBeInTheDocument();
  });

  it("affiche le téléphone du propriétaire quand il existe", () => {
    // C'est l'information dont l'accueil a besoin pour confirmer ou
    // déplacer : sa disparition serait un vrai handicap au quotidien.
    renderWithProviders(
      <AppointmentRow entry={buildAgendaEntry({ owner_phone: "0612345678" })} />,
    );

    expect(screen.getByText("0612345678")).toBeInTheDocument();
  });

  it("n'ajoute aucune ligne quand le téléphone est absent", () => {
    // Comparaison des deux rendus : la ligne « avec téléphone » doit avoir
    // exactement un paragraphe de plus. Compter est plus fiable que
    // chercher une absence de texte, qui passerait aussi si tout
    // disparaissait.
    const sans = renderWithProviders(
      <AppointmentRow entry={buildAgendaEntry({ owner_phone: null })} />,
    );
    const nbSans = sans.container.querySelectorAll("p").length;
    sans.unmount();

    const avec = renderWithProviders(
      <AppointmentRow entry={buildAgendaEntry({ owner_phone: "0612345678" })} />,
    );

    expect(avec.container.querySelectorAll("p")).toHaveLength(nbSans + 1);
  });

  it("affiche le motif libre quand il est renseigné", () => {
    renderWithProviders(
      <AppointmentRow entry={buildAgendaEntry({ reason: "Boite depuis hier" })} />,
    );

    expect(screen.getByText("Boite depuis hier")).toBeInTheDocument();
  });

  it("ignore un motif vide comme un motif absent", () => {
    // Une chaîne vide produirait un paragraphe vide qui décalerait la mise
    // en page d'une ligne sur deux.
    const { container } = renderWithProviders(
      <AppointmentRow entry={buildAgendaEntry({ reason: "" })} />,
    );

    expect(container.querySelector("p.italic")).not.toBeInTheDocument();
  });
});

describe("AppointmentRow — statuts", () => {
  it("porte un badge distinct pour chaque statut", () => {
    for (const [status, libelle] of [
      ["pending", "À confirmer"],
      ["confirmed", "Confirmé"],
      ["completed", "Terminé"],
      ["cancelled", "Annulé"],
    ] as const) {
      const { unmount } = renderWithProviders(
        <AppointmentRow entry={buildAgendaEntry({ status })} />,
      );
      expect(screen.getByText(libelle), status).toBeInTheDocument();
      unmount();
    }
  });
});
