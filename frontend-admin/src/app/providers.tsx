/**
 * Providers React globaux du back-office.
 *
 * Copie conforme de ceux des deux portails — et c'est le but : les trois
 * applications se comportent pareil (même staleTime, même thème, même
 * emplacement de toasts), un développeur qui passe de l'une à l'autre ne
 * réapprend rien.
 */
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  // JAMAIS de singleton module-level : côté serveur, un module est chargé une
  // seule fois et partagé par toutes les requêtes HTTP -- un QueryClient
  // global ferait donc fuiter le cache d'un visiteur à l'autre. Ici le cache
  // contient la liste de TOUTES les cliniques et de TOUS les propriétaires :
  // la précaution vaut encore plus qu'ailleurs.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // 30 s de fraîcheur : évite un refetch au montage de chaque composant
        // (le défaut de TanStack Query est 0 = toujours périmée).
        defaultOptions: { queries: { staleTime: 30_000 } },
      }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      <Toaster position="bottom-right" richColors />
    </ThemeProvider>
  );
}
