/**
 * État vide standard : icône + titre + description + action optionnelle.
 *
 * Enveloppe fine du composant shadcn <Empty> pour que tous les écrans
 * parlent le même langage visuel. Quand une action de création existe,
 * la passer en `action` : un état vide DOIT proposer la sortie
 * ("Aucun rendez-vous" -> bouton "Prendre rendez-vous").
 *
 * Attention à ne PAS réutiliser un état vide de premier usage ("Ajoutez
 * votre premier compagnon") pour un résultat de filtre vide : le ton
 * engageant devient un contresens quand l'utilisateur a simplement
 * filtré trop fin.
 */
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  /** Icône lucide déjà instanciée, ex. <CalendarDaysIcon /> (stylée par EmptyMedia). */
  icon: React.ReactNode;
  title: string;
  description?: string;
  /** CTA rendu sous le texte (bouton de création la plupart du temps). */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Empty className={className ?? "border"}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description !== undefined && (
          <EmptyDescription>{description}</EmptyDescription>
        )}
      </EmptyHeader>
      {action !== undefined && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
