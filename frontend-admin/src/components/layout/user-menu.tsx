/**
 * Menu utilisateur du header : avatar à initiales + menu déroulant.
 *
 * Au header plutôt qu'en pied de sidebar : le compte reste accessible en un
 * clic partout — y compris sur mobile, où la sidebar est un panneau fermé —
 * et la déconnexion, action rare, n'occupe plus d'espace permanent.
 *
 * Plus maigre que celui des deux portails : ni rôle, ni clinique, ni lien
 * « Réglages ». Un administrateur de plateforme n'a pas de rôle à afficher,
 * et la console n'a pas de préférences de compte.
 */
"use client";

import { LogOutIcon } from "lucide-react";

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
import { useCurrentAdmin } from "@/lib/auth/use-current-admin";
import { useLogoutAction } from "@/lib/auth/use-logout";

export function UserMenu() {
  const { data: admin } = useCurrentAdmin();
  const { logout, isPending: isLoggingOut } = useLogoutAction();

  // Sous l'AuthGuard la session est résolue ; ce garde ne couvre que
  // l'instant de transition (et évite les "?." en cascade plus bas).
  if (admin === undefined) return null;

  // charAt renvoie "" sur une chaîne vide : pas de garde supplémentaire.
  const initiales =
    `${admin.first_name.charAt(0)}${admin.last_name.charAt(0)}`.toUpperCase();

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
              initiales est l'avatar nominal, teinté marque. */}
          <AvatarFallback className="bg-brand text-xs font-medium text-brand-foreground">
            {initiales}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-56">
        {/* DropdownMenuGroup est OBLIGATOIRE autour du Label : chez Base UI,
            le label est un GroupLabel qui lit le contexte de son groupe et
            lève une erreur s'il n'en trouve pas. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex flex-col gap-0.5">
              <span className="truncate font-medium">
                {admin.first_name} {admin.last_name}
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {admin.email}
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                Administrateur de la plateforme
              </span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={isLoggingOut}
          onClick={logout}
        >
          {isLoggingOut ? <Spinner /> : <LogOutIcon />}
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
