/**
 * Sidebar de navigation du portail B2B.
 *
 * Trois zones : en-tête (nom de l'app + clinique connectée), navigation
 * (items filtrés selon les permissions de l'utilisateur), pied
 * (identité compacte + déconnexion). Client Component : elle lit la
 * session (useCurrentUser), la route active (usePathname) et les
 * permissions (useHasPermission).
 *
 * Rappel : masquer l'entrée "Réglages" à un ASV est une commodité d'UI,
 * PAS une protection — le backend re-vérifie clinic:manage sur chaque
 * endpoint, et la page /reglages affiche elle-même un état "accès
 * réservé" si on y navigue à la main.
 */
"use client";

import {
  CalendarDays,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useHasPermission, type Permission } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { useCurrentUser } from "@/lib/auth/use-current-user";

type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  // Permission requise pour VOIR l'entrée ; absente = visible par tous.
  permission?: Permission;
};

const NAV_ITEMS: NavItem[] = [
  { title: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard },
  { title: "Agenda", href: "/agenda", icon: CalendarDays },
  {
    title: "Réglages",
    href: "/reglages",
    icon: Settings,
    permission: "clinic:manage",
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  // Seule permission qui garde une entrée de nav aujourd'hui. Les hooks
  // devant être appelés inconditionnellement (règle des hooks : pas de
  // useHasPermission dans le .filter), on interroge chaque permission de
  // garde ICI ; en ajouter une = un appel de plus + un cas dans canSee.
  const canManageClinic = useHasPermission("clinic:manage");

  const canSee = (item: NavItem): boolean =>
    item.permission !== "clinic:manage" || canManageClinic;

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex flex-col gap-0.5 px-2 py-1.5">
          <span className="text-sm font-semibold">VetoLib Pro</span>
          {/* Nom de la clinique connectée : rappel permanent du tenant
              courant (utile pour un vétérinaire multi-cliniques). */}
          <span className="truncate text-xs text-muted-foreground">
            {user?.clinic_name}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.filter(canSee).map((item) => (
                <SidebarMenuItem key={item.href}>
                  {/* isActive par préfixe d'URL : /agenda reste actif sur
                      une future sous-page /agenda/xxx. Base UI n'a pas
                      asChild : render={<Link/>} substitue le <a> Next.js
                      au <button> en conservant style et accessibilité. */}
                  <SidebarMenuButton
                    isActive={pathname.startsWith(item.href)}
                    render={<Link href={item.href} />}
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

      <SidebarFooter>
        {/* Identité compacte : qui est connecté, avec quel rôle. */}
        {user !== undefined && (
          <div className="flex flex-col gap-0.5 px-2 py-1.5 text-sm">
            <span className="truncate font-medium">
              {user.first_name} {user.last_name}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {ROLE_LABELS[user.role]}
            </span>
          </div>
        )}
        <LogoutButton />
      </SidebarFooter>
    </Sidebar>
  );
}
