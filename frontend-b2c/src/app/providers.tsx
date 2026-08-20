/**
 * Providers React partagés par toute l'application B2C.
 *
 * Installe le QueryClientProvider de TanStack Query : c'est lui qui porte le
 * cache des requêtes API dont dépendent tous les hooks générés par Orval
 * (useQuery/useMutation). Monté une seule fois dans le layout racine.
 *
 * "use client" est obligatoire : un provider repose sur le contexte React
 * (et ici sur useState), deux mécanismes qui n'existent que dans les Client
 * Components. Le layout racine, lui, reste un Server Component et se contente
 * d'imbriquer ce composant.
 */
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  // JAMAIS de singleton module-level : un QueryClient partagé entre requêtes
  // SSR ferait fuiter le cache entre tenants.
  // Explication : côté serveur, un module importé n'est chargé qu'une fois
  // puis réutilisé pour toutes les requêtes HTTP entrantes. Un QueryClient
  // créé au niveau du module serait donc COMMUN à tous les visiteurs : les
  // données mises en cache pour la clinique A pourraient être resservies au
  // rendu de la clinique B. useState(() => new QueryClient()) crée au
  // contraire une instance par arbre React (donc par requête SSR), et la
  // forme "initializer function" garantit qu'elle n'est construite qu'une
  // seule fois côté client, pas à chaque re-render.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // staleTime 30 s : une donnée déjà en cache est considérée fraîche
        // pendant 30 s, donc pas de refetch immédiat au remontage d'un
        // composant. Evite aussi un double fetch SSR puis client.
        defaultOptions: { queries: { staleTime: 30_000 } },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
