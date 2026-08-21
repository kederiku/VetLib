/**
 * Coquille des pages connectées : sidebar de navigation + header + zone
 * de contenu.
 *
 * Montée UNE fois par le layout du groupe (protected), sous l'AuthGuard :
 * naviguer entre le tableau de bord, les rendez-vous et les animaux ne
 * remonte donc ni la sidebar ni son état.
 *
 * Server Component ASYNC : il lit le cookie d'état de la sidebar pour
 * rendre le bon état dès le premier HTML. Il ne peut pas être monté dans
 * un test unitaire (next/headers exige un contexte de requête) — sa
 * moitié cliente est reconstituée par l'option `withAppShell` de
 * src/test/render.tsx, où elle est exercée par les tests du header et de
 * la sidebar. La lecture du cookie, elle, se vérifie au navigateur :
 * replier la sidebar, recharger, elle doit rester repliée.
 *
 * SidebarInset rend un <main> : aucune page ne doit donc rendre le sien,
 * sous peine de deux landmarks « main » imbriqués.
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
  //
  // A savoir en développement local : ce cookie n'est pas cloisonné par
  // port. localhost:3000 (ce portail) et localhost:3001 (l'espace
  // clinique) le partagent donc — replier la sidebar de l'un replie
  // celle de l'autre. Sans conséquence en production, où les domaines
  // sont distincts, mais déroutant pendant les essais.
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
