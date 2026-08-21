/**
 * Providers React globaux du portail B2B.
 *
 * Trois responsabilités transverses, empilées ici et nulle part ailleurs :
 * - TanStack Query : indispensable car tous les hooks générés par Orval
 *   (useQuery/useMutation) exigent un QueryClientProvider au-dessus d'eux.
 * - next-themes : applique la classe "dark" sur <html> selon le choix de
 *   l'utilisateur (clair/sombre/système) — le CSS sombre de globals.css
 *   existait déjà, ce provider le rend enfin atteignable.
 * - Sonner (toasts) : le <Toaster /> est monté UNE fois ici ; n'importe
 *   quel composant peut ensuite appeler toast.success(...) sans câblage.
 *
 * Le fichier est isolé du layout car un provider a besoin de "use client"
 * (état React), alors que le layout racine reste un Server Component.
 */
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

import { Toaster } from "@/components/ui/sonner";

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
          teintés (vert succès, rouge erreur) plus lisibles en un
          coup d'oeil que le toast neutre par défaut. */}
      <Toaster position="bottom-right" richColors />
    </ThemeProvider>
  );
}
