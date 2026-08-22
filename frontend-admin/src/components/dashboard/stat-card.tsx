/**
 * Carte de compteur du tableau de bord.
 *
 * Le chiffre est en `tabular-nums` : sans cela, passer de 9 à 10 décale la
 * carte, et quatre cartes côte à côte ne s'alignent pas. La teinte vient de
 * la rampe `--chart-1..5`, où chaque couleur a un sens métier fixé une fois
 * pour toutes dans `globals.css` (azur = cliniques, émeraude =
 * propriétaires, indigo = personnel, ambre = accès suspendus).
 *
 * Pendant le chargement, un squelette de la MÊME hauteur que le chiffre :
 * une carte qui grandit à l'arrivée des données fait sauter la page entière.
 */
import type { ComponentType } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const NOMBRE = new Intl.NumberFormat("fr-FR");

export function StatCard({
  titre,
  valeur,
  precision,
  icon: Icon,
  teinte,
}: {
  titre: string;
  /** `undefined` pendant le chargement. */
  valeur: number | undefined;
  precision: string;
  icon: ComponentType<{ className?: string }>;
  /** Classe Tailwind de couleur, ex. `text-chart-1`. */
  teinte: string;
}) {
  return (
    <Card>
      <CardHeader>
        <Icon className={`size-5 ${teinte}`} aria-hidden />
        <CardTitle>{titre}</CardTitle>
        <CardDescription>{precision}</CardDescription>
      </CardHeader>
      <CardContent>
        {valeur === undefined ? (
          <Skeleton className="h-9 w-20" />
        ) : (
          <p className="text-3xl font-semibold tabular-nums">
            {NOMBRE.format(valeur)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
