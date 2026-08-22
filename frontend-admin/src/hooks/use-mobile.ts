/**
 * Hook useIsMobile (tiré par le composant Sidebar de shadcn/ui).
 *
 * Détecte les écrans étroits via matchMedia et se met à jour au
 * redimensionnement. Réécrit avec useSyncExternalStore (au lieu du
 * useState + useEffect du preset d'origine, refusé par les règles
 * react-hooks du projet : setState synchrone dans un effet) : c'est le
 * hook React DÉDIÉ à l'abonnement à une source externe — ici la media
 * query du navigateur. Le 3e argument (getServerSnapshot) renvoie false
 * pendant le rendu serveur (pas de window) : le HTML du SSR reste
 * stable, la valeur réelle arrive à l'hydratation. La Sidebar s'en sert
 * pour basculer en Sheet mobile.
 */
import * as React from "react"

const MOBILE_BREAKPOINT = 768

// S'abonne aux changements de la media query ; React ré-évalue le
// snapshot à chaque notification.
function subscribe(callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    // Snapshot client : l'écran est-il étroit MAINTENANT ?
    () => window.innerWidth < MOBILE_BREAKPOINT,
    // Snapshot serveur : pas de window, on suppose desktop.
    () => false,
  )
}
