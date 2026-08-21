/**
 * Tests de l'enregistrement d'une section de la fiche propriétaire.
 *
 * C'EST LE TEST LE PLUS IMPORTANT DE L'ECRAN « Mon compte ». Le backend
 * n'expose qu'un PUT de remplacement complet, alors que la page est
 * découpée en cartes indépendantes : si la recomposition est fausse,
 * enregistrer son prénom EFFACE silencieusement son adresse. Rien à
 * l'écran ne le signalerait — l'utilisateur ne s'en apercevrait qu'à sa
 * prochaine visite sur la page.
 *
 * Le second piège est plus subtil encore : lire l'état serveur au RENDU
 * plutôt qu'à l'ENVOI ressusciterait les valeurs d'avant
 * l'enregistrement d'une autre carte. On le vérifie explicitement.
 */
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { useSaveOwnerProfile } from "@/lib/account/use-save-owner-profile";
import { buildAddress, buildOwner } from "@/test/fixtures";
import { createTestQueryClient, renderHookWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ reponse: vi.fn() }));

vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

/** Le corps JSON du dernier PUT parti. */
function dernierCorps(): Record<string, unknown> {
  const [, options] = simulations.reponse.mock.calls.at(-1) as [
    string,
    { body: string },
  ];
  return JSON.parse(options.body) as Record<string, unknown>;
}

function preparer(surcharges: Parameters<typeof buildOwner>[0] = {}) {
  const queryClient = createTestQueryClient();
  const owner = buildOwner(surcharges);
  queryClient.setQueryData(getGetCurrentOwnerQueryKey(), {
    status: 200,
    data: owner,
    headers: new Headers(),
  });
  // Par defaut le serveur renvoie ce qu'on lui envoie, comme le vrai PUT.
  simulations.reponse.mockImplementation((_url: string, options: { body: string }) =>
    Promise.resolve({
      status: 200,
      data: { ...owner, ...JSON.parse(options.body) },
      headers: new Headers(),
    }),
  );
  const { result } = renderHookWithProviders(() => useSaveOwnerProfile(), {
    queryClient,
  });
  return { result, queryClient };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useSaveOwnerProfile", () => {
  it("envoie la fiche COMPLETE, pas seulement la section modifiée", async () => {
    // Le coeur du sujet : un PUT partiel effacerait tout le reste.
    const { result } = preparer({
      first_name: "Marie",
      last_name: "Dupont",
      phone: "0612345678",
      address: buildAddress({ city: "Montpellier" }),
      notification_preferences: { email: true, sms: true },
    });

    await result.current.save({ first_name: "Marion" });

    const corps = dernierCorps();
    expect(corps.first_name).toBe("Marion");
    // Tout ce que la carte ne touche pas repart tel quel.
    expect(corps.last_name).toBe("Dupont");
    expect(corps.phone).toBe("0612345678");
    expect(corps.address).toMatchObject({ city: "Montpellier" });
    expect(corps.notification_preferences).toEqual({ email: true, sms: true });
  });

  it("lit l'état serveur à L'ENVOI et non au rendu", async () => {
    // Scenario reel : la carte Adresse enregistre, puis la carte
    // Informations enregistre a son tour. Si le hook avait capture
    // l'etat par fermeture au rendu, il ressusciterait l'ANCIENNE
    // adresse -- une perte de donnees invisible.
    const { result, queryClient } = preparer({ address: null });

    // Une autre carte a enregistre entre-temps : le cache a change.
    queryClient.setQueryData(getGetCurrentOwnerQueryKey(), {
      status: 200,
      data: buildOwner({ address: buildAddress({ city: "Lyon" }) }),
      headers: new Headers(),
    });

    await result.current.save({ first_name: "Marion" });

    expect(dernierCorps().address).toMatchObject({ city: "Lyon" });
  });

  it("met à jour le cache avec la réponse, sans requête supplémentaire", async () => {
    // La reponse du PUT EST le OwnerResponse a jour : la sidebar, le
    // menu du compte et l'invite du tableau de bord se rafraichissent
    // sans re-interroger /me.
    const { result, queryClient } = preparer({ first_name: "Marie" });

    await result.current.save({ first_name: "Marion" });

    await waitFor(() => {
      const cache = queryClient.getQueryData<{ data: { first_name: string } }>(
        getGetCurrentOwnerQueryKey(),
      );
      expect(cache?.data.first_name).toBe("Marion");
    });
    // Un seul appel : pas de refetch de /me derriere.
    expect(simulations.reponse).toHaveBeenCalledTimes(1);
  });

  it("refuse d'enregistrer si la fiche n'est pas chargée", async () => {
    // Envoyer un PUT sans base connue effacerait tout ce qu'on ne
    // fournit pas : mieux vaut echouer bruyamment.
    const queryClient = createTestQueryClient();
    const { result } = renderHookWithProviders(() => useSaveOwnerProfile(), {
      queryClient,
    });

    await expect(result.current.save({ first_name: "Marion" })).rejects.toThrow();
    expect(simulations.reponse).not.toHaveBeenCalled();
  });

  it("laisse remonter l'échec pour que le formulaire le traduise", async () => {
    // Les erreurs 422 doivent s'afficher SOUS le champ concerne : c'est
    // applyServerErrors qui s'en charge, dans le formulaire.
    const { result } = preparer();
    simulations.reponse.mockRejectedValue(
      Object.assign(new Error("422"), { status: 422, detail: "Invalide." }),
    );

    await expect(result.current.save({ first_name: "" })).rejects.toBeDefined();
  });
});
