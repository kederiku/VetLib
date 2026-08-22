/**
 * Sidebar de navigation du back-office plateforme.
 *
 * Deux zones : en-tête de marque et navigation. L'identité et la déconnexion
 * vivent dans le menu utilisateur du header (user-menu.tsx) : la sidebar est
 * purement de la navigation.
 *
 * Aucun filtrage par permission, contrairement au portail clinique : cet
 * espace n'a qu'un seul rôle, un jeton valide ouvre tout. Le jour où un rôle
 * en lecture seule apparaîtra, on recopiera le champ `permission` de NAV_ITEMS
 * du B2B — et ce sera une décision, pas une extension mécanique.
 *
 * collapsible="icon" : le repli laisse un RAIL d'icônes (tooltips au survol)
 * au lieu de faire disparaître toute la navigation.
 */
"use client";

import { ShieldCheckIcon } from "lucide-react";
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
import { NAV_ITEMS } from "@/lib/navigation";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* size="lg" : la variante prévue par le preset pour un en-tête
                de marque — en mode rail, elle se réduit d'elle-même à la
                pastille carrée. */}
            <SidebarMenuButton size="lg" render={<Link href="/tableau-de-bord" />}>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground">
                <ShieldCheckIcon className="size-4" aria-hidden />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">VetoLib Admin</span>
                <span className="truncate text-xs text-muted-foreground">
                  Console de la plateforme
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Repère nommé pour les lecteurs d'écran : le preset shadcn n'émet
            aucun <nav>, donc aucune façon de « sauter à la navigation ». */}
        <nav aria-label="Navigation principale">
          <SidebarGroup>
            <SidebarGroupLabel>Plateforme</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => {
                  // Actif par PRÉFIXE : la fiche /cliniques/<uuid> garde
                  // « Cliniques » en surbrillance.
                  const estActif = pathname.startsWith(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      {/* Base UI n'a pas asChild : render={<Link/>} substitue
                          le <a> Next.js au <button> en conservant style et
                          accessibilité. tooltip : affiché par le preset
                          uniquement en mode rail replié. */}
                      <SidebarMenuButton
                        isActive={estActif}
                        render={
                          <Link
                            href={item.href}
                            // data-active du preset est purement visuel :
                            // aria-current est ce qu'annonce un lecteur
                            // d'écran.
                            aria-current={estActif ? "page" : undefined}
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

      {/* Poignée au bord de la sidebar : replie/déplie sans viser le bouton
          du header. */}
      <SidebarRail />
    </Sidebar>
  );
}
