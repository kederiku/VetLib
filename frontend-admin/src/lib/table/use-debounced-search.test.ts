/**
 * Tests du champ de recherche différé.
 *
 * Deux propriétés à garantir, et une non-propriété à documenter :
 *
 * - la valeur AFFICHÉE change immédiatement (sinon le champ « avale » les
 *   frappes rapides) ;
 * - la valeur PROPAGÉE ne part qu'une fois, après la pause — une requête par
 *   caractère saturerait le backend et ferait clignoter le tableau ;
 * - le hook ne se resynchronise JAMAIS depuis l'URL : ce serait une mise à
 *   jour d'état dans un effet (interdite par `react-hooks/set-state-in-effect`
 *   dans ce projet) et, fonctionnellement, cela effacerait des caractères
 *   sous les doigts de l'utilisateur.
 *
 * `vi.useFakeTimers()` est utilisé ICI et nulle part ailleurs, avec un retour
 * aux vraies minuteries en `afterEach` : un faux temps qui fuit sur les
 * autres fichiers ferait échouer tout ce qui attend un délai réel.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedSearch } from "@/lib/table/use-debounced-search";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDebouncedSearch", () => {
  it("affiche la frappe immédiatement mais ne propage rien tout de suite", () => {
    const onValider = vi.fn();
    const { result } = renderHook(() => useDebouncedSearch("", onValider));

    act(() => {
      result.current.changer("lil");
    });

    expect(result.current.valeur).toBe("lil");
    expect(onValider).not.toHaveBeenCalled();
  });

  it("ne propage qu'UNE fois, la dernière valeur, après la pause", () => {
    const onValider = vi.fn();
    const { result } = renderHook(() => useDebouncedSearch("", onValider));

    act(() => {
      result.current.changer("l");
    });
    act(() => {
      vi.advanceTimersByTime(100);
      result.current.changer("li");
    });
    act(() => {
      vi.advanceTimersByTime(100);
      result.current.changer("lilas");
    });
    // À ce stade, 200 ms se sont écoulées mais chaque frappe a réarmé la
    // minuterie : rien n'est encore parti.
    expect(onValider).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onValider).toHaveBeenCalledExactlyOnceWith("lilas");
  });

  it("efface et propage IMMÉDIATEMENT au clic sur la croix", () => {
    // Un clic sur « effacer » attend un effet net : le faire attendre
    // 300 ms donnerait l'impression que le bouton n'a pas marché.
    const onValider = vi.fn();
    const { result } = renderHook(() => useDebouncedSearch("lilas", onValider));

    act(() => {
      result.current.effacer();
    });

    expect(result.current.valeur).toBe("");
    expect(onValider).toHaveBeenCalledExactlyOnceWith("");
  });

  it("ne propage rien quand l'affichage rattrape l'URL", () => {
    // C'est la garde anti-boucle : après propagation, `valeurUrl` rejoint
    // `valeur` et l'effet suivant doit sortir sans réarmer de minuterie.
    const onValider = vi.fn();
    const { rerender } = renderHook(
      ({ url }) => useDebouncedSearch(url, onValider),
      { initialProps: { url: "lilas" } },
    );

    rerender({ url: "lilas" });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onValider).not.toHaveBeenCalled();
  });

  it("n'écrase PAS la saisie en cours quand l'URL change de son côté", () => {
    const onValider = vi.fn();
    const { result, rerender } = renderHook(
      ({ url }) => useDebouncedSearch(url, onValider),
      { initialProps: { url: "" } },
    );

    act(() => {
      result.current.changer("lilas");
    });
    rerender({ url: "parc" });

    // Comportement assumé et documenté dans le module : le champ garde ce
    // que l'utilisateur a tapé. Un champ figé est moins grave qu'un champ
    // qui s'efface tout seul.
    expect(result.current.valeur).toBe("lilas");
  });
});
