/**
 * Badge de statut, partagé par les trois listes.
 *
 * Un seul endroit décide du couple (variante, libellé) pour un booléen
 * `is_active`. Sans lui, chaque écran choisirait sa nuance de rouge et son
 * vocabulaire — « Inactif » ici, « Désactivé » là — et l'utilisateur
 * croirait à deux états différents.
 *
 * Le libellé DÉPEND de ce qu'on décrit : une clinique est « suspendue », un
 * compte est « désactivé ». Ce n'est pas un détail de traduction, ce sont
 * deux actions distinctes dans l'interface.
 */
import { Badge } from "@/components/ui/badge";

export function StatusBadge({
  actif,
  libelleActif = "Actif",
  libelleInactif = "Désactivé",
}: {
  actif: boolean;
  libelleActif?: string;
  libelleInactif?: string;
}) {
  return (
    <Badge variant={actif ? "secondary" : "destructive"}>
      {actif ? libelleActif : libelleInactif}
    </Badge>
  );
}
