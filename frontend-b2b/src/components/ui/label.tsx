/**
 * Composant Label (preset shadcn/ui).
 *
 * Libelle de champ de formulaire : un <label> natif stylé. L'association
 * label/champ (htmlFor + id) est essentielle en accessibilite : cliquer
 * le libelle donne le focus au champ, et les lecteurs d'ecran annoncent
 * le libelle quand le champ est focalise. Installe comme dependance du
 * composant Field (FieldLabel s'appuie dessus).
 */
"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
