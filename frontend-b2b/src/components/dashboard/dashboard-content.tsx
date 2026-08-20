/**
 * Contenu du tableau de bord (placeholder du squelette d'auth).
 *
 * Premier écran "connecté" du portail : il affiche le profil de
 * l'utilisateur courant pour prouver que toute la chaîne fonctionne
 * (cookies -> /me -> cache TanStack -> UI). Les vrais écrans métier
 * (planning, patients) le remplaceront. Client Component : il lit la
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
import { LogoutButton } from "@/components/auth/logout-button";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import type { Role } from "@/lib/api/generated/vetoLibAPI.schemas";

// Traduction des rôles techniques du backend vers les libellés du métier.
// Record<Role, string> : TypeScript exige une entrée par rôle, donc un
// nouveau rôle backend provoquera une erreur de compilation ici (voulu).
const ROLE_LABELS: Record<Role, string> = {
  asv: "ASV",
  veterinarian: "Vétérinaire",
  manager: "Gérant",
};

export function DashboardContent() {
  const { data: user } = useCurrentUser();

  // L'AuthGuard (layout parent) garantit qu'on n'arrive ici que
  // connecté ; ce garde-fou couvre l'instant de transition où la query
  // n'est pas encore résolue (et rassure TypeScript sur undefined).
  if (user === undefined) {
    return null;
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
        <LogoutButton />
      </div>

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
    </main>
  );
}
