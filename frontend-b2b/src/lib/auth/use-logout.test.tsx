/**
 * Tests de la déconnexion du personnel.
 *
 * Trois choses doivent se produire ensemble à la déconnexion : quitter la
 * page protégée, effacer le drapeau de session, et VIDER LE CACHE. Ce dernier
 * point est le plus important sur un poste d'accueil partagé : sans lui, la
 * personne suivante qui se connecte verrait, l'espace d'un instant, les
 * données de la précédente — nom, clinique, agenda.
 *
 * En cas d'échec, rien de tout cela ne doit arriver : les cookies étant
 * HttpOnly, seul le serveur peut clore la session. Prétendre le contraire
 * laisserait un compte ouvert sur un poste que l'on croit libéré.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getGetCurrentUserQueryKey } from "@/lib/api/generated/auth/auth";
import { setSessionHint, getSessionHint } from "@/lib/auth/session-hint";
import { useLogoutAction } from "@/lib/auth/use-logout";
import { buildUser } from "@/test/fixtures";
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
  useRouter: () => ({ replace: simulations.replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard",
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
  queryClient.setQueryData(getGetCurrentUserQueryKey(), {
    status: 200,
    data: buildUser(),
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
    // Point de confidentialité sur un poste partagé : sans cela, la
    // personne suivante verrait les données de la précédente.
    simulations.reponse.mockResolvedValue({ status: 204, data: undefined });
    const { result, queryClient } = monter();

    result.current.logout();
    await attendre();

    expect(
      queryClient.getQueryData(getGetCurrentUserQueryKey()),
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
      queryClient.getQueryData(getGetCurrentUserQueryKey()),
    ).toBeDefined();
  });
});
