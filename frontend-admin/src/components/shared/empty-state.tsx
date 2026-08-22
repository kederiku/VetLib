/**
 * État vide standard : icône + titre + description + action optionnelle.
 *
 * Enveloppe fine du composant shadcn <Empty> pour que tous les écrans
 * (agenda, réglages, tableau de bord) parlent le même langage visuel —
 * avant lui, la moitié des listes affichaient un simple <p> gris. Quand
 * une action de création existe, la passer en `action` : un état vide
 * DOIT proposer la sortie ("Aucun type" -> bouton "Créer le premier").
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
}: {
  /** Icône lucide déjà instanciée, ex. <CalendarPlusIcon /> (stylée par EmptyMedia). */
  icon: React.ReactNode;
  title: string;
  description?: string;
  /** CTA rendu sous le texte (bouton de création la plupart du temps). */
  action?: React.ReactNode;
}) {
  return (
    <Empty className="border">
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
