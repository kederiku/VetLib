/**
 * Rendu de test avec les providers de l'application (back-office plateforme).
 *
 * Reproduit src/app/providers.tsx (ThemeProvider > QueryClientProvider) et, en
 * option, la partie CLIENTE de src/components/layout/app-shell.tsx
 * (TooltipProvider + SidebarProvider).
 *
 * Pourquoi une option et non un défaut : app-shell est un Server Component
 * asynchrone qui lit les cookies de la requête, donc impossible à monter dans
 * un test. Sa moitié cliente doit être reconstituée ici, mais UNIQUEMENT pour
 * les composants qui en dépendent (en-tête, barre latérale). La monter partout
 * ajouterait du balisage parasite à chaque test.
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
import { ThemeProvider } from "next-themes";
import type { ReactElement, ReactNode } from "react";

import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Un QueryClient jetable, réglé pour les tests.
 *
 * POURQUOI UN CLIENT NEUF PAR TEST : le QueryClient EST le cache. Partagé, il
 * transporterait les données d'un test au suivant. Avec staleTime à 30 s, une
 * entrée écrite par le test A resterait « fraîche » pendant le test B : aucune
 * requête ne partirait et B verrait les données de A. Les tests deviendraient
 * dépendants de leur ORDRE d'exécution — panne coûteuse, car elle disparaît
 * dès qu'on relance le test seul.
 *
 * retry: false : un échec de requête est ici VOULU, pas une panne passagère.
 * gcTime: Infinity : supprime la minuterie de nettoyage, que Vitest
 * signalerait comme encore active en fin de fichier.
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
  /**
   * Monte TooltipProvider et SidebarProvider, la moitié cliente de l'AppShell.
   * Indispensable pour l'en-tête (dont le bouton de repli appelle le contexte
   * de la barre latérale) et pour la barre latérale elle-même.
   */
  withAppShell?: boolean;
};

function creerEnveloppe({
  queryClient,
  withAppShell,
}: {
  queryClient: QueryClient;
  withAppShell: boolean;
}) {
  return function Enveloppe({ children }: { children: ReactNode }) {
    const contenu = withAppShell ? (
      <TooltipProvider>
        <SidebarProvider>{children}</SidebarProvider>
      </TooltipProvider>
    ) : (
      children
    );

    // defaultTheme="light" et enableSystem={false} : thème DÉTERMINISTE. En
    // production le défaut est "system", mais dépendre en test de la
    // préférence du système rendrait imprévisibles les assertions portant sur
    // la classe "dark".
    return (
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        disableTransitionOnChange
      >
        <QueryClientProvider client={queryClient}>{contenu}</QueryClientProvider>
      </ThemeProvider>
    );
  };
}

export function renderWithProviders(
  ui: ReactElement,
  options: Omit<RenderOptions, "wrapper"> & OptionsProviders = {},
) {
  const {
    queryClient = createTestQueryClient(),
    withAppShell = false,
    ...optionsRendu
  } = options;

  return {
    ...render(ui, {
      wrapper: creerEnveloppe({ queryClient, withAppShell }),
      ...optionsRendu,
    }),
    queryClient,
  };
}

export function renderHookWithProviders<Resultat, Props>(
  hook: (props: Props) => Resultat,
  options: Omit<RenderHookOptions<Props>, "wrapper"> & OptionsProviders = {},
) {
  const {
    queryClient = createTestQueryClient(),
    withAppShell = false,
    ...optionsHook
  } = options;

  return {
    ...renderHook(hook, {
      wrapper: creerEnveloppe({ queryClient, withAppShell }),
      ...optionsHook,
    }),
    queryClient,
  };
}
