/**
 * Confirmation de suspension d'une clinique — avec saisie du nom.
 *
 * C'est la SEULE action de la console qui exige de retaper un nom, et ce
 * n'est pas un caprice : suspendre une clinique coupe l'accès de N personnes
 * d'un coup, sans qu'elles soient prévenues et sans qu'aucune d'entre elles
 * puisse se dépanner. Le coût d'un clic accidentel — une clinique entière à
 * l'arrêt en pleine journée de consultations — est sans commune mesure avec
 * celui de taper vingt caractères.
 *
 * Et c'est le seul cas qui remplit ce critère. Mettre la même saisie partout
 * produirait exactement l'inverse de l'effet recherché : des utilisateurs qui
 * la remplissent en pilote automatique, y compris ici.
 *
 * La réactivation, elle, n'a pas de saisie : action réparatrice, réversible,
 * sans perte. La mettre derrière le même garde-fou banaliserait le geste et
 * ferait perdre son sens à celui de la suspension.
 */
"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ApiError } from "@/lib/api/errors";
import { useSuspendAdminClinic } from "@/lib/api/generated/admin-clinics/admin-clinics";
import { messageForApiError } from "@/lib/auth/server-errors";
import { useInvaliderCliniques } from "@/lib/clinics/mutations";

export function ClinicSuspendDialog({
  clinicId,
  nom,
  effectif,
  open,
  onOpenChange,
}: {
  clinicId: string;
  nom: string;
  effectif: number;
  open: boolean;
  onOpenChange: (ouvert: boolean) => void;
}) {
  const [saisie, setSaisie] = useState("");
  const invalider = useInvaliderCliniques();
  const suspension = useSuspendAdminClinic<ApiError>();

  const fermer = () => {
    setSaisie("");
    onOpenChange(false);
  };

  const confirmer = async () => {
    try {
      await suspension.mutateAsync({ clinicId });
      await invalider(clinicId);
      toast.success("Accès suspendu");
    } catch (erreur) {
      // Toast et non bandeau : le dialogue se ferme, il n'y aurait nulle
      // part où afficher un message inline. Un 409 signifie le plus souvent
      // qu'un autre administrateur est passé avant -- d'où l'invalidation
      // dans les deux cas, pour que l'écran dise la vérité.
      toast.error(messageForApiError(erreur));
      await invalider(clinicId);
    } finally {
      fermer();
    }
  };

  // Comparaison EXACTE après trim, casse comprise. C'est tout l'exercice :
  // on veut une relecture, pas une formalité. Le nom attendu est affiché
  // juste au-dessus -- on ne piège personne, on ralentit.
  const confirmationValide = saisie.trim() === nom;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(ouvert) => (ouvert ? undefined : fermer())}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Suspendre l&apos;accès de {nom} ?</AlertDialogTitle>
          <AlertDialogDescription>
            Les membres du personnel de cette clinique seront déconnectés et ne
            pourront plus se connecter. Les rendez-vous déjà pris sont
            conservés, mais la clinique ne pourra plus les consulter ni en
            accepter de nouveaux. Les propriétaires ne la verront plus dans
            l&apos;annuaire public.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Alert variant="destructive">
          <AlertDescription>
            Cette clinique compte{" "}
            <strong className="tabular-nums">{effectif}</strong>{" "}
            {effectif > 1 ? "comptes actifs" : "compte actif"}.
          </AlertDescription>
        </Alert>

        <Field>
          <FieldLabel htmlFor="confirmation-suspension">
            Pour confirmer, saisissez le nom exact de la clinique
          </FieldLabel>
          <Input
            id="confirmation-suspension"
            autoComplete="off"
            spellCheck={false}
            value={saisie}
            onChange={(evenement) => setSaisie(evenement.target.value)}
          />
          <FieldDescription>
            <code>{nom}</code>
          </FieldDescription>
        </Field>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={fermer}>Annuler</AlertDialogCancel>
          {/* AlertDialogAction ne ferme pas le dialogue tout seul ici : on
              garde la main pour attendre la mutation, puis on ferme. */}
          <AlertDialogAction
            variant="destructive"
            disabled={!confirmationValide || suspension.isPending}
            onClick={(evenement) => {
              evenement.preventDefault();
              void confirmer();
            }}
          >
            {suspension.isPending && <Spinner data-icon="inline-start" />}
            Suspendre l&apos;accès
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
