/**
 * Composant Button (preset shadcn/ui, variante Base UI).
 *
 * Philosophie shadcn : le composant est COPIÉ dans le projet (pas importé
 * d'une librairie), donc librement modifiable. Il assemble trois briques :
 * - Base UI (@base-ui/react) : la primitive accessible non stylée, qui
 *   gère le comportement (focus, clavier, états ARIA) ;
 * - CVA (class-variance-authority) : déclare les variantes visuelles
 *   (variant/size) comme des combinaisons de classes Tailwind typées ;
 * - cn() (clsx + tailwind-merge) : fusionne les classes en laissant la
 *   prop `className` de l'appelant écraser proprement les défauts.
 */
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// cva(base, { variants }) : le 1er argument est le socle commun à toutes
// les variantes (focus ring, état disabled, taille des icônes SVG...).
// Chaque combinaison variant x size ajoute ensuite ses classes propres.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-4xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      // Variantes sémantiques : default (action principale), outline,
      // secondary, ghost (discret), destructive (suppression), link.
      // Les couleurs viennent des tokens CSS du thème (--primary, etc.),
      // ce qui rend le composant compatible light/dark automatiquement.
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-transparent dark:hover:bg-input/30",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // Les sélecteurs has-data-[icon=...] resserrent le padding du côté
      // où une icône est présente ; les tailles "icon-*" donnent des
      // boutons carrés (icône seule, sans libellé).
      size: {
        default:
          "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Bouton de l'application. Usage : <Button variant="outline" size="sm">.
 *
 * Le type des props combine celles de la primitive Base UI (onClick,
 * disabled, render...) et celles inférées des variantes CVA : TypeScript
 * refuse donc un variant/size inexistant.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      // data-slot : marqueur ciblable en CSS par les composants parents
      // (convention shadcn pour styler un enfant sans le connaître).
      data-slot="button"
      // className est passé en dernier à cn() : les classes de l'appelant
      // gagnent sur celles des variantes en cas de conflit Tailwind.
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

// buttonVariants est aussi exporté pour styler "comme un bouton" un autre
// élément (ex : un <Link> Next.js) sans dupliquer les classes.
export { Button, buttonVariants }
