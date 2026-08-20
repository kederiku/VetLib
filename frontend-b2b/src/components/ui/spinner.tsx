/**
 * Composant Spinner (preset shadcn/ui).
 *
 * Simple icone lucide Loader2 qui tourne en CSS (animate-spin). role=
 * "status" + aria-label : les lecteurs d'ecran savent qu'un traitement
 * est en cours. Place dans un bouton de formulaire pendant la soumission
 * pour montrer que la requete part vers l'API.
 */
import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon data-slot="spinner" role="status" aria-label="Loading" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
