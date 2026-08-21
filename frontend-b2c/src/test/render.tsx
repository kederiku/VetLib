/**
 * Rendu de test avec les providers de l'application (portail B2C).
 *
 * Un composant testé « à nu » avec render() plante dès qu'il appelle un hook
 * généré par Orval : ceux-ci exigent un QueryClientProvider au-dessus d'eux.
 * Ce module reproduit l'arbre de providers de src/app/providers.tsx qui, côté
 * B2C, se réduit au seul QueryClientProvider — aucun autre contexte React
 * n'existe dans ce projet.
 */
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  render,
  renderHook,
  type RenderHookOptions,
  type RenderOptions,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

/**
 * Un QueryClient jetable, réglé pour les tests.
 *
 * POURQUOI UN CLIENT NEUF PAR TEST : le QueryClient EST le cache. Partagé, il
 * transporterait les données d'un test au suivant. Avec staleTime à 30 s (le
 * réglage de production, conservé ici pour rester fidèle), une entrée écrite
 * par le test A resterait « fraîche » pendant le test B : aucune requête ne
 * partirait et B verrait les données de A. Les tests deviendraient alors
 * dépendants de leur ORDRE d'exécution — la panne la plus coûteuse à traquer,
 * parce qu'elle disparaît dès qu'on lance le test seul.
 *
 * retry: false : un échec de requête dans un test est VOULU, ce n'est pas une
 * panne réseau passagère. Le défaut (trois tentatives espacées) ferait durer
 * chaque test d'erreur plusieurs secondes et laisserait des minuteries vivantes
 * après le démontage.
 *
 * gcTime: Infinity : supprime la minuterie de nettoyage du cache, que Vitest
 * signalerait sinon comme encore active en fin de fichier. Aucune fuite : le
 * client entier disparaît avec le test.
 *
 * Les onError vides remplacent l'option `logger` supprimée en v5 : une erreur
 * attendue ne doit rien écrire dans la console.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: () => {} }),
    mutationCache: new MutationCache({ onError: () => {} }),
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}

type OptionsProviders = {
  /** Client pré-rempli (setQueryData) pour amorcer un cache avant le rendu. */
  queryClient?: QueryClient;
};

/**
 * Fabrique l'enveloppe attendue par l'option `wrapper` de Testing Library.
 * Définie hors du composant appelant pour rester une fonction statique.
 */
function creerEnveloppe(queryClient: QueryClient) {
  return function Enveloppe({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

/**
 * render() de Testing Library, enveloppé dans les providers de l'application.
 *
 * Renvoie en plus le queryClient utilisé : un test peut ainsi AMORCER le cache
 * avant le rendu plutôt que de simuler un module — la vraie chaîne de code est
 * alors exercée, `select` compris.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: Omit<RenderOptions, "wrapper"> & OptionsProviders = {},
) {
  const { queryClient = createTestQueryClient(), ...optionsRendu } = options;

  return {
    ...render(ui, { wrapper: creerEnveloppe(queryClient), ...optionsRendu }),
    queryClient,
  };
}

/** Même chose pour un hook isolé. */
export function renderHookWithProviders<Resultat, Props>(
  hook: (props: Props) => Resultat,
  options: Omit<RenderHookOptions<Props>, "wrapper"> & OptionsProviders = {},
) {
  const { queryClient = createTestQueryClient(), ...optionsHook } = options;

  return {
    ...renderHook(hook, { wrapper: creerEnveloppe(queryClient), ...optionsHook }),
    queryClient,
  };
}
