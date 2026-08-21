/**
 * Header des pages connectées.
 *
 * L'ancien header ne contenait que le bouton de repli de la sidebar :
 * 48 px de vide. Celui-ci porte les trois repères globaux d'un outil
 * métier : OÙ je suis (titre de la page courante), QUOI faire (CTA
 * "Nouveau rendez-vous" accessible partout) et QUI je suis (menu
 * utilisateur + bascule de thème). Client Component : il lit la route
 * (usePathname) et les permissions.
 */
"use client";

import { usePathname } from "next/navigation";

import { QuickNewAppointment } from "@/components/layout/quick-new-appointment";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useHasPermission } from "@/lib/auth/permissions";
import { pageTitleForPath } from "@/lib/navigation";

export function SiteHeader() {
  const pathname = usePathname();
  const canWriteAppointments = useHasPermission("appointment:write");
  const pageTitle = pageTitleForPath(pathname);

  // Pas de double CTA : la toolbar de l'agenda a déjà son bouton
  // "Nouveau rendez-vous" au même niveau visuel — sur cet écran, le
  // header s'efface.
  const showNewAppointment = canWriteAppointments && pathname !== "/agenda";

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-4" />
      {/* Titre de la page courante : dérivé de la route via la source de
          vérité de navigation — pas d'état à synchroniser. */}
      {pageTitle !== null && (
        <span className="text-sm font-medium">{pageTitle}</span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {showNewAppointment && <QuickNewAppointment />}
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
