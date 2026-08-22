/**
 * Bouton de bascule clair/sombre/système du header.
 *
 * Le thème sombre existe depuis le début dans globals.css (bloc .dark) ;
 * ce composant est simplement l'interrupteur qui manquait. Il s'appuie
 * sur next-themes (ThemeProvider monté dans providers.tsx) : setTheme
 * persiste le choix en localStorage et pose la classe "dark" sur <html>.
 */
"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      {/* Base UI : pas d'asChild — le trigger REND le bouton via `render`. */}
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Changer de thème" />
        }
      >
        {/* Les DEUX icônes sont toujours dans le HTML, le CSS n'en montre
            qu'une (dark:hidden / hidden dark:block). Astuce anti-flash :
            le serveur ne connaît pas le thème du visiteur, donc rendre
            conditionnellement une seule icône créerait un écart
            d'hydratation ; ici le HTML est identique des deux côtés et
            c'est la classe "dark" (posée avant la peinture) qui choisit. */}
        <SunIcon className="size-4 dark:hidden" />
        <MoonIcon className="hidden size-4 dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Clair
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Sombre
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          Système
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
