/**
 * Fiche d'un rendez-vous : tout ce que le backend renvoie, plus
 * l'annulation.
 *
 * PAGE et non dialogue, pour trois raisons. Sur mobile, le contenu
 * remplit un écran de téléphone : dans une modale il deviendrait une
 * colonne défilante coincée entre le clavier et la barre d'URL. Le
 * bouton Précédent du navigateur — le réflexe numéro un sur mobile —
 * ferme une page et revient à la liste, alors qu'il quitterait
 * carrément l'écran depuis une modale. Enfin « mon rendez-vous de
 * jeudi » est typiquement ce qu'on met en favori ou qu'on s'envoie : cela
 * n'existe que si l'écran est une route.
 *
 * DERIVE DU CACHE, sans requête propre : la liste complète renvoie déjà
 * tous les champs, noms dénormalisés compris. Un second queryKey pour la
 * même entité obligerait l'annulation à invalider les deux, et l'oublier
 * donnerait une fiche périmée après annulation.
 *
 * A froid (lien partagé, F5), la même query part de toute façon et le
 * squelette couvre l'attente : c'est pourquoi cet écran n'a pas eu
 * besoin d'un endpoint unitaire côté backend.
 */
"use client";

import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  MapPinIcon,
  MessageSquareTextIcon,
  PawPrintIcon,
  StethoscopeIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { CancelAppointmentDialog } from "@/components/appointments/cancel-appointment-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { canCancel, STATUS_LABELS } from "@/lib/appointments/status";
import { useMyAppointments } from "@/lib/appointments/use-my-appointments";
import {
  formatDateLong,
  formatRelativeDay,
  formatTimeRange,
} from "@/lib/date/format";

/** Le lien de retour, présent dans tous les états de la page. */
function RetourListe() {
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        render={<Link href="/rendez-vous" />}
      >
        <ChevronLeftIcon data-icon="inline-start" aria-hidden />
        Retour à mes rendez-vous
      </Button>
    </div>
  );
}

/** Une ligne de la liste de définitions « Détails ». */
function Detail({
  icon,
  terme,
  children,
}: {
  icon: React.ReactNode;
  terme: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {terme}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function AppointmentDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const { data: appointments, isPending, isError, refetch } = useMyAppointments();
  const [dialogOpen, setDialogOpen] = useState(false);
  const now = useMemo(() => new Date(), []);

  const appointment = appointments?.find((appt) => appt.id === id);

  if (isPending) {
    return (
      <PageContainer width="narrow">
        <RetourListe />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </PageContainer>
    );
  }

  if (isError) {
    return (
      <PageContainer width="narrow">
        <RetourListe />
        <ErrorState
          title="Impossible de charger ce rendez-vous."
          onRetry={() => void refetch()}
        />
      </PageContainer>
    );
  }

  // Introuvable : on ne l'affirme qu'une fois la query ABOUTIE, sinon on
  // accuserait d'inexistence un rendez-vous encore en chargement.
  if (appointment === undefined) {
    return (
      <PageContainer width="narrow">
        <RetourListe />
        {/* Pas de CTA dans l'etat vide : le lien de retour ci-dessus est
            deja la sortie, et il est present dans TOUS les etats de la
            page. Le repeter donnerait deux boutons identiques a 40 px
            d'ecart -- annonces deux fois par un lecteur d'ecran. */}
        <EmptyState
          icon={<CalendarDaysIcon aria-hidden />}
          title="Rendez-vous introuvable"
          description="Ce rendez-vous n'existe plus ou ne vous appartient pas. Revenez à la liste pour retrouver vos visites."
        />
      </PageContainer>
    );
  }

  const status = STATUS_LABELS[appointment.status];
  const estPasse = new Date(appointment.starts_at).getTime() <= now.getTime();

  return (
    <PageContainer width="narrow">
      <RetourListe />

      <PageHeader
        title={appointment.appointment_type_name}
        description={appointment.clinic_name}
        actions={<Badge variant={status.badgeVariant}>{status.label}</Badge>}
      />

      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="text-xl font-semibold tabular-nums">
            {formatRelativeDay(appointment.starts_at, now)}
          </p>
          <p className="text-muted-foreground">
            {formatDateLong(appointment.starts_at)}, de{" "}
            {formatTimeRange(appointment.starts_at, appointment.ends_at)}
            {/* Le fuseau est explicite : un proprietaire en deplacement
                doit lire l'heure de la CLINIQUE, pas la sienne. */}{" "}
            (heure de Paris)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Détails</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail
              icon={<StethoscopeIcon className="size-4" aria-hidden />}
              terme="Praticien"
            >
              {appointment.resource_name}
            </Detail>
            <Detail
              icon={<MapPinIcon className="size-4" aria-hidden />}
              terme="Clinique"
            >
              {appointment.clinic_name}
            </Detail>
            <Detail
              icon={<PawPrintIcon className="size-4" aria-hidden />}
              terme="Animal"
            >
              {/* pet_id nullable : rendez-vous cree par la clinique sans
                  fiche animal rattachee. On ne fabrique pas un lien mort. */}
              {appointment.pet_id !== null && appointment.pet_name !== null ? (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  nativeButton={false}
                  render={<Link href={`/animaux/${appointment.pet_id}`} />}
                >
                  {appointment.pet_name}
                </Button>
              ) : (
                <span className="text-muted-foreground">Non précisé</span>
              )}
            </Detail>
            {appointment.reason !== null && appointment.reason !== "" && (
              <div className="flex flex-col gap-1 sm:col-span-2">
                <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MessageSquareTextIcon className="size-4" aria-hidden />
                  Motif que vous avez indiqué
                </dt>
                <dd className="text-sm">{appointment.reason}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Raison d'annulation : jamais affichee jusqu'ici alors que le
          backend la renvoie. Variante par defaut et non destructive :
          c'est une information factuelle, pas une erreur de
          l'utilisateur. */}
      {appointment.status === "cancelled" && (
        <Alert>
          <AlertTitle>Rendez-vous annulé</AlertTitle>
          {appointment.cancelled_reason !== null &&
            appointment.cancelled_reason !== "" && (
              <AlertDescription>
                {appointment.cancelled_reason}
              </AlertDescription>
            )}
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        {/* Pre-verification d'affichage seulement (le backend reste
            l'autorite) : annulable en ligne jusqu'a 24 h avant le debut.
            En BAS de page et en variante discrete : une action
            irreversible ne se met pas sous le pouce, la ou l'on clique
            par reflexe. */}
        {canCancel(appointment, now) && (
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDialogOpen(true)}
          >
            Annuler le rendez-vous
          </Button>
        )}

        {/* Depuis une fiche d'historique, reprendre rendez-vous pour le
            meme animal est l'action naturelle. */}
        {(estPasse || appointment.status === "cancelled") &&
          appointment.pet_id !== null && (
            <Button
              nativeButton={false}
              render={
                <Link
                  href={`/rendez-vous/nouveau?animal=${appointment.pet_id}`}
                />
              }
            >
              Reprendre rendez-vous
            </Button>
          )}
      </div>

      <CancelAppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appointment={appointment}
        // Le rendez-vous reste visible apres annulation (avec son badge),
        // mais on ramene a la liste : c'est la ou l'on veut etre une fois
        // l'affaire reglee.
        onCancelled={() => router.push("/rendez-vous")}
      />
    </PageContainer>
  );
}
