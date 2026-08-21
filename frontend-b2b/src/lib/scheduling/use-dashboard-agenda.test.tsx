/**
 * Tests des dérivations du tableau de bord.
 *
 * Ce hook prend la semaine d'agenda renvoyée par l'API et en tire les trois
 * listes affichées à l'accueil : la journée en cours, les demandes à confirmer
 * d'ici sept jours, et la charge par praticien. Toute la logique est ici — les
 * composants ne font que l'afficher.
 *
 * Deux règles y sont critiques et invisibles : le regroupement se fait sur le
 * jour CLINIQUE (heure de Paris) et non sur le fuseau du poste, et les
 * rendez-vous annulés sortent de la journée sans sortir des demandes à
 * confirmer. Une erreur ici fait disparaître des rendez-vous de l'écran que
 * l'accueil garde ouvert toute la journée.
 *
 * On simule `useGetAgenda` plutôt que le réseau : les états se posent alors
 * de façon synchrone, sans attente ni avertissement de rendu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDashboardAgenda } from "@/lib/scheduling/use-dashboard-agenda";
import { buildAgendaEntry } from "@/test/fixtures";
import { renderHookWithProviders } from "@/test/render";

// vi.hoisted : vi.mock est remonté en tête de fichier, sa fabrique s'exécute
// pendant la phase d'import — avant l'initialisation d'un const ordinaire.
const simulations = vi.hoisted(() => ({ useGetAgenda: vi.fn() }));

vi.mock("@/lib/api/generated/scheduling/scheduling", async (importOriginal) => ({
  // On repart du VRAI module : useConfirmAppointment, useCompleteAppointment
  // et les fabriques de clés restent intactes. Sans ce report, les composants
  // qui les utilisent planteraient à trois niveaux de leur cause réelle.
  ...(await importOriginal<
    typeof import("@/lib/api/generated/scheduling/scheduling")
  >()),
  useGetAgenda: simulations.useGetAgenda,
}));

/**
 * Faux retour de requête, réduit à ce que le hook lit réellement.
 *
 * RAPPEL : simuler le hook court-circuite son `select`. La donnée doit donc
 * être fournie DÉJÀ sélectionnée — le tableau d'entrées, et non l'enveloppe
 * { status, data, headers } du client HTTP.
 */
function requete(surcharges: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...surcharges,
  };
}

beforeEach(() => {
  // parisToday() est relu à chaque rendu : on fige l'horloge au jeudi
  // 20 août 2026, 11h à Paris. shouldAdvanceTime laisse les minuteries
  // avancer, sans quoi les utilitaires d'attente se bloqueraient.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-20T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useDashboardAgenda — états de chargement", () => {
  it("ne dérive rien tant que la donnée n'est pas là", () => {
    // undefined et non un tableau vide : l'affichage doit pouvoir
    // distinguer « je ne sais pas encore » de « la journée est libre ».
    simulations.useGetAgenda.mockReturnValue(requete({ isPending: true }));
    const { result } = renderHookWithProviders(() => useDashboardAgenda());

    expect(result.current.isPending).toBe(true);
    expect(result.current.todayEntries).toBeUndefined();
    expect(result.current.byResourceToday).toBeUndefined();
  });

  it("propage l'échec de la requête", () => {
    simulations.useGetAgenda.mockReturnValue(requete({ isError: true }));
    const { result } = renderHookWithProviders(() => useDashboardAgenda());

    expect(result.current.isError).toBe(true);
  });
});

describe("useDashboardAgenda — journée en cours", () => {
  it("ne retient que les rendez-vous du jour clinique", () => {
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: [
          buildAgendaEntry({ id: "aujourdhui", starts_at: "2026-08-20T07:00:00Z" }),
          buildAgendaEntry({ id: "demain", starts_at: "2026-08-21T07:00:00Z" }),
          buildAgendaEntry({ id: "hier", starts_at: "2026-08-19T07:00:00Z" }),
        ],
      }),
    );
    const { result } = renderHookWithProviders(() => useDashboardAgenda());

    expect(result.current.todayEntries?.map((e) => e.id)).toEqual(["aujourdhui"]);
  });

  it("range un rendez-vous de fin de soirée dans le bon jour", () => {
    // 21:30 UTC le 20 août = 23:30 à Paris, donc encore aujourd'hui. Avec
    // le fuseau du navigateur, ce rendez-vous pourrait basculer au lendemain.
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: [buildAgendaEntry({ id: "tardif", starts_at: "2026-08-20T21:30:00Z" })],
      }),
    );
    const { result } = renderHookWithProviders(() => useDashboardAgenda());

    expect(result.current.todayEntries?.map((e) => e.id)).toEqual(["tardif"]);
  });

  it("écarte les rendez-vous annulés de la journée", () => {
    // Ils ne sont plus à honorer : les laisser gonflerait le compteur et
    // ferait croire à une journée plus chargée qu'elle ne l'est.
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: [
          buildAgendaEntry({ id: "actif", starts_at: "2026-08-20T07:00:00Z" }),
          buildAgendaEntry({
            id: "annule",
            starts_at: "2026-08-20T08:00:00Z",
            status: "cancelled",
          }),
        ],
      }),
    );
    const { result } = renderHookWithProviders(() => useDashboardAgenda());

    expect(result.current.todayEntries?.map((e) => e.id)).toEqual(["actif"]);
  });

  it("trie la journée dans l'ordre chronologique", () => {
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: [
          buildAgendaEntry({ id: "midi", starts_at: "2026-08-20T10:00:00Z" }),
          buildAgendaEntry({ id: "matin", starts_at: "2026-08-20T07:00:00Z" }),
          buildAgendaEntry({ id: "soir", starts_at: "2026-08-20T16:00:00Z" }),
        ],
      }),
    );
    const { result } = renderHookWithProviders(() => useDashboardAgenda());

    expect(result.current.todayEntries?.map((e) => e.id)).toEqual([
      "matin",
      "midi",
      "soir",
    ]);
  });

  it("renvoie une liste vide quand la journée est libre", () => {
    simulations.useGetAgenda.mockReturnValue(requete({ data: [] }));
    const { result } = renderHookWithProviders(() => useDashboardAgenda());

    expect(result.current.todayEntries).toEqual([]);
  });
});

describe("useDashboardAgenda — demandes à confirmer", () => {
  it("retient les demandes d'aujourd'hui à J+7", () => {
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: [
          buildAgendaEntry({
            id: "aujourdhui",
            starts_at: "2026-08-20T07:00:00Z",
            status: "pending",
          }),
          buildAgendaEntry({
            id: "dans-trois-jours",
            starts_at: "2026-08-23T07:00:00Z",
            status: "pending",
          }),
        ],
      }),
    );
    const { result } = renderHookWithProviders(() => useDashboardAgenda());

    expect(result.current.pendingNext7?.map((e) => e.id)).toEqual([
      "aujourdhui",
      "dans-trois-jours",
    ]);
  });

  it("écarte les demandes déjà passées", () => {
    // Confirmer un rendez-vous d'avant-hier n'a plus d'utilité : le laisser
    // dans la liste d'action entretiendrait une tâche impossible à solder.
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: [
          buildAgendaEntry({
            id: "passe",
            starts_at: "2026-08-18T07:00:00Z",
            status: "pending",
          }),
        ],
      }),
    );
    const { result } = renderHookWithProviders(() => useDashboardAgenda());

    expect(result.current.pendingNext7).toEqual([]);
  });

  it("ne retient QUE les demandes en attente", () => {
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: [
          buildAgendaEntry({ id: "confirme", starts_at: "2026-08-20T07:00:00Z" }),
          buildAgendaEntry({
            id: "attente",
            starts_at: "2026-08-20T08:00:00Z",
            status: "pending",
          }),
        ],
      }),
    );
    const { result } = renderHookWithProviders(() => useDashboardAgenda());

    expect(result.current.pendingNext7?.map((e) => e.id)).toEqual(["attente"]);
  });

  it("conserve une demande annulée hors de la journée mais pas des demandes", () => {
    // Un rendez-vous annulé n'est plus « en attente » : il ne doit
    // apparaître dans aucune des deux listes.
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: [
          buildAgendaEntry({
            id: "annule",
            starts_at: "2026-08-20T07:00:00Z",
            status: "cancelled",
          }),
        ],
      }),
    );
    const { result } = renderHookWithProviders(() => useDashboardAgenda());

    expect(result.current.todayEntries).toEqual([]);
    expect(result.current.pendingNext7).toEqual([]);
  });
});

describe("useDashboardAgenda — charge par praticien", () => {
  it("compte les rendez-vous du jour par praticien", () => {
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: [
          buildAgendaEntry({
            id: "1",
            starts_at: "2026-08-20T07:00:00Z",
            resource_id: "r1",
            resource_name: "Dr Martin",
          }),
          buildAgendaEntry({
            id: "2",
            starts_at: "2026-08-20T08:00:00Z",
            resource_id: "r1",
            resource_name: "Dr Martin",
          }),
          buildAgendaEntry({
            id: "3",
            starts_at: "2026-08-20T09:00:00Z",
            resource_id: "r2",
            resource_name: "Dr Leroy",
          }),
        ],
      }),
    );
    const { result } = renderHookWithProviders(() => useDashboardAgenda());

    expect(result.current.byResourceToday).toEqual([
      { resourceId: "r1", resourceName: "Dr Martin", count: 2 },
      { resourceId: "r2", resourceName: "Dr Leroy", count: 1 },
    ]);
  });

  it("classe du plus chargé au moins chargé", () => {
    // C'est l'information utile d'un coup d'oeil : qui est débordé.
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: [
          buildAgendaEntry({
            id: "1",
            starts_at: "2026-08-20T07:00:00Z",
            resource_id: "calme",
            resource_name: "Dr Calme",
          }),
          buildAgendaEntry({
            id: "2",
            starts_at: "2026-08-20T08:00:00Z",
            resource_id: "charge",
            resource_name: "Dr Chargé",
          }),
          buildAgendaEntry({
            id: "3",
            starts_at: "2026-08-20T09:00:00Z",
            resource_id: "charge",
            resource_name: "Dr Chargé",
          }),
        ],
      }),
    );
    const { result } = renderHookWithProviders(() => useDashboardAgenda());

    expect(result.current.byResourceToday?.[0].resourceName).toBe("Dr Chargé");
  });

  it("ne compte pas les praticiens sans rendez-vous du jour", () => {
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: [
          buildAgendaEntry({
            id: "demain",
            starts_at: "2026-08-21T07:00:00Z",
            resource_id: "r1",
          }),
        ],
      }),
    );
    const { result } = renderHookWithProviders(() => useDashboardAgenda());

    expect(result.current.byResourceToday).toEqual([]);
  });
});
