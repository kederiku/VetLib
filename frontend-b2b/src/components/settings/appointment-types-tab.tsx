/**
 * Onglet "Types de rendez-vous" : liste + accès au dialog créer/éditer.
 *
 * La coquille (carte, chargement, erreur, état vide, CTA de création)
 * vient de <SettingsListCard> — cet onglet ne garde que sa query, sa
 * table et son dialog. Il n'y a volontairement PAS de suppression : les
 * anciens rendez-vous référencent leurs types, la DÉSACTIVATION est le
 * cycle de vie (un type inactif n'est plus proposé à la prise de
 * rendez-vous mais l'historique reste lisible). Même philosophie que
 * les soft deletes du backend.
 */
"use client";

import { ClipboardList } from "lucide-react";
import { useState } from "react";

import { AppointmentTypeDialog } from "@/components/settings/appointment-type-dialog";
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
  // Compteur incrémenté à CHAQUE ouverture : sert de key au dialog pour
  // le remonter à neuf. Une key basée sur la cible (id ?? "new") ne
  // suffit pas : rouvrir sur la MÊME cible garderait l'état du
  // formulaire (saisie abandonnée, erreur serveur) du passage précédent.
  const [dialogKey, setDialogKey] = useState(0);

  const openCreate = () => {
    setEditingType(null);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  };
  const openEdit = (type: AppointmentTypeResponse) => {
    setEditingType(type);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  };

  return (
    <>
      <SettingsListCard
        title="Types de rendez-vous"
        description="Les motifs proposés à la prise de rendez-vous, avec leur durée."
        createLabel="Nouveau type"
        onCreate={openCreate}
        isPending={typesQuery.isPending}
        isError={typesQuery.isError}
        errorTitle="Impossible de charger les types de rendez-vous."
        onRetry={() => void typesQuery.refetch()}
        isEmpty={typesQuery.data?.length === 0}
        emptyState={{
          icon: <ClipboardList />,
          title: "Aucun type de rendez-vous",
          description:
            "Créez vos motifs de consultation pour ouvrir la prise de rendez-vous.",
        }}
      >
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
            {typesQuery.data?.map((type) => (
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
      </SettingsListCard>

      {/* Hors de SettingsListCard : le dialog doit rester monté même
          quand la liste est vide (le CTA de l'état vide l'ouvre aussi).
          key : remonte le dialog à chaque ouverture — le formulaire
          repart des bonnes defaultValues sans reset manuel, même en
          rouvrant sur la même cible. */}
      <AppointmentTypeDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        type={editingType}
      />
    </>
  );
}
