/**
 * GuestGuard : garde inverse de l'AuthGuard, pour /login et /register.
 *
 * Un utilisateur DÉJÀ connecté n'a rien à faire sur les écrans d'auth :
 * on le renvoie vers son tableau de bord. Cela évite le cas déroutant
 * "je me re-connecte alors que j'ai déjà une session" et les doubles
 * sessions involontaires.
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useCurrentUser } from "@/lib/auth/use-current-user";

export function GuestGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user, isError } = useCurrentUser();

  // Redirection en effet (pas pendant le rendu), replace pour ne pas
  // empiler /login dans l'historique du navigateur.
  // `!isError` est indispensable : quand un refetch d'arriere-plan echoue,
  // TanStack Query passe en erreur SANS effacer les donnees (data definie ET
  // isError true en meme temps). Sans ce garde-fou, l'AuthGuard (qui redirige
  // sur isError) et ce GuestGuard (qui redirigerait sur data seule) se
  // renverraient l'utilisateur en boucle /dashboard <-> /login.
  useEffect(() => {
    if (user !== undefined && !isError) {
      router.replace("/dashboard");
    }
  }, [user, isError, router]);

  // Rendu OPTIMISTE : on affiche le formulaire tout de suite, sans
  // attendre la fin de la vérification de session. Le cas nominal sur
  // /login est justement "pas de session" : faire patienter tout le
  // monde derrière un squelette pour le cas rare "déjà connecté"
  // dégraderait l'expérience de la majorité. Si une session existe,
  // l'effet ci-dessus redirige en une fraction de seconde.
  return <>{children}</>;
}
