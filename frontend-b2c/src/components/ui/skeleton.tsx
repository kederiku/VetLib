/**
 * Composant Skeleton (preset shadcn/ui).
 *
 * Bloc gris anime (animate-pulse) qui reserve la place du contenu pendant
 * un chargement. Preferable a un spinner plein ecran : la page garde sa
 * structure, donc pas de "saut" visuel quand les donnees arrivent. Utilise
 * par les gardes d'authentification le temps de verifier la session.
 */
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-2xl bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
