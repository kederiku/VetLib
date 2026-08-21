/**
 * Hook d'accès à la liste des rendez-vous du propriétaire.
 *
 * Enveloppe useListMyAppointments avec le `select` qui dépiaute la
 * réponse du mutator ({ status, data, headers }), pour que les six
 * écrans qui lisent cette liste — tableau de bord, page « Mes
 * rendez-vous », détail d'un rendez-vous, fiche animal, liste des
 * animaux — partagent EXACTEMENT la même entrée de cache.
 *
 * C'est le pivot de l'architecture de données du portail : le backend
 * renvoie tous les rendez-vous avec les noms déjà dénormalisés, donc
 * chaque vue est une dérivation locale (voir lib/appointments/derive.ts)
 * et non une requête. Une annulation invalide cette seule clé et
 * rafraîchit tous les écrans d'un coup.
 */
"use client";

import { useListMyAppointments } from "@/lib/api/generated/owner-appointments/owner-appointments";

export function useMyAppointments() {
  return useListMyAppointments({ query: { select: (res) => res.data } });
}
