/**
 * Fiche d'une clinique : identité, chiffres, et son personnel.
 *
 * Trois états, comme partout : chargement (squelettes de la MÊME hauteur que
 * le contenu final, pour que la page ne saute pas), erreur (avec Réessayer),
 * contenu. Le 404 n'a pas d'état dédié : le mutator jette sur tout statut
 * >= 400, l'erreur passe donc par `isError`, et le message dit à la fois
 * « introuvable » et « réessayez » — l'exploitant qui arrive ici par un lien
 * périmé et celui dont le réseau a coupé ont le même geste utile.
 *
 * L'email n'est PAS modifiable, ici comme dans le dialogue d'édition : c'est
 * l'identifiant d'inscription de la clinique.
 */
"use client";

import {
  ArrowLeftIcon,
  BanIcon,
  PencilIcon,
  RotateCcwIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ClinicEditDialog } from "@/components/clinics/clinic-edit-dialog";
import { ClinicStaffCard } from "@/components/clinics/clinic-staff-card";
import { ClinicSuspendDialog } from "@/components/clinics/clinic-suspend-dialog";
import { DefinitionList } from "@/components/shared/definition-list";
import { ErrorState } from "@/components/shared/error-state";
import { PageContainer } from "@/components/shared/page-container";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api/errors";
import {
  useGetAdminClinic,
  useReactivateAdminClinic,
} from "@/lib/api/generated/admin-clinics/admin-clinics";
import type {
  AddressPayload,
  AdminClinicResponse,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import { messageForApiError } from "@/lib/auth/server-errors";
import { useInvaliderCliniques } from "@/lib/clinics/mutations";
import { formatDateLongue } from "@/lib/date/format";
import { cn } from "@/lib/utils";

/** « 12 rue des Lilas, 75011 Paris » sur deux lignes quand il y a un complément. */
function adresseLisible(adresse: AddressPayload | null): React.ReactNode {
  if (adresse === null) return "—";
  return (
    <span className="flex flex-col">
      <span>{adresse.line1}</span>
      {adresse.line2 !== null &&
        adresse.line2 !== undefined &&
        adresse.line2 !== "" && <span>{adresse.line2}</span>}
      <span>
        {adresse.postal_code} {adresse.city}
      </span>
    </span>
  );
}

export function ClinicDetailContent({ clinicId }: { clinicId: string }) {
  const [editionOuverte, setEditionOuverte] = useState(false);
  const [suspensionOuverte, setSuspensionOuverte] = useState(false);
  const [cleEdition, setCleEdition] = useState(0);
  const invalider = useInvaliderCliniques();
  const reactivation = useReactivateAdminClinic<ApiError>();

  const fiche = useGetAdminClinic<AdminClinicResponse | undefined, ApiError>(
    clinicId,
    {
      query: {
        // L'union generee inclut la variante 422 ; a l'execution le mutator a
        // deja jete sur tout statut >= 400, on est donc forcement en 200 ici.
        select: (reponse) =>
          reponse.status === 200 ? reponse.data : undefined,
      },
    },
  );
  const clinique = fiche.data;

  const reactiver = async () => {
    try {
      await reactivation.mutateAsync({ clinicId });
      toast.success("Accès rétabli");
    } catch (erreur) {
      toast.error(messageForApiError(erreur));
    } finally {
      await invalider(clinicId);
    }
  };

  // Un <Link> habillé par `buttonVariants` : revenir à la liste est une
  // NAVIGATION et doit rester un lien (voir `dashboard/recent-card.tsx` pour
  // le raisonnement complet).
  const retour = (
    <Link
      href="/cliniques"
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "-ml-2 w-fit",
      )}
    >
      <ArrowLeftIcon aria-hidden />
      Toutes les cliniques
    </Link>
  );

  if (fiche.isError) {
    return (
      <PageContainer>
        {retour}
        <ErrorState
          title="Impossible d'afficher cette clinique"
          description="Elle n'existe peut-être plus, ou la connexion a échoué."
          onRetry={() => void fiche.refetch()}
        />
      </PageContainer>
    );
  }

  if (clinique === undefined) {
    return (
      <PageContainer>
        {retour}
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {retour}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {clinique.name}
            </h1>
            <StatusBadge
              actif={clinique.is_active}
              libelleActif="Active"
              libelleInactif="Suspendue"
            />
          </div>
          <p className="text-sm text-muted-foreground">{clinique.email}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setCleEdition((valeur) => valeur + 1);
              setEditionOuverte(true);
            }}
          >
            <PencilIcon aria-hidden />
            Modifier la fiche
          </Button>
          {clinique.is_active ? (
            <Button
              variant="destructive"
              onClick={() => setSuspensionOuverte(true)}
            >
              <BanIcon aria-hidden />
              Suspendre l&apos;accès
            </Button>
          ) : (
            <Button
              disabled={reactivation.isPending}
              onClick={() => void reactiver()}
            >
              <RotateCcwIcon aria-hidden />
              Réactiver l&apos;accès
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Identité</CardTitle>
          </CardHeader>
          <CardContent>
            <DefinitionList
              entrees={[
                { libelle: "Email de contact", valeur: clinique.email },
                { libelle: "Téléphone", valeur: clinique.phone ?? "—" },
                {
                  libelle: "Adresse",
                  valeur: adresseLisible(clinique.address),
                },
                { libelle: "Fuseau horaire", valeur: clinique.timezone },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chiffres</CardTitle>
          </CardHeader>
          <CardContent>
            <DefinitionList
              entrees={[
                {
                  libelle: "Comptes actifs",
                  valeur: (
                    <span className="text-2xl font-semibold tabular-nums">
                      {clinique.staff_count}
                    </span>
                  ),
                },
                {
                  libelle: "Inscrite le",
                  valeur: formatDateLongue(clinique.created_at),
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <ClinicStaffCard clinicId={clinique.id} clinicName={clinique.name} />

      <ClinicEditDialog
        key={cleEdition}
        clinicId={clinique.id}
        open={editionOuverte}
        onOpenChange={setEditionOuverte}
      />
      <ClinicSuspendDialog
        clinicId={clinique.id}
        nom={clinique.name}
        effectif={clinique.staff_count}
        open={suspensionOuverte}
        onOpenChange={setSuspensionOuverte}
      />
    </PageContainer>
  );
}
