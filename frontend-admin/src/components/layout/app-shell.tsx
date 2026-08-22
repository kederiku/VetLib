/**
 * Coquille des pages connectées du back-office : sidebar + header + contenu.
 *
 * Montée UNE fois par le layout du groupe (protected), sous l'AuthGuard :
 * naviguer d'un écran à l'autre ne remonte ni la sidebar ni son état.
 * Server Component ASYNC : il lit le cookie d'état de la sidebar pour rendre
 * le bon état dès le premier HTML.
 *
 * À savoir en développement : le cookie `sidebar_state` est posé par le
 * preset shadcn sur `path=/`, et les cookies IGNORENT le port. Replier la
 * sidebar ici la repliera donc aussi dans les deux portails au prochain
 * chargement. Ce couplage existe déjà entre :3000 et :3001, il est purement
 * cosmétique, et il disparaît en production (trois hôtes distincts) : le
 * corriger imposerait de patcher un fichier de `ui/`, que la CLI shadcn
 * écrase — un coût permanent pour un bénéfice nul.
 */
import { cookies } from "next/headers";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { SiteHeader } from "@/components/layout/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export async function AppShell({ children }: { children: React.ReactNode }) {
  // Le SidebarProvider ÉCRIT le cookie à chaque repli/dépli mais ne le relit
  // pas : c'est à nous de le lui rendre via defaultOpen, sinon la sidebar se
  // rouvre à chaque rechargement (flash ouvert -> replié). cookies() est
  // asynchrone depuis Next 15/16, d'où le composant async.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    // TooltipProvider : les tooltips du rail replié doivent apparaître
    // immédiatement — sans provider, Base UI applique son délai standard,
    // trop lent pour identifier des icônes de navigation.
    <TooltipProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
        {/* SidebarInset : le <main> qui occupe le reste de l'écran. C'est
            lui le conteneur de page -- un écran ne déclare JAMAIS son
            propre <main> ni sa propre largeur (voir PageContainer). */}
        <SidebarInset>
          <SiteHeader />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
