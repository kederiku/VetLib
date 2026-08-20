/**
 * Vocabulaire d'affichage des statuts de rendez-vous, cote proprietaire.
 *
 * Le backend expose une machine a etats stricte (pending -> confirmed ->
 * completed, et pending|confirmed -> cancelled). Ce module centralise la
 * traduction de ces codes techniques en libelles francais et en
 * variantes de Badge, pour que toutes les cartes de rendez-vous (liste,
 * apercu du compte, ecran de succes du wizard) parlent d'une seule voix.
 */
import type { VariantProps } from "class-variance-authority";

import type { badgeVariants } from "@/components/ui/badge";
import type {
  AppointmentStatus,
  OwnerAppointmentResponse,
} from "@/lib/api/generated/vetoLibAPI.schemas";

// Variante visuelle du composant Badge ("default", "secondary"...),
// derivee du composant lui-meme : impossible d'ecrire une variante qui
// n'existe pas sans erreur de compilation.
type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

/**
 * Libelle et pastille de chaque statut. Record<AppointmentStatus, ...> :
 * si le backend ajoute un statut, TypeScript exigera son entree ici.
 *
 * Choix des variantes : "pending" en secondary (etat transitoire,
 * neutre), "confirmed" en default (la couleur primaire signale le
 * rendez-vous acquis), "completed" et "cancelled" en outline (passes,
 * discrets).
 */
export const STATUS_LABELS: Record<
  AppointmentStatus,
  { label: string; badgeVariant: BadgeVariant }
> = {
  pending: { label: "En attente de confirmation", badgeVariant: "secondary" },
  confirmed: { label: "Confirmé", badgeVariant: "default" },
  completed: { label: "Passé", badgeVariant: "outline" },
  cancelled: { label: "Annulé", badgeVariant: "outline" },
};

// Preavis minimal d'annulation en ligne : 24 h, en millisecondes.
// Miroir de la regle metier du backend (scheduling.cancellation_too_late).
const CANCELLATION_NOTICE_MS = 24 * 60 * 60 * 1000;

/**
 * Le bouton "Annuler" doit-il etre propose pour ce rendez-vous ?
 *
 * PRE-VERIFICATION d'affichage seulement : on evite de montrer un bouton
 * voue a l'echec (rendez-vous deja annule, passe, ou a moins de 24 h).
 * L'AUTORITE reste le backend : meme si l'horloge du navigateur etait
 * fausse, le POST /cancel repondrait 409 et l'UI afficherait l'erreur.
 */
export function canCancel(appt: OwnerAppointmentResponse, now: Date): boolean {
  if (appt.status !== "pending" && appt.status !== "confirmed") {
    return false;
  }
  return (
    new Date(appt.starts_at).getTime() - now.getTime() > CANCELLATION_NOTICE_MS
  );
}
