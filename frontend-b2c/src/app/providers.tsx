/**
 * Providers React partagés par toute l'application B2C.
 *
 * Trois préoccupations transverses, empilées ici et nulle part ailleurs :
 * - TanStack Query : indispensable, tous les hooks générés par Orval
 *   (useQuery/useMutation) exigent un QueryClientProvider au-dessus d'eux ;
 * - next-themes : applique la classe "dark" sur <html> selon le choix de
 *   l'utilisateur (clair / sombre / système). Le CSS sombre de globals.css
 *   existait déjà depuis le début — ce provider le rend enfin atteignable ;
 * - Sonner (toasts) : le <Toaster /> est monté UNE fois ici ; n'importe quel
 *   composant peut ensuite appeler toast.success(...) sans câblage.
 *
 * "use client" est obligatoire : un provider repose sur le contexte React
 * (et ici sur useState), deux mécanismes qui n'existent que dans les Client
 * Components. Le layout racine, lui, reste un Server Component et se contente
 * d'imbriquer ce composant.
 */
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  // JAMAIS de singleton module-level : un QueryClient partagé entre requêtes
  // SSR ferait fuiter le cache entre visiteurs.
  // Explication : côté serveur, un module importé n'est chargé qu'une fois
  // puis réutilisé pour toutes les requêtes HTTP entrantes. Un QueryClient
  // créé au niveau du module serait donc COMMUN à tous les visiteurs : les
  // données mises en cache pour un propriétaire pourraient être resservies
  // au rendu d'un autre. useState(() => new QueryClient()) crée au contraire
  // une instance par arbre React (donc par requête SSR), et la forme
  // "initializer function" garantit qu'elle n'est construite qu'une seule
  // fois côté client, pas à chaque re-render.
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
    // attribute="class" : next-themes bascule la classe "dark" sur <html>,
    // ce qui active le bloc .dark de globals.css et le variant dark: de
    // Tailwind. enableSystem : "système" suit prefers-color-scheme.
    // disableTransitionOnChange : coupe les transitions CSS le temps du
    // basculement, sinon chaque élément anime sa couleur en ordre dispersé.
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      {/* Sous le ThemeProvider : le wrapper Sonner lit useTheme() pour
          colorer les toasts selon le thème courant. richColors : fonds
          teintés (vert succès, rouge erreur) plus lisibles en un coup
          d'oeil que le toast neutre par défaut. */}
      <Toaster position="bottom-right" richColors />
    </ThemeProvider>
  );
}
