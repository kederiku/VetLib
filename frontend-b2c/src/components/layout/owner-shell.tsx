/**
 * OwnerShell : la coquille de navigation des pages connectees du portail
 * proprietaires (groupe de routes (protected)).
 *
 * Un header sticky avec le logo et les trois sections du portail :
 * Mes rendez-vous, Mes animaux, Mon compte. Client Component car il lit
 * usePathname() pour marquer le lien actif (aria-current + fond) ; le
 * contenu de page, lui, est rendu en dessous tel quel.
 *
 * Sur mobile, seuls les icones restent visibles (libelles hidden
 * sm:inline) : la barre tient sur une ligne sans menu burger.
 */
"use client";

import { CalendarDays, CircleUser, PawPrint } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Les trois entrees de navigation, dans l'ordre d'affichage. Declarees
// hors composant : la liste est statique, inutile de la reconstruire a
// chaque rendu.
const NAV_ITEMS = [
  { href: "/rendez-vous", label: "Mes rendez-vous", icon: CalendarDays },
  { href: "/animaux", label: "Mes animaux", icon: PawPrint },
  { href: "/account", label: "Mon compte", icon: CircleUser },
] as const;

export function OwnerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-svh flex-col">
      {/* sticky + backdrop-blur : la barre reste visible au defilement,
          legerement translucide au-dessus du contenu. z-40 : sous les
          dialogues (z-50) mais au-dessus du contenu courant. */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-2 px-4">
          {/* Le logo renvoie vers la page principale du portail connecte :
              la liste des rendez-vous. */}
          <Link
            href="/rendez-vous"
            className="flex items-center gap-2 font-bold tracking-tight"
          >
            <PawPrint className="size-5 text-brand" aria-hidden />
            VetoLib
          </Link>

          {/* aria-label : nomme la zone pour les lecteurs d'ecran (il y a
              deux blocs de liens dans le header, logo compris). */}
          <nav aria-label="Navigation principale" className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              // startsWith et non === : /rendez-vous/nouveau doit garder
              // "Mes rendez-vous" actif (sous-page de la section).
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Button
                  key={item.href}
                  variant="ghost"
                  nativeButton={false}
                  // aria-current="page" : signale le lien actif aux
                  // lecteurs d'ecran ; le style (fond muted) ne suffirait
                  // pas, il est purement visuel.
                  render={
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                    />
                  }
                  className={cn(isActive && "bg-muted text-foreground")}
                >
                  <Icon aria-hidden />
                  {/* Libelle masque sur mobile, icone toujours visible. */}
                  <span className="hidden sm:inline">{item.label}</span>
                </Button>
              );
            })}
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}
