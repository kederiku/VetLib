/**
 * Enveloppe du composant Mermaid de Docusaurus : ajoute un bouton « Agrandir ».
 *
 * Pourquoi : Mermaid rend ses diagrammes en SVG avec `max-width: 100%`, donc tout
 * diagramme plus large que la colonne de texte (692 px sur un écran classique) est
 * RÉDUIT pour y tenir. Un schéma de 2800 px se retrouve à 25 % de sa taille, texte
 * illisible. La parade évidente — découper les schémas jusqu'à ce qu'ils tiennent —
 * appauvrit la documentation.
 *
 * Ce bouton bascule le diagramme en plein écran, à sa taille naturelle et défilable.
 * Le composant d'origine reste monté : Mermaid ne rend donc le diagramme QU'UNE FOIS,
 * on ne fait que déplacer son conteneur en CSS.
 *
 * Obtenu par `docusaurus swizzle @docusaurus/theme-mermaid Mermaid --wrap`. Une
 * enveloppe (et non une copie) : les corrections amont du composant continuent d'être
 * reçues.
 */
import Mermaid from "@theme-original/Mermaid";
import Translate, { translate } from "@docusaurus/Translate";
import type { WrapperProps } from "@docusaurus/types";
import type MermaidType from "@theme/Mermaid";
import clsx from "clsx";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import styles from "./styles.module.css";

type Props = WrapperProps<typeof MermaidType>;

export default function MermaidWrapper(props: Props): ReactNode {
  const [agrandi, setAgrandi] = useState(false);
  const cadreRef = useRef<HTMLDivElement>(null);

  const fermer = useCallback(() => setAgrandi(false), []);

  // Redimensionnement du SVG a sa taille NATURELLE, en JavaScript.
  //
  // Pourquoi pas en CSS : Mermaid pose width="100%" en attribut et un max-width en
  // style en ligne. Un `width: auto` sur un SVG porteur d'un viewBox ne restitue pas
  // la largeur intrinseque -- elle vaut 0 ou celle du conteneur selon le navigateur.
  // Seul le viewBox connait les dimensions reelles : on les lit et on les applique.
  useEffect(() => {
    const svg = cadreRef.current?.querySelector("svg");
    if (!svg) {
      return;
    }
    if (!agrandi) {
      svg.style.removeProperty("width");
      svg.style.removeProperty("height");
      svg.style.removeProperty("max-width");
      return;
    }
    const [, , largeur, hauteur] = (svg.getAttribute("viewBox") ?? "")
      .split(/\s+/)
      .map(Number);
    if (!largeur || !hauteur) {
      return;
    }
    svg.style.setProperty("max-width", "none");
    svg.style.setProperty("width", `${Math.round(largeur)}px`);
    svg.style.setProperty("height", `${Math.round(hauteur)}px`);
  }, [agrandi]);

  useEffect(() => {
    if (!agrandi) {
      return undefined;
    }
    // Échap ferme, comme dans n'importe quelle boite de dialogue.
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        fermer();
      }
    };
    document.addEventListener("keydown", surTouche);
    // On bloque le défilement de la page derrière la vue agrandie, sinon la molette
    // fait défiler les deux à la fois.
    //
    // On POSE puis on RETIRE la propriété, plutôt que de sauvegarder l'ancienne valeur
    // pour la remettre : en mode strict, React exécute les effets deux fois : la
    // seconde sauvegarde capturerait « hidden » et le rétablirait à la fermeture,
    // laissant la page définitivement bloquée.
    document.body.style.setProperty("overflow", "hidden");
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.removeProperty("overflow");
    };
  }, [agrandi, fermer]);

  return (
    <div
      ref={cadreRef}
      className={clsx(styles.cadre, agrandi && styles.agrandi)}
    >
      <button
        type="button"
        className={clsx("button button--secondary button--sm", styles.bouton)}
        onClick={() => setAgrandi((v) => !v)}
        aria-expanded={agrandi}
        title={translate({
          id: "vetolib.mermaid.bouton.titre",
          message:
            "Afficher le diagramme à sa taille réelle (Échap pour fermer)",
          description: "Infobulle du bouton d'agrandissement des diagrammes",
        })}
      >
        {agrandi ? (
          <Translate
            id="vetolib.mermaid.reduire"
            description="Libellé du bouton qui referme la vue agrandie"
          >
            Réduire
          </Translate>
        ) : (
          <Translate
            id="vetolib.mermaid.agrandir"
            description="Libellé du bouton qui ouvre la vue agrandie"
          >
            Agrandir
          </Translate>
        )}
      </button>

      <Mermaid {...props} />

      {/* Cliquer en dehors du diagramme referme, comportement attendu d'une
          surcouche. Le bouton reste le chemin accessible au clavier. */}
      {agrandi && (
        <div
          className={styles.fond}
          onClick={fermer}
          aria-hidden="true"
          data-testid="fond-agrandissement"
        />
      )}
    </div>
  );
}
