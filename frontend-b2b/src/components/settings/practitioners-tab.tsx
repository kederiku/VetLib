/**
 * Onglet "Praticiens" : liste des ressources planifiables + dialog
 * créer/éditer.
 *
 * Même squelette que l'onglet des types de rendez-vous, même cycle de
 * vie : pas de suppression, la DÉSACTIVATION retire le praticien des
 * agendas futurs sans toucher à l'historique. "Ressource" côté backend
 * (extensible aux salles, équipements...), "praticien" côté UI : seul
 * kind=veterinarian existe aujourd'hui.
 */
"use client";

import { useState } from "react";

import { PractitionerDialog } from "@/components/settings/practitioner-dialog";
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
import { useListResources } from "@/lib/api/generated/scheduling/scheduling";
import type { ResourceResponse } from "@/lib/api/generated/vetoLibAPI.schemas";

export function PractitionersTab() {
  const resourcesQuery = useListResources({
    query: { select: (res) => res.data },
  });

  // null = dialog en mode création ; une ressource = mode édition.
  const [editingResource, setEditingResource] =
    useState<ResourceResponse | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openCreate = () => {
    setEditingResource(null);
    setDialogOpen(true);
  };
  const openEdit = (resource: ResourceResponse) => {
    setEditingResource(resource);
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Praticiens</CardTitle>
        <CardDescription>
          Les praticiens dont l&apos;agenda peut recevoir des rendez-vous.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {resourcesQuery.isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {resourcesQuery.isError && (
          <Alert variant="destructive">
            <AlertTitle>Impossible de charger les praticiens.</AlertTitle>
          </Alert>
        )}

        {resourcesQuery.data !== undefined &&
          (resourcesQuery.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun praticien pour l&apos;instant.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {resourcesQuery.data.map((resource) => (
                  <TableRow key={resource.id}>
                    <TableCell className="font-medium">
                      {resource.name}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={resource.active ? "secondary" : "outline"}
                      >
                        {resource.active ? "Actif" : "Inactif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(resource)}
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
          <Button onClick={openCreate}>Nouveau praticien</Button>
        </div>
      </CardContent>

      {/* key : remonte le dialog quand la cible change, pour repartir
          des bonnes defaultValues sans reset manuel. */}
      <PractitionerDialog
        key={editingResource?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        resource={editingResource}
      />
    </Card>
  );
}
