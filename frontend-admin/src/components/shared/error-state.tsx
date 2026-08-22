/**
 * État d'erreur de chargement standard : bandeau rouge + bouton Réessayer.
 *
 * Généralise le pattern qui n'existait que dans l'agenda : partout où
 * une query échoue, l'utilisateur doit pouvoir relancer sans F5. Le
 * bouton est OBLIGATOIRE (prop onRetry non optionnelle) : un état
 * d'erreur sans issue est une impasse d'UX. Brancher onRetry sur le
 * refetch de la query TanStack concernée.
 */
"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ErrorState({
  title,
  description = "Vérifiez votre connexion, puis réessayez.",
  onRetry,
}: {
  /** Phrase décrivant CE qui n'a pas pu charger ("Impossible de charger l'agenda."). */
  title: string;
  description?: string;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <p>{description}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      </AlertDescription>
    </Alert>
  );
}
