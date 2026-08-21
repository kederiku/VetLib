/**
 * Menu du compte, dans le header : avatar à initiales + menu déroulant.
 *
 * Remplace la carte « Mon compte » de l'ancienne page /account, où la
 * déconnexion était enfouie sous un formulaire de profil. Au header, le
 * compte reste accessible en un clic partout — y compris sur mobile, où
 * la sidebar est un tiroir fermé — et la déconnexion, action rare,
 * n'occupe plus d'espace permanent à l'écran.
 */
"use client";

import { CircleUserIcon, LogOutIcon } from "lucide-react";
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
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useLogoutAction } from "@/lib/auth/use-logout";

export function UserMenu() {
  const { data: owner } = useCurrentUser();
  const { logout, isPending: isLoggingOut } = useLogoutAction();

  // Sous l'AuthGuard la session est résolue ; ce garde ne couvre que
  // l'instant de transition (et évite un avatar fantôme clignotant).
  if (owner === undefined) {
    return null;
  }

  // "MD" pour Marie Dupont. charAt renvoie "" sur une chaîne vide, pas
  // d'erreur possible.
  const initials =
    `${owner.first_name.charAt(0)}${owner.last_name.charAt(0)}`.toUpperCase();

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
              initiales est l'avatar nominal, teinté marque (émeraude). */}
          <AvatarFallback className="bg-brand text-xs font-medium text-brand-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-56">
        {/* DropdownMenuGroup est OBLIGATOIRE autour du Label : chez Base
            UI, le label est un GroupLabel qui lit le contexte de son
            groupe et LÈVE une erreur s'il n'en trouve pas. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex flex-col gap-0.5">
              <span className="truncate font-medium">
                {owner.first_name} {owner.last_name}
              </span>
              {/* L'email a son utilité propre : sur un ordinateur
                  partagé, c'est ce qui permet de vérifier d'un coup
                  d'oeil quel compte est réellement ouvert. */}
              <span className="truncate text-xs font-normal text-muted-foreground">
                {owner.email}
              </span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/mon-compte" />}>
          <CircleUserIcon />
          Mon compte
        </DropdownMenuItem>

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
