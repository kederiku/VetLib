/**
 * Onglet "Praticiens" : liste des ressources planifiables + dialog
 * créer/éditer.
 *
 * La coquille (carte, chargement, erreur, état vide, CTA de création)
 * vient de <SettingsListCard> — cet onglet ne garde que sa query, sa
 * table et son dialog. Même cycle de vie que les types de rendez-vous :
 * pas de suppression, la DÉSACTIVATION retire le praticien des agendas
 * futurs sans toucher à l'historique. "Ressource" côté backend
 * (extensible aux salles, équipements...), "praticien" côté UI : seul
 * kind=veterinarian existe aujourd'hui.
 */
"use client";

import { Stethoscope } from "lucide-react";
import { useState } from "react";

import { PractitionerDialog } from "@/components/settings/practitioner-dialog";
import { SettingsListCard } from "@/components/settings/settings-list-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  // Compteur incrémenté à CHAQUE ouverture : sert de key au dialog pour
  // le remonter à neuf. Une key basée sur la cible (id ?? "new") ne
  // suffit pas : rouvrir sur la MÊME cible garderait l'état du
  // formulaire (saisie abandonnée, erreur serveur) du passage précédent.
  const [dialogKey, setDialogKey] = useState(0);

  const openCreate = () => {
    setEditingResource(null);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  };
  const openEdit = (resource: ResourceResponse) => {
    setEditingResource(resource);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  };

  return (
    <>
      <SettingsListCard
        title="Praticiens"
        description="Les praticiens dont l'agenda peut recevoir des rendez-vous."
        createLabel="Nouveau praticien"
        onCreate={openCreate}
        isPending={resourcesQuery.isPending}
        isError={resourcesQuery.isError}
        errorTitle="Impossible de charger les praticiens."
        onRetry={() => void resourcesQuery.refetch()}
        isEmpty={resourcesQuery.data?.length === 0}
        emptyState={{
          icon: <Stethoscope />,
          title: "Aucun praticien",
          description:
            "Ajoutez un praticien pour ouvrir son agenda aux rendez-vous.",
        }}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Statut</TableHead>
              {/* Colonne actions sans en-tête visible. */}
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {resourcesQuery.data?.map((resource) => (
              <TableRow key={resource.id}>
                <TableCell className="font-medium">{resource.name}</TableCell>
                <TableCell>
                  <Badge variant={resource.active ? "secondary" : "outline"}>
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
      </SettingsListCard>

      {/* Hors de SettingsListCard : le dialog doit rester monté même
          quand la liste est vide (le CTA de l'état vide l'ouvre aussi).
          key : remonte le dialog à chaque ouverture, pour repartir des
          bonnes defaultValues sans reset manuel, même en rouvrant sur
          la même cible. */}
      <PractitionerDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        resource={editingResource}
      />
    </>
  );
}
