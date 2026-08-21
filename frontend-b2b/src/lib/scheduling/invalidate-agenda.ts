/**
 * Invalidation ciblée du cache après toute mutation de rendez-vous.
 *
 * Chaque combinaison semaine/praticien de l'agenda vit dans SA propre
 * entrée de cache TanStack (la queryKey générée par Orval est
 * [chemin, params]). Après une création, confirmation ou annulation, on
 * ne sait pas quelles combinaisons sont en cache : on invalide donc par
 * PRÉFIXE — le chemin seul, premier élément de la clé — ce qui couvre
 * toutes les périodes, tous les filtres praticien ET le tableau de bord
 * (qui interroge le même endpoint).
 *
 * Deux caches sont concernés, pas un : l'agenda lui-même, et les
 * CRÉNEAUX DISPONIBLES du sélecteur de rendez-vous (endpoint public
 * availabilities). Un rendez-vous créé ou annulé change immédiatement
 * la liste des créneaux libres ; sans cette seconde invalidation, le
 * dialog proposerait encore un créneau déjà pris (et le 409 du backend
 * tomberait à la validation).
 *
 * Invalider (et non supprimer) : les écrans montés refetchent aussitôt,
 * les entrées non montées seront refetchées à leur prochain affichage.
 */
import type { QueryClient } from "@tanstack/react-query";

import { getListAvailabilitiesQueryKey } from "@/lib/api/generated/public-clinics/public-clinics";
import { getGetAgendaQueryKey } from "@/lib/api/generated/scheduling/scheduling";

// Suffixe du chemin des créneaux disponibles ("/availabilities"),
// dérivé de la fonction générée plutôt qu'écrit en dur : si l'URL
// change côté OpenAPI, la régénération Orval propage le changement.
// Un préfixe ne suffirait pas ici — l'identifiant de clinique est AU
// MILIEU du chemin (/public/clinics/{id}/availabilities), donc on
// filtre par suffixe via un prédicat.
const AVAILABILITIES_SUFFIX = getListAvailabilitiesQueryKey(
  "__CLINIC_ID__",
)[0].split("__CLINIC_ID__")[1];

/** Marque périmés l'agenda ET les créneaux disponibles, tous params confondus. */
export function invalidateAgenda(queryClient: QueryClient): Promise<void> {
  // Chemin de l'agenda extrait de la fonction générée (même raison que
  // ci-dessus). Les params factices ne servent qu'à satisfaire la
  // signature ; seul le premier élément de la clé (le chemin) est lu.
  const [agendaPath] = getGetAgendaQueryKey({ date_from: "", date_to: "" });

  return Promise.all([
    queryClient.invalidateQueries({ queryKey: [agendaPath] }),
    queryClient.invalidateQueries({
      predicate: (query) => {
        const path = query.queryKey[0];
        return typeof path === "string" && path.endsWith(AVAILABILITIES_SUFFIX);
      },
    }),
  ]).then(() => undefined);
}
