/**
 * Champ de recherche : saisie immédiate à l'écran, requête différée.
 *
 * Le problème à résoudre : la recherche vit dans l'URL (voir
 * `use-table-url-state.ts`), mais pousser dans l'URL à chaque frappe
 * déclencherait une requête par caractère et ferait perdre le focus. La
 * valeur affichée est donc un état LOCAL, et sa propagation vers l'URL est
 * différée d'environ 300 ms.
 *
 * Ce que ce hook ne fait PAS, et c'est délibéré : il ne resynchronise
 * JAMAIS son état local depuis l'URL. Deux raisons.
 *
 * 1. Ce serait une mise à jour d'état dans un effet, que la règle
 *    `react-hooks/set-state-in-effect` interdit dans ce projet — et à juste
 *    titre : c'est le moyen le plus sûr de créer une boucle de rendu.
 * 2. Ce serait faux fonctionnellement. Pendant que l'utilisateur tape,
 *    l'URL est en retard sur ce qu'il voit ; la resynchroniser reviendrait à
 *    lui effacer des caractères sous les doigts.
 *
 * Conséquence assumée : un changement d'URL venu d'ailleurs (bouton
 * « précédent », lien collé) ne se reflète pas dans le champ tant que le
 * composant reste monté. Comme ces navigations remontent le composant dans
 * la pratique, le cas ne se produit pas — et le jour où il se produirait, un
 * champ figé est moins grave qu'un champ qui s'efface tout seul.
 */
"use client";

import { useCallback, useEffect, useState } from "react";

const DELAI_MS = 300;

export type RechercheDebouncee = {
  /** Valeur à afficher dans le champ (immédiate). */
  valeur: string;
  /** À brancher sur onChange : met à jour l'affichage, diffère la requête. */
  changer: (valeur: string) => void;
  /** Efface et pousse IMMÉDIATEMENT : un clic sur la croix attend un effet net. */
  effacer: () => void;
};

export function useDebouncedSearch(
  valeurUrl: string,
  onValider: (valeur: string) => void,
  delai: number = DELAI_MS,
): RechercheDebouncee {
  const [valeur, setValeur] = useState(valeurUrl);

  useEffect(() => {
    // Rien à pousser quand l'affichage et l'URL disent déjà la même chose.
    // C'est aussi ce qui empêche la boucle : après la propagation, `valeurUrl`
    // rattrape `valeur` et l'effet suivant sort immédiatement.
    if (valeur === valeurUrl) return;
    const minuterie = setTimeout(() => onValider(valeur), delai);
    // Nettoyage à chaque frappe ET au démontage : une minuterie qui survivrait
    // au démontage appellerait router.replace sur un composant disparu.
    return () => clearTimeout(minuterie);
  }, [valeur, valeurUrl, onValider, delai]);

  const effacer = useCallback(() => {
    setValeur("");
    onValider("");
  }, [onValider]);

  return { valeur, changer: setValeur, effacer };
}
