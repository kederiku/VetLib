/**
 * Carte « derniers inscrits » du tableau de bord.
 *
 * Une liste de cinq lignes, pas une datatable : il n'y a ici ni pagination,
 * ni tri, ni recherche, et monter le moteur de tableau pour cinq lignes
 * figées serait un coût sans contrepartie. Le lien « tout voir » renvoie
 * vers l'écran qui, lui, sait tout faire.
 *
 * Générique sur le type de ligne pour servir les cliniques ET les
 * propriétaires : les deux affichent un titre, un sous-titre et une date.
 */
"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateCourte } from "@/lib/date/format";

export type LigneRecente = {
  id: string;
  titre: ReactNode;
  sousTitre: string;
  date: string;
};

export function RecentCard({
  titre,
  description,
  lignes,
  enChargement,
  hrefTout,
  messageVide,
}: {
  titre: string;
  description: string;
  lignes: LigneRecente[];
  enChargement: boolean;
  hrefTout: string;
  messageVide: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titre}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          {/* Un <Link> habillé par `buttonVariants`, et non un <Button
              render={<Link/>}>. « Tout voir » est une NAVIGATION : elle doit
              rester un lien pour les technologies d'assistance, s'ouvrir dans
              un nouvel onglet au clic du milieu, et apparaître dans la liste
              des liens de la page. La primitive Base UI, elle, oblige à
              choisir entre un `type="button"` posé sur une balise <a> (HTML
              invalide, et elle en avertit en console) et un `role="button"`
              qui efface justement la sémantique de lien. */}
          <Link
            href={hrefTout}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Tout voir
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {enChargement ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={`squelette-${index}`} className="h-10 w-full" />
            ))}
          </div>
        ) : lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{messageVide}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {lignes.map((ligne) => (
              <li
                key={ligne.id}
                className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {ligne.titre}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {ligne.sousTitre}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatDateCourte(ligne.date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
