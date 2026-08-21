/**
 * Sidebar de navigation du portail B2B.
 *
 * Deux zones : en-tête (marque + clinique connectée) et navigation
 * (items filtrés selon les permissions). L'identité et la déconnexion
 * vivent désormais dans le menu utilisateur du header (voir
 * user-menu.tsx) : la sidebar est purement de la navigation.
 *
 * collapsible="icon" : le repli laisse un RAIL d'icônes (tooltips au
 * survol) au lieu de faire disparaître toute la navigation comme le
 * mode offcanvas par défaut. Client Component : elle lit la session
 * (useCurrentUser) et la route active (usePathname).
 *
 * Rappel : masquer l'entrée "Réglages" à un ASV est une commodité d'UI,
 * PAS une protection — le backend re-vérifie clinic:manage sur chaque
 * endpoint, et la page /reglages affiche elle-même un état "accès
 * réservé" si on y navigue à la main.
 */
"use client";

import { StethoscopeIcon } from "lucide-react";
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
import { hasPermission } from "@/lib/auth/permissions";
import { NAV_ITEMS } from "@/lib/navigation";
import { useCurrentUser } from "@/lib/auth/use-current-user";

export function AppSidebar() {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();

  // hasPermission est une fonction PURE (pas un hook) : on peut filtrer
  // la liste entière sans violer la règle des hooks. Ajouter un écran
  // gardé = une entrée dans NAV_ITEMS, rien à changer ici.
  const visibleItems = NAV_ITEMS.filter(
    (item) => item.permission === undefined || hasPermission(user, item.permission),
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* size="lg" : la variante prévue par le preset pour un
                en-tête de marque — en mode rail, elle se réduit d'elle-même
                à la pastille carrée. Le lien renvoie à l'écran d'accueil
                connecté. */}
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground">
                <StethoscopeIcon className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">VetoLib Pro</span>
                {/* Nom de la clinique connectée : rappel permanent du
                    tenant courant (utile pour un vétérinaire
                    multi-cliniques). */}
                <span className="truncate text-xs text-muted-foreground">
                  {user?.clinic_name}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Clinique</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  {/* isActive par préfixe d'URL : /agenda reste actif sur
                      une future sous-page /agenda/xxx. Base UI n'a pas
                      asChild : render={<Link/>} substitue le <a> Next.js
                      au <button> en conservant style et accessibilité.
                      tooltip : le preset ne l'affiche qu'en mode rail
                      replié, où le libellé est masqué. */}
                  <SidebarMenuButton
                    isActive={pathname.startsWith(item.href)}
                    render={<Link href={item.href} />}
                    tooltip={item.title}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Poignée au bord de la sidebar : cliquer la replie/déplie sans
          viser le bouton du header. */}
      <SidebarRail />
    </Sidebar>
  );
}
