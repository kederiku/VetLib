/**
 * Tests de la page « Mes rendez-vous ».
 *
 * Trois décisions y sont verrouillées, et aucune n'est évidente en
 * relisant le composant :
 *
 * 1. le partage à venir / passés se fait sur l'HEURE et non sur le
 *    statut — un rendez-vous futur annulé reste dans « À venir », car le
 *    propriétaire doit voir que son créneau de jeudi est tombé ;
 * 2. un onglet vide APRES FILTRE ne dit pas la même chose qu'un écran
 *    vide de premier usage : réutiliser « prenez votre premier
 *    rendez-vous » quand la personne en a douze mais a filtré trop fin
 *    serait un contresens ;
 * 3. les filtres ne s'affichent que s'ils ont quelque chose à trier.
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppointmentsContent } from "@/components/appointments/appointments-content";
import { getListMyAppointmentsQueryKey } from "@/lib/api/generated/owner-appointments/owner-appointments";
import { getListMyPetsQueryKey } from "@/lib/api/generated/pets/pets";
import type {
  OwnerAppointmentResponse,
  PetResponse,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import { buildOwnerAppointment, buildPet } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

const navigation = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/rendez-vous",
  useRouter: () => ({
    push: vi.fn(),
    replace: navigation.replace,
    prefetch: vi.fn(),
  }),
  useSearchParams: () => navigation.params,
}));

// Le vrai "maintenant" du composant est new Date() : les fixtures sont
// datees de 2026, donc "futur" et "passe" dependent de l'horloge. On la
// fige pour que les tests ne changent pas de sens avec le temps.
const MAINTENANT = new Date("2026-08-20T10:00:00Z");

function afficher(
  appointments: OwnerAppointmentResponse[],
  pets: PetResponse[] = [],
) {
  const queryClient = createTestQueryClient();
  const enveloppe = (data: unknown) => ({
    status: 200,
    data,
    headers: new Headers(),
  });
  queryClient.setQueryData(
    getListMyAppointmentsQueryKey(),
    enveloppe(appointments),
  );
  queryClient.setQueryData(getListMyPetsQueryKey(), enveloppe(pets));
  return renderWithProviders(<AppointmentsContent />, { queryClient });
}

beforeEach(() => {
  navigation.params = new URLSearchParams();
  navigation.replace.mockClear();
  vi.setSystemTime(MAINTENANT);
});

const FUTUR = "2026-08-25T07:00:00Z";
// De VRAIS UUID : le parsing defensif de l'URL rejette toute autre forme,
// un identifiant "rex" retomberait sur "tous les animaux" et le test
// verifierait le repli au lieu du filtre.
const REX = "00000000-0000-0000-0000-0000000000e1";
const MISTIGRI = "00000000-0000-0000-0000-0000000000e2";
const PASSE = "2026-08-05T07:00:00Z";

describe("AppointmentsContent — états", () => {
  it("propose de commencer quand aucun rendez-vous n'existe", () => {
    afficher([]);

    expect(
      screen.getByText("Aucun rendez-vous pour l'instant"),
    ).toBeInTheDocument();
    // Pas d'onglets : deux onglets vides seraient absurdes.
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("garde le titre et l'accès à la réservation en toutes circonstances", () => {
    afficher([]);

    expect(
      screen.getByRole("heading", { name: "Mes rendez-vous", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Prendre rendez-vous" }).length,
    ).toBeGreaterThan(0);
  });
});

describe("AppointmentsContent — onglets", () => {
  it("compte les rendez-vous de chaque onglet dans son libellé", () => {
    afficher([
      buildOwnerAppointment({ id: "1", starts_at: FUTUR }),
      buildOwnerAppointment({ id: "2", starts_at: PASSE }),
      buildOwnerAppointment({ id: "3", starts_at: PASSE }),
    ]);

    expect(screen.getByRole("tab", { name: "À venir (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Passés (2)" })).toBeInTheDocument();
  });

  it("classe un rendez-vous futur ANNULÉ dans « À venir »", () => {
    // Le partage se fait sur l'heure, pas sur le statut : le
    // propriétaire doit voir que son créneau de jeudi est tombé.
    afficher([
      buildOwnerAppointment({ id: "1", starts_at: FUTUR, status: "cancelled" }),
    ]);

    expect(screen.getByRole("tab", { name: "À venir (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Passés (0)" })).toBeInTheDocument();
  });

  it("ouvre l'onglet demandé par l'URL", () => {
    // Ce qui permet à la fiche d'un animal de pointer vers l'historique.
    navigation.params = new URLSearchParams("vue=passes");
    afficher([buildOwnerAppointment({ id: "2", starts_at: PASSE })]);

    expect(screen.getByRole("tab", { name: "Passés (1)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("retombe sur « À venir » si l'URL dit n'importe quoi", () => {
    // L'URL est une entrée utilisateur : elle ne doit pas casser l'écran.
    navigation.params = new URLSearchParams("vue=bricolage");
    afficher([buildOwnerAppointment({ id: "1", starts_at: FUTUR })]);

    expect(screen.getByRole("tab", { name: "À venir (1)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("AppointmentsContent — filtres", () => {
  it("n'affiche pas de filtre animal pour un propriétaire qui n'en a qu'un", () => {
    // Un menu qui ne propose qu'une valeur donne l'impression d'une
    // interface plus compliquée qu'elle ne l'est.
    afficher(
      [buildOwnerAppointment({ id: "1", starts_at: FUTUR })],
      [buildPet({ id: REX, name: "Rex" })],
    );

    expect(
      screen.queryByRole("combobox", { name: "Filtrer par animal" }),
    ).not.toBeInTheDocument();
  });

  it("propose le filtre dès qu'il y a deux animaux", () => {
    afficher(
      [buildOwnerAppointment({ id: "1", starts_at: FUTUR })],
      [
        buildPet({ id: REX, name: "Rex" }),
        buildPet({ id: MISTIGRI, name: "Mistigri" }),
      ],
    );

    expect(
      screen.getByRole("combobox", { name: "Filtrer par animal" }),
    ).toBeInTheDocument();
  });

  it("applique le filtre animal venu de l'URL", () => {
    navigation.params = new URLSearchParams(`animal=${REX}`);
    afficher(
      [
        buildOwnerAppointment({ id: "1", starts_at: FUTUR, pet_id: REX }),
        buildOwnerAppointment({ id: "2", starts_at: FUTUR, pet_id: MISTIGRI }),
      ],
      [
        buildPet({ id: REX, name: "Rex" }),
        buildPet({ id: MISTIGRI, name: "Mistigri" }),
      ],
    );

    // Un seul des deux rendez-vous à venir survit au filtre.
    expect(screen.getByRole("tab", { name: "À venir (1)" })).toBeInTheDocument();
  });

  it("dit autre chose quand le vide vient d'un filtre, et propose d'en sortir", () => {
    // Contresens à éviter : réutiliser l'état vide de premier usage pour
    // quelqu'un qui a des rendez-vous mais a filtré trop fin.
    navigation.params = new URLSearchParams(`animal=${MISTIGRI}`);
    afficher(
      [buildOwnerAppointment({ id: "1", starts_at: FUTUR, pet_id: REX })],
      [
        buildPet({ id: REX, name: "Rex" }),
        buildPet({ id: MISTIGRI, name: "Mistigri" }),
      ],
    );

    expect(
      screen.getByText("Aucun rendez-vous à venir pour ce filtre."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Réinitialiser les filtres" }),
    ).toBeInTheDocument();
  });
});

describe("AppointmentsContent — historique", () => {
  /** n rendez-vous passés, espacés d'un jour. */
  function historique(n: number): OwnerAppointmentResponse[] {
    return Array.from({ length: n }, (_, index) =>
      buildOwnerAppointment({
        id: `p${index}`,
        starts_at: `2026-07-${String(index + 1).padStart(2, "0")}T07:00:00Z`,
      }),
    );
  }

  it("n'affiche qu'un premier lot, et propose la suite", async () => {
    // Pagination CLIENT : la liste complète est déjà en mémoire, montrer
    // dix de plus ne coûte aucune requête.
    navigation.params = new URLSearchParams("vue=passes");
    afficher(historique(14));

    const bouton = screen.getByRole("button", {
      name: /Afficher 4 rendez-vous de plus/,
    });
    await userEvent.setup().click(bouton);

    expect(
      screen.queryByRole("button", { name: /rendez-vous de plus/ }),
    ).not.toBeInTheDocument();
  });

  it("groupe l'historique par mois, le repère de balayage d'une longue liste", () => {
    navigation.params = new URLSearchParams("vue=passes");
    afficher([
      buildOwnerAppointment({ id: "1", starts_at: "2026-08-05T07:00:00Z" }),
      buildOwnerAppointment({ id: "2", starts_at: "2026-07-30T07:00:00Z" }),
    ]);

    expect(
      screen.getByRole("heading", { name: "août 2026", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "juillet 2026", level: 2 }),
    ).toBeInTheDocument();
  });

  it("range les passés du plus récent au plus ancien", () => {
    navigation.params = new URLSearchParams("vue=passes");
    const { container } = afficher([
      buildOwnerAppointment({
        id: "vieux",
        starts_at: "2026-07-01T07:00:00Z",
        appointment_type_name: "Vieille visite",
      }),
      buildOwnerAppointment({
        id: "recent",
        starts_at: "2026-08-05T07:00:00Z",
        appointment_type_name: "Visite récente",
      }),
    ]);

    const liens = within(container).getAllByRole("link");
    expect(liens[0]).toHaveAttribute("href", "/rendez-vous/recent");
  });
});
