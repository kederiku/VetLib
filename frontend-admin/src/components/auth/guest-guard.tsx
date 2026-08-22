/**
 * GuestGuard : garde inverse de l'AuthGuard, pour /login.
 *
 * Un administrateur DÉJÀ connecté n'a rien à faire sur l'écran de connexion :
 * on le renvoie vers son tableau de bord. Cela évite le cas déroutant
 * "je me re-connecte alors que j'ai déjà une session" et les doubles
 * sessions involontaires.
 *
 * La vérification de session n'est lancée QUE si l'indice localStorage
 * (session-hint) est présent : un visiteur qui n'a jamais ouvert de
 * session ne déclenche AUCUN appel /me ni /refresh — donc aucun 401 de
 * bruit dans la console à chaque chargement de /login.
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getSessionHint } from "@/lib/auth/session-hint";
import { useCurrentAdmin } from "@/lib/auth/use-current-admin";

export function GuestGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Le hint est lu UNE fois au montage (initialiseur useState), pas à
  // chaque rendu : la valeur reste stable pendant toute la vie du
  // composant, la query ne bascule pas enabled/disabled en cours de
  // route. Côté SSR, getSessionHint renvoie false (pas de window) ; le
  // rendu est identique dans tous les cas (children), donc aucun risque
  // d'hydration mismatch.
  const [hasSessionHint] = useState(() => getSessionHint());
  // enabled: false = query inerte : pas de requête, jamais d'erreur, et
  // data reste undefined -> l'effet de redirection ne se déclenche pas.
  const { data: admin, isError } = useCurrentAdmin({ enabled: hasSessionHint });

  // Redirection en effet (pas pendant le rendu), replace pour ne pas
  // empiler /login dans l'historique du navigateur.
  // `!isError` est indispensable : quand un refetch d'arriere-plan echoue,
  // TanStack Query passe en erreur SANS effacer les donnees (data definie ET
  // isError true en meme temps). Sans ce garde-fou, l'AuthGuard (qui redirige
  // sur isError) et ce GuestGuard (qui redirigerait sur data seule) se
  // renverraient l'utilisateur en boucle /dashboard <-> /login.
  useEffect(() => {
    if (admin !== undefined && !isError) {
      router.replace("/tableau-de-bord");
    }
  }, [admin, isError, router]);

  // Edge case assumé : cookies HttpOnly valides mais localStorage purgé
  // (drapeau absent). Le formulaire de login s'affiche alors au lieu de
  // rediriger — sans conséquence : se reconnecter fonctionne, le backend
  // réémet simplement de nouveaux cookies et le login repose le drapeau.
  //
  // Rendu OPTIMISTE : on affiche le formulaire tout de suite, sans
  // attendre la fin de la vérification de session. Le cas nominal sur
  // /login est justement "pas de session" : faire patienter tout le
  // monde derrière un squelette pour le cas rare "déjà connecté"
  // dégraderait l'expérience de la majorité. Si une session existe,
  // l'effet ci-dessus redirige en une fraction de seconde.
  return <>{children}</>;
}
