/**
 * Carte de liste des réglages : le squelette commun aux onglets "Types
 * de rendez-vous" et "Praticiens".
 *
 * Les deux onglets étaient dupliqués à ~90 % (mêmes blocs
 * chargement/erreur/vide, même table, même bouton de création) : ce
 * composant PRÉSENTATIONNEL factorise la coquille — le parent garde sa
 * query, son dialog et sa table (passée en children). Le CTA de
 * création vit dans <CardAction>, en haut à droite de la carte, comme
 * le CTA principal de l'agenda ; l'état vide le répète en action de
 * sortie (un état vide doit toujours proposer la suite).
 */
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function SettingsListCard({
  title,
  description,
  createLabel,
  onCreate,
  isPending,
  isError,
  errorTitle,
  onRetry,
  isEmpty,
  emptyState,
  children,
}: {
  title: string;
  description: string;
  /** Libellé du bouton de création ("Nouveau type"...). */
  createLabel: string;
  /** Ouvre le dialog de création du parent. */
  onCreate: () => void;
  /** État de la query du parent (squelettes de chargement). */
  isPending: boolean;
  /** Échec de la query : ErrorState avec bouton Réessayer. */
  isError: boolean;
  /** Phrase d'erreur spécifique ("Impossible de charger les..."). */
  errorTitle: string;
  /** Relance la query (refetch TanStack). */
  onRetry: () => void;
  /** Liste chargée mais vide : EmptyState avec le CTA de création. */
  isEmpty: boolean;
  emptyState: {
    /** Icône lucide déjà instanciée, ex. <ClipboardListIcon />. */
    icon: React.ReactNode;
    title: string;
    description: string;
  };
  /** La table de données du parent (rendue quand la liste est non vide). */
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Button onClick={onCreate}>{createLabel}</Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {isError && <ErrorState title={errorTitle} onRetry={onRetry} />}

        {!isPending &&
          !isError &&
          (isEmpty ? (
            <EmptyState
              icon={emptyState.icon}
              title={emptyState.title}
              description={emptyState.description}
              action={<Button onClick={onCreate}>{createLabel}</Button>}
            />
          ) : (
            children
          ))}
      </CardContent>
    </Card>
  );
}
