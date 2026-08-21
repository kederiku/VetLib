/**
 * Vocabulaire d'affichage des statuts de rendez-vous, centralisé.
 *
 * Un rendez-vous suit une machine à états backend (pending -> confirmed
 * -> completed, annulable en route). Chaque écran qui l'affiche (grille
 * agenda, tableau de bord, panneaux de détail) doit employer les MEMES
 * libellés et les MEMES couleurs : ce module est l'unique source de
 * vérité, sur le modèle de src/lib/appointments/status.ts du portail
 * B2C. Record<AppointmentStatus, ...> : TypeScript exige une entrée par
 * état, un nouvel état backend casserait la compilation ici (voulu).
 */
import type { Badge } from "@/components/ui/badge";
import type {
  AgendaEntryResponse,
  AppointmentStatus,
} from "@/lib/api/generated/vetoLibAPI.schemas";

export const STATUS_META: Record<
  AppointmentStatus,
  {
    /** Libellé français montré partout ("À confirmer", "Confirmé"...). */
    label: string;
    /** Variante du composant Badge (couleur de la pastille de statut). */
    variant: React.ComponentProps<typeof Badge>["variant"];
    /**
     * Classe appliquée aux LIGNES de liste (tableau de bord) : les
     * rendez-vous annulés restent visibles (historique de la journée)
     * mais estompés, pour ne pas voler l'attention.
     */
    rowClass?: string;
    /**
     * Classe appliquée aux BLOCS de la grille agenda : le statut se lit
     * d'un coup d'oeil sans ouvrir le détail (bordure pointillée = en
     * attente, plein = confirmé, délavé = passé/annulé).
     */
    blockClass?: string;
  }
> = {
  pending: {
    label: "À confirmer",
    variant: "outline",
    blockClass: "border-dashed",
  },
  confirmed: { label: "Confirmé", variant: "default" },
  completed: {
    label: "Terminé",
    variant: "secondary",
    blockClass: "opacity-80 saturate-50",
  },
  cancelled: {
    label: "Annulé",
    variant: "destructive",
    rowClass: "opacity-60",
    blockClass: "opacity-50 line-through",
  },
};

/**
 * Nom du client à afficher : compte propriétaire (prénom + nom) si le
 * RDV vient du portail B2C, sinon le client de passage (guest_name).
 */
export function formatClientName(entry: AgendaEntryResponse): string {
  if (entry.owner_first_name !== null || entry.owner_last_name !== null) {
    return [entry.owner_first_name, entry.owner_last_name]
      .filter(Boolean)
      .join(" ");
  }
  return entry.guest_name ?? "Client inconnu";
}

/**
 * Libellé de l'animal : "Rex (chien)" quand l'espèce est connue (fiche
 * patient liée), "Rex" sinon, null si aucun animal n'est renseigné.
 * pet_name = fiche patient du portail B2C ; guest_pet_name = saisie
 * libre du staff pour un client de passage (jamais d'espèce dans ce cas).
 */
export function formatPetLabel(entry: AgendaEntryResponse): string | null {
  const name = entry.pet_name ?? entry.guest_pet_name;
  if (name == null) {
    return null;
  }
  return entry.pet_species != null ? `${name} (${entry.pet_species})` : name;
}
