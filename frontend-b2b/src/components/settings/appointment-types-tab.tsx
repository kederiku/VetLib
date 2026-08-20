/**
 * Onglet "Types de rendez-vous" : liste + accès au dialog créer/éditer.
 *
 * Il n'y a volontairement PAS de suppression : les anciens rendez-vous
 * référencent leurs types, la DÉSACTIVATION est le cycle de vie (un type
 * inactif n'est plus proposé à la prise de rendez-vous mais l'historique
 * reste lisible). Même philosophie que les soft deletes du backend.
 */
"use client";

import { useState } from "react";

import { AppointmentTypeDialog } from "@/components/settings/appointment-type-dialog";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useListAppointmentTypes } from "@/lib/api/generated/scheduling/scheduling";
import type { AppointmentTypeResponse } from "@/lib/api/generated/vetoLibAPI.schemas";

export function AppointmentTypesTab() {
  const typesQuery = useListAppointmentTypes({
    query: { select: (res) => res.data },
  });

  // null = dialog en mode création ; un type = mode édition.
  const [editingType, setEditingType] =
    useState<AppointmentTypeResponse | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openCreate = () => {
    setEditingType(null);
    setDialogOpen(true);
  };
  const openEdit = (type: AppointmentTypeResponse) => {
    setEditingType(type);
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Types de rendez-vous</CardTitle>
        <CardDescription>
          Les motifs proposés à la prise de rendez-vous, avec leur durée.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {typesQuery.isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {typesQuery.isError && (
          <Alert variant="destructive">
            <AlertTitle>Impossible de charger les types de rendez-vous.</AlertTitle>
          </Alert>
        )}

        {typesQuery.data !== undefined &&
          (typesQuery.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun type de rendez-vous pour l&apos;instant.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Durée</TableHead>
                  <TableHead>Statut</TableHead>
                  {/* Colonne actions sans en-tête visible. */}
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {typesQuery.data.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell className="font-medium">{type.name}</TableCell>
                    <TableCell>{type.duration_minutes} min</TableCell>
                    <TableCell>
                      <Badge variant={type.active ? "secondary" : "outline"}>
                        {type.active ? "Actif" : "Inactif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(type)}
                      >
                        Modifier
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ))}

        <div>
          <Button onClick={openCreate}>Nouveau type</Button>
        </div>
      </CardContent>

      {/* key : remonte le dialog quand la cible change (édition d'un
          autre type, ou passage création <-> édition) — le formulaire
          repart des bonnes defaultValues sans reset manuel. */}
      <AppointmentTypeDialog
        key={editingType?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        type={editingType}
      />
    </Card>
  );
}
