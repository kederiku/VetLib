/**
 * Composant Toaster (preset shadcn/ui, enveloppe de la librairie sonner).
 *
 * Monté UNE seule fois dans les providers ; n'importe quel composant
 * appelle ensuite toast.success(...) / toast.error(...) sans câblage.
 * Il lit useTheme() pour colorer les notifications selon le thème
 * courant, d'où son montage SOUS le ThemeProvider.
 *
 * Règle d'emploi dans ce projet : le toast INFORME que c'est fait
 * (« Rendez-vous annulé »), le bandeau Alert inline demande d'AGIR
 * (erreur de validation sous un champ). Voir la docstring de
 * lib/auth/server-errors.ts.
 */
"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
