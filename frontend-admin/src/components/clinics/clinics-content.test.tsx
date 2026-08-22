/**
 * Tests de l'écran Cliniques, vu comme un tout.
 *
 * L'enjeu ici n'est pas le rendu — il est couvert par `data-table.test.tsx` —
 * mais le CÂBLAGE : cet écran doit être piloté par le serveur de bout en
 * bout. Une datatable qui pagine, trie ou filtre en mémoire donne exactement
 * la même impression à l'écran et ment sur toutes les pages sauf la
 * première. On vérifie donc ce que l'écran DEMANDE au réseau, et le fait
 * qu'un changement de page passe par l'URL.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClinicsContent } from "@/components/clinics/clinics-content";
import { buildClinicSummary } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  reponse: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: simulations.replace,
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => simulations.params,
  usePathname: () => "/cliniques",
}));

/** Une page de résultats, avec un total plus grand que la page. */
function pageDeCliniques(total = 137) {
  return {
    status: 200,
    data: {
      items: [
        buildClinicSummary({ id: "c1", name: "Clinique des Lilas" }),
        buildClinicSummary({
          id: "c2",
          name: "Clinique du Parc",
          city: "Lyon",
        }),
      ],
      total,
      limit: 20,
      offset: 0,
    },
    headers: new Headers(),
  };
}

/** Paramètres de requête du dernier appel réseau. */
function dernierAppel(): URLSearchParams {
  const appels = simulations.reponse.mock.calls;
  const url = appels.at(-1)?.[0] as string;
  return new URLSearchParams(url.split("?")[1] ?? "");
}

beforeEach(() => {
  simulations.params = new URLSearchParams();
  simulations.reponse.mockResolvedValue(pageDeCliniques());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ClinicsContent", () => {
  it("demande la première page triée par date décroissante", async () => {
    renderWithProviders(<ClinicsContent />);

    await waitFor(() => {
      expect(simulations.reponse).toHaveBeenCalled();
    });
    const params = dernierAppel();
    expect(params.get("limit")).toBe("20");
    expect(params.get("offset")).toBe("0");
    expect(params.get("sort_by")).toBe("created_at");
    expect(params.get("sort_dir")).toBe("desc");
    // Pas de filtre par défaut : « tous » se traduit par l'ABSENCE du
    // paramètre, pas par la chaîne "tous".
    expect(params.get("status")).toBeNull();
  });

  it("traduit la page de l'URL en offset serveur", async () => {
    // C'est le test qui distingue une vraie pagination serveur d'un
    // découpage local : page 3 en taille 20 doit demander offset=40.
    simulations.params = new URLSearchParams("page=3");
    renderWithProviders(<ClinicsContent />);

    await waitFor(() => {
      expect(dernierAppel().get("offset")).toBe("40");
    });
  });

  it("écrit la page suivante dans l'URL plutôt que de découper en mémoire", async () => {
    const utilisateur = userEvent.setup();
    renderWithProviders(<ClinicsContent />);
    await screen.findByText("Clinique des Lilas");

    await utilisateur.click(
      screen.getByRole("button", { name: "Page suivante" }),
    );

    // replace et non push : filtrer n'est pas une étape de navigation, le
    // bouton « précédent » ne doit pas rejouer chaque changement de page.
    expect(simulations.replace).toHaveBeenCalledWith("?page=2", {
      scroll: false,
    });
  });

  it("envoie le filtre de statut lu dans l'URL", async () => {
    simulations.params = new URLSearchParams("statut=inactive");
    renderWithProviders(<ClinicsContent />);

    await waitFor(() => {
      expect(dernierAppel().get("status")).toBe("inactive");
    });
  });

  it("affiche le LIBELLÉ du filtre courant, pas la valeur d'API", async () => {
    // Sans la table `items` passée au Select de Base UI, la barre d'outils
    // afficherait « inactive » -- le jargon du contrat OpenAPI -- au lieu du
    // mot que l'exploitant connaît.
    simulations.params = new URLSearchParams("statut=inactive");
    renderWithProviders(<ClinicsContent />);

    expect(
      screen.getByRole("combobox", { name: "Filtrer par statut" }),
    ).toHaveTextContent("Suspendues");
  });

  it("ignore un filtre forgé dans l'URL", async () => {
    // Liste blanche : `?statut=supprimees` retombe sur « tous », donc sur
    // l'absence de paramètre. Rien d'inventé ne part vers le backend.
    simulations.params = new URLSearchParams("statut=supprimees");
    renderWithProviders(<ClinicsContent />);

    await waitFor(() => {
      expect(simulations.reponse).toHaveBeenCalled();
    });
    expect(dernierAppel().get("status")).toBeNull();
  });

  it("envoie la recherche après la pause, et pas à chaque frappe", async () => {
    const utilisateur = userEvent.setup();
    renderWithProviders(<ClinicsContent />);
    await screen.findByText("Clinique des Lilas");
    simulations.replace.mockClear();

    await utilisateur.type(
      screen.getByRole("searchbox", { name: /rechercher/i }),
      "lilas",
    );

    // Cinq frappes, une seule écriture d'URL -- donc un seul appel réseau.
    await waitFor(() => {
      expect(simulations.replace).toHaveBeenCalledExactlyOnceWith("?q=lilas", {
        scroll: false,
      });
    });
  });
});
