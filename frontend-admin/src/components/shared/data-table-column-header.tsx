/**
 * En-tête de colonne triable d'une datatable.
 *
 * Un bouton, pas un `<th>` cliquable : seul un vrai bouton est atteignable
 * au clavier et annoncé comme actionnable. La flèche indique le sens du tri
 * en cours ; `aria-sort` est posé par la DataTable sur le `<th>` parent,
 * parce que c'est là que la norme l'attend.
 */
"use client";

import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DataTableColumnHeader({
  titre,
  triee,
  sens,
  onTrier,
}: {
  titre: string;
  triee: boolean;
  sens: "asc" | "desc";
  onTrier: () => void;
}) {
  const Fleche = !triee
    ? ArrowUpDownIcon
    : sens === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-8 gap-1 px-2 font-medium"
      onClick={onTrier}
    >
      {titre}
      {/* Icône purement indicative : aria-sort sur le <th> porte le sens
          pour les lecteurs d'écran, la répéter ici serait du bruit. */}
      <Fleche className="size-3.5 text-muted-foreground" aria-hidden />
    </Button>
  );
}
