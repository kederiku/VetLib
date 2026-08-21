/**
 * Menu utilisateur du header : avatar à initiales + menu déroulant.
 *
 * Remplace l'ancien pied de sidebar (identité en texte + bouton de
 * déconnexion toujours visible). Au header, le compte reste accessible
 * en un clic partout — y compris sur mobile où la sidebar est un
 * panneau fermé par défaut — et la déconnexion, action rare, n'occupe
 * plus d'espace permanent à l'écran.
 */
"use client";

import { LogOutIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useHasPermission } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useLogoutAction } from "@/lib/auth/use-logout";

export function UserMenu() {
  const { data: user } = useCurrentUser();
  const canManageClinic = useHasPermission("clinic:manage");
  const { logout, isPending: isLoggingOut } = useLogoutAction();

  // Sous l'AuthGuard la session est résolue ; ce garde ne couvre que
  // l'instant de transition (et évite les "?." en cascade plus bas).
  if (user === undefined) {
    return null;
  }

  // "CD" pour Cédric Delagrée : initiales du prénom et du nom. charAt
  // renvoie "" sur une chaîne vide, pas d'erreur possible.
  const initials =
    `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Menu du compte"
            className="rounded-full"
          />
        }
      >
        <Avatar size="sm">
          {/* Pas de photo de profil dans le produit : le fallback à
              initiales est l'avatar nominal, teinté marque (indigo). */}
          <AvatarFallback className="bg-brand text-xs font-medium text-brand-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-56">
        {/* Identité complète : ce que l'ancien pied de sidebar montrait,
            plus l'email (utile quand un poste d'accueil est partagé).
            DropdownMenuGroup est OBLIGATOIRE autour du Label : chez Base
            UI, le label est un GroupLabel qui lit le contexte de son
            groupe et lève une erreur s'il n'en trouve pas. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex flex-col gap-0.5">
              <span className="truncate font-medium">
                {user.first_name} {user.last_name}
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {user.email}
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {ROLE_LABELS[user.role]} — {user.clinic_name}
              </span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        {canManageClinic && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/reglages" />}>
              <SettingsIcon />
              Réglages
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={isLoggingOut}
          // closeOnClick={false} n'est pas nécessaire : si le logout
          // échoue, un toast l'annonce (voir useLogoutAction).
          onClick={logout}
        >
          {isLoggingOut ? <Spinner /> : <LogOutIcon />}
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
