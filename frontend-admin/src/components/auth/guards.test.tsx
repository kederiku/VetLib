/**
 * Tests des deux gardes de session du back-office plateforme.
 *
 * L'enjeu est plus fort ici que dans les deux portails : les écrans protégés
 * de cette console affichent les données de TOUTES les cliniques et de TOUS
 * les propriétaires. L'AuthGuard ne doit donc jamais les laisser entrevoir à
 * quelqu'un dont la session est invalide, même une fraction de seconde avant
 * la redirection. Il efface aussi le drapeau de session au passage : sans
 * cela, le prochain passage sur /login relancerait une vérification vouée à
 * échouer.
 *
 * GuestGuard fait l'inverse, et ne déclenche la vérification QUE si un
 * drapeau de session existe -- pour ne pas infliger un 401 inutile à qui
 * arrive sur /login sans session.
 */
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthGuard } from "@/components/auth/auth-guard";
import { GuestGuard } from "@/components/auth/guest-guard";
import { setSessionHint } from "@/lib/auth/session-hint";
import { buildAdmin } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  useCurrentAdmin: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/auth/use-current-admin", () => ({
  useCurrentAdmin: simulations.useCurrentAdmin,
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

function session(surcharges: Record<string, unknown> = {}) {
  return { data: undefined, isPending: false, isError: false, ...surcharges };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("AuthGuard", () => {
  it("masque le contenu pendant la vérification", () => {
    // Laisser passer les enfants « en attendant » exposerait le parc
    // entier a quelqu'un qui n'y a pas droit.
    simulations.useCurrentAdmin.mockReturnValue(session({ isPending: true }));
    renderWithProviders(
      <AuthGuard>
        <p>Liste des cliniques</p>
      </AuthGuard>,
    );

    expect(screen.queryByText("Liste des cliniques")).not.toBeInTheDocument();
  });

  it("masque le contenu ET redirige quand la session est invalide", () => {
    simulations.useCurrentAdmin.mockReturnValue(session({ isError: true }));
    renderWithProviders(
      <AuthGuard>
        <p>Liste des cliniques</p>
      </AuthGuard>,
    );

    expect(screen.queryByText("Liste des cliniques")).not.toBeInTheDocument();
    expect(simulations.replace).toHaveBeenCalledWith("/login");
  });

  it("efface le drapeau de session en repartant", () => {
    // Sans cela, le prochain passage sur /login relancerait une
    // vérification vouée à échouer.
    setSessionHint();
    simulations.useCurrentAdmin.mockReturnValue(session({ isError: true }));
    renderWithProviders(
      <AuthGuard>
        <p>x</p>
      </AuthGuard>,
    );

    expect(
      window.localStorage.getItem("vetolib_admin_session_hint"),
    ).toBeNull();
  });

  it("affiche le contenu une fois la session confirmée", () => {
    simulations.useCurrentAdmin.mockReturnValue(
      session({ data: buildAdmin() }),
    );
    renderWithProviders(
      <AuthGuard>
        <p>Liste des cliniques</p>
      </AuthGuard>,
    );

    expect(screen.getByText("Liste des cliniques")).toBeInTheDocument();
    expect(simulations.replace).not.toHaveBeenCalled();
  });
});

describe("GuestGuard", () => {
  it("affiche le formulaire sans attendre le réseau", () => {
    simulations.useCurrentAdmin.mockReturnValue(session({ isPending: true }));
    renderWithProviders(
      <GuestGuard>
        <p>Formulaire de connexion</p>
      </GuestGuard>,
    );

    expect(screen.getByText("Formulaire de connexion")).toBeInTheDocument();
  });

  it("ne vérifie rien pour un visiteur sans drapeau de session", () => {
    // Economie d'un 401 inutile : quelqu'un qui n'a jamais eu de session
    // sur ce navigateur n'a aucune raison de declencher une verification.
    simulations.useCurrentAdmin.mockReturnValue(session());
    renderWithProviders(
      <GuestGuard>
        <p>x</p>
      </GuestGuard>,
    );

    expect(simulations.useCurrentAdmin).toHaveBeenCalledWith({
      enabled: false,
    });
  });

  it("vérifie la session quand le drapeau existe", () => {
    setSessionHint();
    simulations.useCurrentAdmin.mockReturnValue(session());
    renderWithProviders(
      <GuestGuard>
        <p>x</p>
      </GuestGuard>,
    );

    expect(simulations.useCurrentAdmin).toHaveBeenCalledWith({ enabled: true });
  });

  it("renvoie vers le tableau de bord quand une session valide existe", () => {
    setSessionHint();
    simulations.useCurrentAdmin.mockReturnValue(
      session({ data: buildAdmin() }),
    );
    renderWithProviders(
      <GuestGuard>
        <p>x</p>
      </GuestGuard>,
    );

    expect(simulations.replace).toHaveBeenCalledWith("/tableau-de-bord");
  });

  it("ne redirige pas quand la vérification a échoué", () => {
    // Garde anti-boucle : rediriger enverrait vers une page qui
    // renverrait ici même.
    setSessionHint();
    simulations.useCurrentAdmin.mockReturnValue(
      session({ data: buildAdmin(), isError: true }),
    );
    renderWithProviders(
      <GuestGuard>
        <p>x</p>
      </GuestGuard>,
    );

    expect(simulations.replace).not.toHaveBeenCalled();
  });
});
