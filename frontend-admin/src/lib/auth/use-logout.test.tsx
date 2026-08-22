/**
 * Tests de la déconnexion du back-office.
 *
 * Trois choses doivent se produire ensemble à la déconnexion : quitter la
 * page protégée, effacer le drapeau de session, et VIDER LE CACHE. Ce dernier
 * point est ici le plus important de tous : le cache de cette application
 * contient la liste de TOUTES les cliniques et de TOUS les propriétaires de
 * la plateforme. Le laisser derrière soi sur un poste partagé serait le pire
 * oubli possible.
 *
 * En cas d'échec, rien de tout cela ne doit arriver : les cookies étant
 * HttpOnly, seul le serveur peut clore la session. Prétendre le contraire
 * laisserait un compte ouvert sur un poste que l'on croit libéré.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getGetCurrentAdminQueryKey } from "@/lib/api/generated/admin-auth/admin-auth";
import { setSessionHint, getSessionHint } from "@/lib/auth/session-hint";
import { useLogoutAction } from "@/lib/auth/use-logout";
import { buildAdmin } from "@/test/fixtures";
import { createTestQueryClient, renderHookWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  reponse: vi.fn(),
  replace: vi.fn(),
  toastErreur: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: simulations.toastErreur },
  Toaster: () => null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: simulations.replace,
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/tableau-de-bord",
  useSearchParams: () => new URLSearchParams(),
}));

// On simule la couche HTTP : la vraie mutation TanStack est alors exercée,
// avec ses callbacks de succès et d'erreur.
vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

/** Monte le hook avec une session déjà en cache et un drapeau posé. */
function monter() {
  setSessionHint();
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(getGetCurrentAdminQueryKey(), {
    status: 200,
    data: buildAdmin(),
    headers: new Headers(),
  });
  return renderHookWithProviders(() => useLogoutAction(), { queryClient });
}

/** Laisse la mutation se résoudre. */
const attendre = () => new Promise((resoudre) => setTimeout(resoudre, 0));

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useLogoutAction — déconnexion réussie", () => {
  it("quitte la page protégée", async () => {
    simulations.reponse.mockResolvedValue({ status: 204, data: undefined });
    const { result } = monter();

    result.current.logout();
    await attendre();

    expect(simulations.replace).toHaveBeenCalledWith("/login");
  });

  it("efface le drapeau de session", async () => {
    simulations.reponse.mockResolvedValue({ status: 204, data: undefined });
    const { result } = monter();

    result.current.logout();
    await attendre();

    expect(getSessionHint()).toBe(false);
  });

  it("vide entièrement le cache", async () => {
    // Point de confidentialite : ce cache contient le parc entier.
    // Sans purge, la personne suivante le verrait un instant.
    simulations.reponse.mockResolvedValue({ status: 204, data: undefined });
    const { result, queryClient } = monter();

    result.current.logout();
    await attendre();

    expect(
      queryClient.getQueryData(getGetCurrentAdminQueryKey()),
    ).toBeUndefined();
  });
});

describe("useLogoutAction — échec", () => {
  it("ne prétend PAS avoir déconnecté", async () => {
    // Les cookies sont HttpOnly : sans réponse du serveur, la session est
    // toujours ouverte.
    simulations.reponse.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = monter();

    result.current.logout();
    await attendre();

    expect(simulations.replace).not.toHaveBeenCalled();
    expect(getSessionHint()).toBe(true);
  });

  it("prévient explicitement du problème", async () => {
    // Un échec silencieux laisserait croire à une déconnexion effective.
    simulations.reponse.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = monter();

    result.current.logout();
    await attendre();

    expect(simulations.toastErreur).toHaveBeenCalled();
  });

  it("conserve le cache", async () => {
    simulations.reponse.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result, queryClient } = monter();

    result.current.logout();
    await attendre();

    expect(
      queryClient.getQueryData(getGetCurrentAdminQueryKey()),
    ).toBeDefined();
  });
});
