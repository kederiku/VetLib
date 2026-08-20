/**
 * Invalidation ciblée du cache agenda après toute mutation de RDV.
 *
 * Chaque combinaison semaine/praticien de l'agenda vit dans SA propre
 * entrée de cache TanStack (la queryKey générée par Orval est
 * [chemin, params]). Après une création, confirmation ou annulation, on
 * ne sait pas quelles combinaisons sont en cache : on invalide donc par
 * PRÉFIXE — le chemin seul, premier élément de la clé — ce qui couvre
 * toutes les périodes, tous les filtres praticien ET la carte
 * "À confirmer" du tableau de bord (qui interroge le même endpoint).
 * Invalider (et non supprimer) : les écrans montés refetchent aussitôt,
 * les entrées non montées seront refetchées à leur prochain affichage.
 */
import type { QueryClient } from "@tanstack/react-query";

import { getGetAgendaQueryKey } from "@/lib/api/generated/scheduling/scheduling";

/** Marque périmées TOUTES les queries agenda, quels que soient les params. */
export function invalidateAgenda(queryClient: QueryClient): Promise<void> {
  // On extrait le chemin depuis la fonction générée (plutôt que de copier
  // la chaîne "/api/v1/scheduling/agenda") : si l'URL change côté OpenAPI,
  // la régénération Orval propage le changement ici automatiquement.
  // Les params factices ne servent qu'à satisfaire la signature.
  const [agendaPath] = getGetAgendaQueryKey({ date_from: "", date_to: "" });
  return queryClient.invalidateQueries({ queryKey: [agendaPath] });
}
