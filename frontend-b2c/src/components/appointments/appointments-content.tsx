/**
 * Contenu de la page /rendez-vous : tous mes rendez-vous, toutes
 * cliniques confondues.
 *
 * DEUX ONGLETS plutôt que deux sections empilées. L'à-venir compte zéro à
 * trois lignes, l'historique grandit indéfiniment : empilés, la page
 * devient avec le temps une archive où le contenu utile occupe 5 % de la
 * hauteur. Les onglets séparent deux intentions distinctes — « qu'est-ce
 * qui m'attend ? » et « quand suis-je venu ? » — et rendent chacune
 * atteignable en un clic.
 *
 * Le partage se fait sur starts_at par rapport à MAINTENANT, pas sur le
 * statut : un rendez-vous futur ANNULE reste dans « À venir » avec son
 * badge (le propriétaire doit voir que son créneau de jeudi est tombé).
 *
 * L'onglet et les filtres vivent dans l'URL (voir
 * use-appointments-url-state) : F5 et le bouton Précédent fonctionnent,
 * et la fiche d'un animal peut pointer vers un écran déjà filtré.
 *
 * L'historique est paginé CÔTE CLIENT : la liste complète est déjà en
 * mémoire, il n'y a aucune requête à faire pour en montrer dix de plus.
 */
"use client";

import { CalendarDays, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AppointmentRow } from "@/components/appointments/appointment-row";
import { AppointmentsToolbar } from "@/components/appointments/appointments-toolbar";
import {
  TOUS,
  useAppointmentsUrlState,
} from "@/components/appointments/use-appointments-url-state";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useListMyPets } from "@/lib/api/generated/pets/pets";
import type { OwnerAppointmentResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import {
  filterAppointments,
  groupByMonth,
  splitByTime,
} from "@/lib/appointments/derive";
import { useMyAppointments } from "@/lib/appointments/use-my-appointments";
import { formatMonthLong } from "@/lib/date/format";

// Taille du premier lot d'historique, et pas du suivant. Dix visites
// couvrent plusieurs annees pour un animal de compagnie : au-dela, on
// cherche une date precise, pas on parcourt.
const LOT_HISTORIQUE = 10;

export function AppointmentsContent() {
  const { data: appointments, isPending, isError, refetch } = useMyAppointments();
  // Le filtre par animal a besoin des NOMS : même queryKey que la page
  // « Mes animaux », donc aucune requête supplémentaire ici.
  const { data: pets } = useListMyPets({ query: { select: (res) => res.data } });
  const etat = useAppointmentsUrlState();
  const [lotsAffiches, setLotsAffiches] = useState(1);

  // "Maintenant" est fige PAR RENDU (pas par ligne) : toutes les lignes
  // et le partage a-venir/passe utilisent le meme instant, pas de
  // rendez-vous a cheval entre deux onglets.
  const now = useMemo(() => new Date(), []);

  const { aVenir, passes, totalBrut } = useMemo(() => {
    const tous = appointments ?? [];
    const filtres = filterAppointments(tous, {
      petId: etat.animal === TOUS ? null : etat.animal,
      clinicId: etat.clinique === TOUS ? null : etat.clinique,
    });
    const { upcoming, past } = splitByTime(filtres, now);
    return { aVenir: upcoming, passes: past, totalBrut: tous.length };
  }, [appointments, etat.animal, etat.clinique, now]);

  const passesAffiches = passes.slice(0, lotsAffiches * LOT_HISTORIQUE);
  const groupes = groupByMonth(passesAffiches);

  const cta = (
    <Button nativeButton={false} render={<Link href="/rendez-vous/nouveau" />}>
      <Plus data-icon="inline-start" aria-hidden />
      Prendre rendez-vous
    </Button>
  );

  return (
    <PageContainer>
      <PageHeader
        title="Mes rendez-vous"
        description="Vos visites vétérinaires, toutes cliniques confondues."
        actions={cta}
      />

      {isPending && (
        <div className="flex flex-col gap-3">
          {/* Meme silhouette que les lignes reelles : pas de saut de mise
              en page a l'arrivee des donnees. */}
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      )}

      {isError && (
        <ErrorState
          title="Impossible de charger vos rendez-vous."
          onRetry={() => void refetch()}
        />
      )}

      {/* Etat vide GLOBAL : aucun rendez-vous, passe comme a venir. Les
          onglets ne sont alors pas rendus -- deux onglets vides seraient
          absurdes. */}
      {appointments !== undefined && totalBrut === 0 && (
        <EmptyState
          icon={<CalendarDays aria-hidden />}
          title="Aucun rendez-vous pour l'instant"
          description="Choisissez une clinique, un motif et un créneau : votre demande part en quelques clics."
          action={cta}
        />
      )}

      {appointments !== undefined && totalBrut > 0 && (
        <Tabs
          value={etat.vue}
          onValueChange={(valeur) => {
            if (valeur === "a-venir" || valeur === "passes") etat.setVue(valeur);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="a-venir">À venir ({aVenir.length})</TabsTrigger>
              <TabsTrigger value="passes">Passés ({passes.length})</TabsTrigger>
            </TabsList>
            <AppointmentsToolbar
              appointments={appointments}
              pets={pets ?? []}
              animal={etat.animal}
              clinique={etat.clinique}
              onAnimalChange={(valeur) => {
                setLotsAffiches(1);
                etat.setAnimal(valeur);
              }}
              onCliniqueChange={(valeur) => {
                setLotsAffiches(1);
                etat.setClinique(valeur);
              }}
            />
          </div>

          <TabsContent value="a-venir">
            <ListeSimple
              appointments={aVenir}
              vide={
                etat.filtreActif
                  ? "Aucun rendez-vous à venir pour ce filtre."
                  : "Aucun rendez-vous à venir."
              }
              filtreActif={etat.filtreActif}
              onReinitialiser={etat.reinitialiserFiltres}
            />
          </TabsContent>

          <TabsContent value="passes">
            {passes.length === 0 ? (
              <Vide
                message={
                  etat.filtreActif
                    ? "Aucun rendez-vous passé pour ce filtre."
                    : "Aucun rendez-vous passé."
                }
                filtreActif={etat.filtreActif}
                onReinitialiser={etat.reinitialiserFiltres}
              />
            ) : (
              // aria-live : l'ajout d'un lot est annonce aux lecteurs
              // d'ecran, qui ne voient pas la liste s'allonger.
              <div className="flex flex-col gap-4" aria-live="polite">
                {groupes.map((groupe) => (
                  <section key={groupe.key} className="flex flex-col gap-2">
                    {/* Intertitre de mois : le repere de balayage naturel
                        d'un historique qui s'allonge. */}
                    <h2 className="pt-2 text-sm font-medium text-muted-foreground">
                      {formatMonthLong(groupe.appointments[0].starts_at)}
                    </h2>
                    {groupe.appointments.map((appt) => (
                      <AppointmentRow key={appt.id} appointment={appt} />
                    ))}
                  </section>
                ))}

                {passesAffiches.length < passes.length && (
                  <div>
                    <Button
                      variant="outline"
                      onClick={() => setLotsAffiches((lots) => lots + 1)}
                    >
                      Afficher {Math.min(LOT_HISTORIQUE, passes.length - passesAffiches.length)}{" "}
                      rendez-vous de plus
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </PageContainer>
  );
}

/** Liste d'un onglet, avec son état vide propre. */
function ListeSimple({
  appointments,
  vide,
  filtreActif,
  onReinitialiser,
}: {
  appointments: OwnerAppointmentResponse[];
  vide: string;
  filtreActif: boolean;
  onReinitialiser: () => void;
}) {
  if (appointments.length === 0) {
    return (
      <Vide
        message={vide}
        filtreActif={filtreActif}
        onReinitialiser={onReinitialiser}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {appointments.map((appt) => (
        <AppointmentRow key={appt.id} appointment={appt} />
      ))}
    </div>
  );
}

/**
 * Message d'onglet vide.
 *
 * Volontairement distinct de l'etat vide de PREMIER USAGE : reutiliser
 * "Aucun rendez-vous pour l'instant, prenez le premier" pour un resultat
 * de filtre serait un contresens -- l'utilisateur a des rendez-vous, il a
 * juste filtre trop fin, et ce qu'il lui faut est le moyen de revenir.
 */
function Vide({
  message,
  filtreActif,
  onReinitialiser,
}: {
  message: string;
  filtreActif: boolean;
  onReinitialiser: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2 py-6">
      <p className="text-sm text-muted-foreground">{message}</p>
      {filtreActif && (
        <Button variant="link" size="sm" className="px-0" onClick={onReinitialiser}>
          Réinitialiser les filtres
        </Button>
      )}
    </div>
  );
}
