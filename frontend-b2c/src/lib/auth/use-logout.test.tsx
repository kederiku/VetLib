/**
 * Tests du hook de déconnexion.
 *
 * Deux comportements y sont verrouillés, et aucun des deux n'est
 * évident.
 *
 * 1. L'ÉCHEC ne doit pas mentir. Les cookies de session sont HttpOnly :
 *    seul le serveur peut les effacer. Si l'appel échoue, la session est
 *    donc toujours ouverte — rediriger vers la page de connexion ferait
 *    croire à une déconnexion qui n'a pas eu lieu, et laisserait un
 *    compte accessible sur un poste partagé.
 * 2. Le SUCCÈS purge TOUT le cache, pas seulement la session. Le cache
 *    contient aussi les animaux et les rendez-vous : sur un ordinateur
 *    familial, connecter un second compte afficherait sinon un instant
 *    les données du premier, servies sans que le backend soit sollicité.
 */
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getListMyAppointmentsQueryKey } from "@/lib/api/generated/owner-appointments/owner-appointments";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { getListMyPetsQueryKey } from "@/lib/api/generated/pets/pets";
import { useLogoutAction } from "@/lib/auth/use-logout";
import { buildOwner, buildOwnerAppointment, buildPet } from "@/test/fixtures";
import { createTestQueryClient, renderHookWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  replace: vi.fn(),
  reponse: vi.fn(),
  toastError: vi.fn(),
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

// Le vrai Toaster n'a rien à faire dans un test de hook ; toast, si.
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => simulations.toastError(...args) },
  Toaster: () => null,
}));

// On simule la couche HTTP plutôt que le hook généré : la vraie mutation
// TanStack est alors exercée, onSuccess et onError compris.
vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

/** Un cache qui ressemble à celui d'une session bien entamée. */
function cacheGarni() {
  const queryClient = createTestQueryClient();
  const enveloppe = (data: unknown) => ({
    status: 200,
    data,
    headers: new Headers(),
  });
  queryClient.setQueryData(getGetCurrentOwnerQueryKey(), enveloppe(buildOwner()));
  queryClient.setQueryData(getListMyPetsQueryKey(), enveloppe([buildPet()]));
  queryClient.setQueryData(
    getListMyAppointmentsQueryKey(),
    enveloppe([buildOwnerAppointment()]),
  );
  return queryClient;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useLogoutAction — déconnexion réussie", () => {
  it("renvoie vers la connexion et purge TOUT le cache, pas seulement la session", async () => {
    simulations.reponse.mockResolvedValue({ status: 204, data: undefined });
    const queryClient = cacheGarni();

    const { result } = renderHookWithProviders(() => useLogoutAction(), {
      queryClient,
    });
    result.current.logout();

    await waitFor(() =>
      expect(simulations.replace).toHaveBeenCalledWith("/login"),
    );
    expect(
      queryClient.getQueryData(getGetCurrentOwnerQueryKey()),
    ).toBeUndefined();
    // Les données métier aussi : c'est ce que removeQueries sur la seule
    // clé /me aurait laissé derrière lui.
    expect(queryClient.getQueryData(getListMyPetsQueryKey())).toBeUndefined();
    expect(
      queryClient.getQueryData(getListMyAppointmentsQueryKey()),
    ).toBeUndefined();
  });
});

describe("useLogoutAction — échec", () => {
  it("ne prétend PAS avoir déconnecté et le signale", async () => {
    simulations.reponse.mockRejectedValue(new TypeError("Failed to fetch"));
    const queryClient = cacheGarni();

    const { result } = renderHookWithProviders(() => useLogoutAction(), {
      queryClient,
    });
    result.current.logout();

    await waitFor(() =>
      expect(simulations.toastError).toHaveBeenCalledWith(
        expect.stringContaining("Déconnexion impossible"),
      ),
    );
    expect(simulations.replace).not.toHaveBeenCalled();
    // La session reste en cache : l'utilisateur est toujours connecté.
    expect(
      queryClient.getQueryData(getGetCurrentOwnerQueryKey()),
    ).toBeDefined();
  });

  it("laisse réessayer après un échec", async () => {
    simulations.reponse.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderHookWithProviders(() => useLogoutAction());

    result.current.logout();
    await waitFor(() => expect(simulations.toastError).toHaveBeenCalled());

    simulations.reponse.mockResolvedValue({ status: 204, data: undefined });
    result.current.logout();

    await waitFor(() =>
      expect(simulations.replace).toHaveBeenCalledWith("/login"),
    );
  });
});
