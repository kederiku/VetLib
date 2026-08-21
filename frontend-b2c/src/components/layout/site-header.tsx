/**
 * Header des pages connectées.
 *
 * Il porte les trois repères globaux du portail : OÙ je suis (titre de
 * la page courante, dérivé de la route), QUOI faire (le CTA « Prendre
 * rendez-vous », accessible depuis n'importe quel écran) et QUI je suis
 * (menu du compte + bascule de thème). Client Component : il lit la
 * route via usePathname.
 *
 * Le CTA est inliné plutôt qu'extrait dans son propre fichier : côté
 * propriétaire c'est un simple lien, sans requête ni dialogue.
 */
"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { pageTitleForPath } from "@/lib/navigation";

/**
 * Écrans qui portent DÉJÀ leur propre bouton « Prendre rendez-vous »,
 * dans leur en-tête de page ou leur contenu.
 *
 * Le CTA du header est un filet : il rend l'action atteignable depuis
 * « Mes animaux » ou « Mon compte », où rien ne la propose. Sur les
 * écrans qui l'affichent déjà, le répéter à 20 px d'écart est du bruit —
 * et sur le tunnel lui-même, une absurdité.
 */
const ECRANS_AVEC_CTA_PROPRE = ["/tableau-de-bord", "/rendez-vous"];

export function SiteHeader() {
  const pathname = usePathname();
  const pageTitle = pageTitleForPath(pathname);

  const showBookingCta = !ECRANS_AVEC_CTA_PROPRE.some((href) =>
    pathname.startsWith(href),
  );

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
        {showBookingCta && (
          <Button
            size="sm"
            nativeButton={false}
            // aria-label plutot qu'un second <span sr-only> : les deux
            // spans seraient TOUS DEUX dans l'arbre d'accessibilite
            // (hidden sm:inline n'est que du CSS), et le nom accessible
            // serait annonce en double.
            aria-label="Prendre rendez-vous"
            render={<Link href="/rendez-vous/nouveau" />}
          >
            <PlusIcon data-icon="inline-start" aria-hidden />
            {/* Sur mobile, l'icône seule : le header n'a pas la place. */}
            <span className="hidden sm:inline">Prendre rendez-vous</span>
          </Button>
        )}
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
