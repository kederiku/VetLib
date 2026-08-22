/**
 * Header des pages connectées du back-office.
 *
 * Trois repères, comme dans les deux portails : OÙ je suis (titre de la page
 * courante, dérivé de la route), et QUI je suis (menu utilisateur + bascule
 * de thème).
 *
 * Pas de CTA global ici, contrairement au portail clinique : les créations du
 * back-office sont toutes CONTEXTUELLES à un écran (une clinique se crée
 * depuis la liste des cliniques, un gérant depuis la fiche d'une clinique).
 * Un bouton global « Nouveau… » n'aurait pas de sens unique.
 */
"use client";

import { usePathname } from "next/navigation";

import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { pageTitleForPath } from "@/lib/navigation";

export function SiteHeader() {
  const pathname = usePathname();
  const pageTitle = pageTitleForPath(pathname);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-4" />
      {/* Titre dérivé de la route via la source de vérité de navigation :
          aucun état à synchroniser. */}
      {pageTitle !== null && (
        <span className="text-sm font-medium">{pageTitle}</span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
