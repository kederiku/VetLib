/**
 * Fichier exécuté une fois avant CHAQUE fichier de test.
 *
 * Il installe quatre choses que Vitest ne fournit pas dans cette
 * configuration, et RIEN de plus : chaque ligne ajoutée ici est un morceau de
 * navigateur que le test croit avoir alors qu'il ne l'a pas. Un décor trop
 * généreux fait passer des tests qui échoueraient en vrai — on ne comble donc
 * que les manques réellement rencontrés par le code du projet.
 */

/**
 * jest-dom ajoute à "expect" des assertions spécialisées pour le DOM
 * (toBeInTheDocument, toHaveAttribute, toBeDisabled...). Elles produisent des
 * messages d'échec bien plus lisibles qu'un simple booléen : au lieu de
 * "expected false to be true", on obtient l'élément concerné et ce qui
 * n'allait pas.
 */
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/**
 * Drapeau lu par React pour savoir qu'il tourne dans un test.
 *
 * POURQUOI le poser à la main : Testing Library le pose normalement elle-même,
 * mais seulement si un hook `afterEach` GLOBAL existe. Ce projet tourne avec
 * `globals: false` (chaque test importe describe/it/expect depuis "vitest"),
 * donc aucun hook global n'existe et cet enregistrement est ignoré en silence.
 *
 * Sans ce drapeau, React n'avertit plus lorsqu'une mise à jour d'état survient
 * hors de act() : un test qui oublie un `await` passerait au vert aujourd'hui
 * et deviendrait instable demain.
 */
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Démontage du dernier rendu après chaque test.
 *
 * MÊME CAUSE que ci-dessus : sans hook global, l'auto-nettoyage de Testing
 * Library ne s'installe pas. Sans cet appel, chaque render() laisserait son
 * <div> dans document.body : le deuxième test d'un fichier trouverait DEUX
 * boutons « Continuer » et getByRole échouerait sur « Found multiple
 * elements » — un symptôme trompeur qui ferait chercher le bug dans le
 * composant plutôt que dans le décor.
 */
afterEach(() => {
  cleanup();
});

/**
 * window.localStorage : présent mais VIDE dans cet environnement.
 *
 * Constat mesuré : `window.localStorage` existe en tant qu'objet, mais aucune
 * de ses méthodes n'est définie (getItem, setItem et clear valent undefined),
 * alors que `sessionStorage` et `Storage.prototype` sont, eux, complets.
 * Tout code touchant au stockage local plante donc en test avec un
 * « getItem is not a function » qui n'a aucun rapport avec le code testé.
 *
 * On installe une implémentation minimale mais fidèle, adossée à une Map.
 * Elle respecte les deux comportements dont dépend le projet : getItem
 * renvoie `null` (et non undefined) pour une clé absente, et les valeurs sont
 * converties en chaînes.
 */
class LocalStorageStub implements Storage {
  private readonly donnees = new Map<string, string>();

  get length(): number {
    return this.donnees.size;
  }

  clear(): void {
    this.donnees.clear();
  }

  getItem(cle: string): string | null {
    return this.donnees.get(String(cle)) ?? null;
  }

  key(index: number): string | null {
    return [...this.donnees.keys()][index] ?? null;
  }

  removeItem(cle: string): void {
    this.donnees.delete(String(cle));
  }

  setItem(cle: string, valeur: string): void {
    this.donnees.set(String(cle), String(valeur));
  }
}

vi.stubGlobal("localStorage", new LocalStorageStub());

/**
 * window.matchMedia : absent de jsdom.
 *
 * QUI en a besoin dans ce dépôt : le hook useIsMobile (via
 * useSyncExternalStore), donc tout ce qui monte la barre latérale ; le
 * ThemeProvider de next-themes ; et les notifications sonner.
 *
 * SUBTILITÉ : next-themes utilise l'API HISTORIQUE addListener/removeListener,
 * là où useIsMobile utilise addEventListener. Le stub doit donc répondre aux
 * DEUX, sinon le ThemeProvider échoue sur « addListener is not a function ».
 * On hérite d'EventTarget (implémenté par jsdom) plutôt que de bricoler une
 * liste d'abonnés : dispatchEvent fonctionne alors réellement, et un test peut
 * simuler un passage en affichage mobile.
 *
 * matches: false = on teste en « bureau » par défaut. Un test qui veut le
 * mobile surcharge le stub localement.
 */
class MediaQueryListStub extends EventTarget {
  readonly matches = false;

  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null =
    null;

  constructor(readonly media: string) {
    super();
  }

  /** API dépréciée, encore utilisée par next-themes. */
  addListener(rappel: EventListener | null): void {
    if (rappel) this.addEventListener("change", rappel);
  }

  /** API dépréciée, encore utilisée par next-themes. */
  removeListener(rappel: EventListener | null): void {
    if (rappel) this.removeEventListener("change", rappel);
  }
}

vi.stubGlobal(
  "matchMedia",
  (requete: string) =>
    // Cast assumé : le stub n'implémente que la partie de MediaQueryList
    // réellement consommée par le projet.
    new MediaQueryListStub(requete) as unknown as MediaQueryList,
);
