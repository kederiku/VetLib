/**
 * GuestGuard : garde inverse de l'AuthGuard, pour /login et /register.
 *
 * Un propriétaire DÉJÀ connecté n'a rien à faire sur les écrans d'auth :
 * on le renvoie vers son compte. Cela évite le cas déroutant "je me
 * re-connecte alors que j'ai déjà une session" et les doubles sessions
 * involontaires.
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useCurrentUser } from "@/lib/auth/use-current-user";

export function GuestGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();

  // Redirection en effet (pas pendant le rendu), replace pour ne pas
  // empiler /login dans l'historique du navigateur.
  useEffect(() => {
    if (user !== undefined) {
      router.replace("/account");
    }
  }, [user, router]);

  // Rendu OPTIMISTE : on affiche le formulaire tout de suite, sans
  // attendre la fin de la vérification de session. Le cas nominal sur
  // /login est justement "pas de session" : faire patienter tout le
  // monde derrière un squelette pour le cas rare "déjà connecté"
  // dégraderait l'expérience de la majorité. Si une session existe,
  // l'effet ci-dessus redirige en une fraction de seconde.
  return <>{children}</>;
}
