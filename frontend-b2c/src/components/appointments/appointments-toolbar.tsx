/**
 * Filtres de la page « Mes rendez-vous » : par animal, par clinique.
 *
 * Chaque menu ne s'affiche QUE s'il a quelque chose à trier : un
 * propriétaire avec un seul animal n'a pas besoin d'un filtre « animal »,
 * et un filtre qui ne propose qu'une valeur est du bruit qui donne
 * l'impression d'une interface plus compliquée qu'elle ne l'est.
 *
 * Les options de cliniques sont dérivées des rendez-vous eux-mêmes
 * (clinic_name est dénormalisé par le backend) : aucune requête à
 * l'annuaire n'est nécessaire.
 *
 * Volontairement PAS de recherche plein texte : sur quelques dizaines de
 * lignes dont toutes les colonnes sont déjà visibles, un champ de
 * recherche ajoute une saisie là où deux menus suffisent.
 */
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  OwnerAppointmentResponse,
  PetResponse,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import { distinctClinics, SANS_ANIMAL } from "@/lib/appointments/derive";
import { TOUS } from "@/components/appointments/use-appointments-url-state";

interface AppointmentsToolbarProps {
  appointments: readonly OwnerAppointmentResponse[];
  pets: readonly PetResponse[];
  animal: string;
  clinique: string;
  onAnimalChange: (valeur: string) => void;
  onCliniqueChange: (valeur: string) => void;
}

export function AppointmentsToolbar({
  appointments,
  pets,
  animal,
  clinique,
  onAnimalChange,
  onCliniqueChange,
}: AppointmentsToolbarProps) {
  const cliniques = distinctClinics(appointments);
  // Certains rendez-vous sont créés par la clinique sans fiche animal
  // rattachée : on ne propose l'entrée « Sans animal » que s'il en existe.
  const aDesRdvSansAnimal = appointments.some((appt) => appt.pet_id === null);

  const animalItems = [
    { value: TOUS, label: "Tous les animaux" },
    ...pets.map((pet) => ({ value: pet.id, label: pet.name })),
    ...(aDesRdvSansAnimal
      ? [{ value: SANS_ANIMAL, label: "Sans animal" }]
      : []),
  ];
  const cliniqueItems = [
    { value: TOUS, label: "Toutes les cliniques" },
    ...cliniques.map((c) => ({ value: c.id, label: c.name })),
  ];

  // Moins de deux choix réels : le menu n'aurait rien à trier.
  const montrerAnimaux = animalItems.length > 2;
  const montrerCliniques = cliniqueItems.length > 2;

  if (!montrerAnimaux && !montrerCliniques) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {montrerAnimaux && (
        <Select
          items={animalItems}
          value={animal}
          onValueChange={(valeur) => {
            if (typeof valeur === "string") onAnimalChange(valeur);
          }}
        >
          <SelectTrigger size="sm" aria-label="Filtrer par animal">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {animalItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {montrerCliniques && (
        <Select
          items={cliniqueItems}
          value={clinique}
          onValueChange={(valeur) => {
            if (typeof valeur === "string") onCliniqueChange(valeur);
          }}
        >
          <SelectTrigger size="sm" aria-label="Filtrer par clinique">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {cliniqueItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
