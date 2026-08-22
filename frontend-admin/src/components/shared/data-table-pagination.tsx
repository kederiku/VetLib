/**
 * Barre de pagination d'une datatable : compteur, taille de page, navigation.
 *
 * Elle lit l'état d'URL et NON l'instance TanStack. Deux bénéfices : le
 * composant se teste avec un objet d'état simulé, sans monter de tableau, et
 * il n'existe qu'une seule source de vérité pour « quelle page suis-je en
 * train de regarder ».
 */
"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { libellePlage, nombreDePages } from "@/lib/table/format";
import {
  TAILLES_DE_PAGE,
  type TableUrlState,
} from "@/lib/table/use-table-url-state";

export function DataTablePagination({
  etat,
  total,
  affichees,
  enChargement,
}: {
  etat: TableUrlState;
  total: number;
  /** Nombre de lignes réellement affichées : la dernière page est partielle. */
  affichees: number;
  enChargement: boolean;
}) {
  const pages = nombreDePages(total, etat.taille);
  const premiere = etat.page <= 1;
  const derniere = etat.page >= pages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {/* role="status" + aria-live : un changement de page ne deplace pas
            le focus, un lecteur d'ecran n'aurait donc aucun moyen de savoir
            que le tableau a change. Ici il annonce la nouvelle plage. */}
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-muted-foreground tabular-nums"
        >
          {enChargement
            ? "Chargement…"
            : libellePlage(total, etat.offset, affichees)}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label
            htmlFor="taille-de-page"
            className="text-sm text-muted-foreground max-sm:sr-only"
          >
            Par page
          </label>
          <Select
            value={String(etat.taille)}
            onValueChange={(valeur) => {
              // Base UI type onValueChange en `unknown` : le garde est
              // necessaire, pas decoratif.
              if (typeof valeur === "string")
                etat.changerTaille(Number(valeur));
            }}
          >
            <SelectTrigger id="taille-de-page" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAILLES_DE_PAGE.map((taille) => (
                <SelectItem key={taille} value={String(taille)}>
                  {taille}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-sm text-muted-foreground tabular-nums">
          Page {etat.page} sur {pages}
        </p>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Page précédente"
            disabled={premiere || enChargement}
            onClick={() => etat.changerPage(etat.page - 1)}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Page suivante"
            disabled={derniere || enChargement}
            onClick={() => etat.changerPage(etat.page + 1)}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
