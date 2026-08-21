/**
 * Sidebar de navigation du portail propriétaires.
 *
 * Deux zones : un en-tête de marque (qui rappelle qui est connecté) et
 * les quatre sections du portail, lues depuis lib/navigation.ts.
 * Contrairement au portail clinique, aucune entrée n'est filtrée : un
 * propriétaire n'a pas de rôle, il voit tout son espace.
 *
 * collapsible="icon" : le repli laisse un RAIL d'icônes (tooltips au
 * survol) au lieu de faire disparaître toute la navigation comme le mode
 * offcanvas par défaut. Client Component : il lit la session
 * (useCurrentUser) et la route active (usePathname).
 *
 * Deux ajouts par rapport au preset shadcn, tous deux d'accessibilité :
 * un <nav> nommé (le preset n'émet aucun landmark de navigation) et
 * aria-current="page" sur l'entrée active (le data-active du preset est
 * purement visuel, un lecteur d'écran ne l'annonce pas).
 */
"use client";

import { PawPrintIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { NAV_ITEMS } from "@/lib/navigation";

export function AppSidebar() {
  const pathname = usePathname();
  const { data: owner } = useCurrentUser();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* size="lg" : la variante prévue par le preset pour un
                en-tête de marque — en mode rail, elle se réduit d'elle-même
                à la pastille carrée. Le lien renvoie à l'écran d'accueil
                connecté. */}
            <SidebarMenuButton size="lg" render={<Link href="/tableau-de-bord" />}>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground">
                <PawPrintIcon className="size-4" aria-hidden />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">VetoLib</span>
                {/* Qui est connecté : utile sur un ordinateur familial,
                    où plusieurs comptes se succèdent. Le repli "Espace
                    propriétaire" évite un saut de mise en page pendant
                    la résolution de la session. */}
                <span className="truncate text-xs text-muted-foreground">
                  {owner !== undefined
                    ? `${owner.first_name} ${owner.last_name}`
                    : "Espace propriétaire"}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Le preset n'émet aucun landmark : sans ce <nav> nommé, un
            lecteur d'écran ne pourrait pas sauter directement à la
            navigation. */}
        <nav aria-label="Navigation principale">
          <SidebarGroup>
            <SidebarGroupLabel>Mon espace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => {
                  // startsWith et non === : /animaux/<id> doit garder
                  // "Mes animaux" actif (sous-page de la section).
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      {/* Base UI n'a pas asChild : render={<Link/>}
                          substitue le <a> Next.js au <button> en
                          conservant style et accessibilité. tooltip : le
                          preset ne l'affiche qu'en mode rail replié, où
                          le libellé est masqué. */}
                      <SidebarMenuButton
                        isActive={isActive}
                        render={
                          <Link
                            href={item.href}
                            aria-current={isActive ? "page" : undefined}
                          />
                        }
                        tooltip={item.title}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>

      {/* Poignée au bord de la sidebar : cliquer la replie/déplie sans
          viser le bouton du header. tabIndex={-1} dans le preset, et
          c'est VOULU : elle dupliquerait le SidebarTrigger dans l'ordre
          de tabulation. */}
      <SidebarRail />
    </Sidebar>
  );
}
