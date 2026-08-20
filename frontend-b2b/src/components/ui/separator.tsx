/**
 * Composant Separator (preset shadcn/ui, variante Base UI).
 *
 * Trait de separation horizontal ou vertical. La primitive Base UI pose
 * les bons attributs ARIA (role="separator") pour que la separation soit
 * comprise par les technologies d'assistance. Installe comme dependance
 * du composant Field (FieldSeparator s'appuie dessus).
 */
"use client"

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"

import { cn } from "@/lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
