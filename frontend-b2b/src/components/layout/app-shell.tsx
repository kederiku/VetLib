/**
 * Coquille des pages connectées : sidebar de navigation + zone de
 * contenu.
 *
 * Montée UNE fois par le layout du groupe (protected), sous l'AuthGuard :
 * naviguer entre Tableau de bord, Agenda et Réglages ne remonte donc ni
 * la sidebar ni son état (ouverte/repliée, persisté en cookie par le
 * SidebarProvider). Server Component : il ne fait qu'assembler des
 * composants clients (sidebar.tsx est "use client"), aucun état ici.
 */
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    // SidebarProvider : contexte partagé sidebar <-> bouton d'ouverture
    // (état ouvert/replié, bascule mobile en Sheet).
    <SidebarProvider>
      <AppSidebar />
      {/* SidebarInset : le <main> qui occupe le reste de l'écran. */}
      <SidebarInset>
        {/* En-tête léger et sticky : le bouton pour replier/ouvrir la
            sidebar reste accessible même après un long défilement. */}
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
