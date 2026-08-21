/**
 * Coquille des pages connectées : sidebar de navigation + header + zone
 * de contenu.
 *
 * Montée UNE fois par le layout du groupe (protected), sous l'AuthGuard :
 * naviguer entre Tableau de bord, Agenda et Réglages ne remonte donc ni
 * la sidebar ni son état. Server Component ASYNC : il lit le cookie
 * d'état de la sidebar pour rendre le bon état dès le premier HTML.
 */
import { cookies } from "next/headers";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { SiteHeader } from "@/components/layout/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export async function AppShell({ children }: { children: React.ReactNode }) {
  // Le SidebarProvider ECRIT le cookie "sidebar_state" à chaque repli/
  // dépli, mais ne le relit pas : c'est à nous de le lui rendre via
  // defaultOpen, sinon la sidebar se rouvre à chaque rechargement (flash
  // ouvert -> replié). cookies() est asynchrone depuis Next 15/16, d'où
  // le composant async. Cookie absent (première visite) => ouverte.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    // TooltipProvider : les tooltips du rail replié doivent apparaître
    // immédiatement (delay 0, défaut du provider du projet) — sans
    // provider, Base UI applique son délai standard, trop lent pour
    // identifier des icônes de navigation.
    <TooltipProvider>
      {/* SidebarProvider : contexte partagé sidebar <-> bouton d'ouverture
          (état ouvert/replié, bascule mobile en Sheet). */}
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
        {/* SidebarInset : le <main> qui occupe le reste de l'écran. */}
        <SidebarInset>
          <SiteHeader />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
