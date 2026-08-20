/**
 * Contenu du tableau de bord.
 *
 * Premier écran après connexion : la carte "À confirmer" (rendez-vous
 * pending des 7 prochains jours, le travail du jour de l'accueil) suivie
 * de la carte profil de l'utilisateur courant. La déconnexion a migré
 * dans le pied de la sidebar (AppShell). Client Component : il lit la
 * session via useCurrentUser, un hook TanStack Query.
 */
"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PendingAppointmentsCard } from "@/components/dashboard/pending-appointments-card";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { useCurrentUser } from "@/lib/auth/use-current-user";

export function DashboardContent() {
  const { data: user } = useCurrentUser();

  // L'AuthGuard (layout parent) garantit qu'on n'arrive ici que
  // connecté ; ce garde-fou couvre l'instant de transition où la query
  // n'est pas encore résolue (et rassure TypeScript sur undefined).
  if (user === undefined) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>

      {/* Rendez-vous en attente de confirmation : l'info la plus
          actionnable du tableau de bord, donc au-dessus du profil. */}
      <PendingAppointmentsCard />

      <Card>
        <CardHeader>
          <CardTitle>
            {user.first_name} {user.last_name}
          </CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Clinique</dt>
            <dd className="font-medium">{user.clinic_name}</dd>
            <dt className="text-muted-foreground">Rôle</dt>
            <dd className="font-medium">{ROLE_LABELS[user.role]}</dd>
          </dl>

          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Permissions</p>
            <div className="flex flex-wrap gap-1.5">
              {user.permissions.map((permission) => (
                <Badge key={permission} variant="secondary">
                  {permission}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
