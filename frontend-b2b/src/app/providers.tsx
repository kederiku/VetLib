/**
 * Providers React globaux du portail B2B.
 *
 * Seul provider pour l'instant : TanStack Query, indispensable car tous
 * les hooks générés par Orval (useQuery/useMutation) exigent un
 * QueryClientProvider au-dessus d'eux dans l'arbre. Le fichier est isolé
 * du layout car un provider a besoin de "use client" (état React), alors
 * que le layout racine reste un Server Component.
 */
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  // JAMAIS de singleton module-level : un QueryClient partagé entre requêtes
  // SSR ferait fuiter le cache entre tenants.
  // (Côté serveur, un module est chargé une seule fois et partagé par toutes
  // les requêtes HTTP ; une clinique A pourrait alors voir des données mises
  // en cache pour une clinique B. useState(() => ...) garantit une instance
  // par rendu de l'arbre, créée une seule fois côté client.)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // staleTime 30 s : une donnée est considérée fraîche pendant 30 s,
        // ce qui évite un refetch immédiat au montage de chaque composant
        // (le défaut de TanStack Query est 0 = toujours périmée).
        defaultOptions: { queries: { staleTime: 30_000 } },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
