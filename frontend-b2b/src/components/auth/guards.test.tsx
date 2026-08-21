/**
 * Tests des deux gardes de session de l'espace clinique.
 *
 * AuthGuard ne doit jamais laisser entrevoir l'agenda ou les données d'une
 * clinique à quelqu'un dont la session est invalide, même une fraction de
 * seconde avant la redirection. Il efface aussi le drapeau de session au
 * passage : sans cela, le prochain passage sur /login relancerait une
 * vérification vouée à échouer.
 *
 * GuestGuard fait l'inverse, avec une optimisation propre au B2B : il ne
 * déclenche la vérification QUE si un drapeau de session existe, pour ne pas
 * infliger un 401 inutile à un visiteur qui n'a jamais eu de compte.
 */
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthGuard } from "@/components/auth/auth-guard";
import { GuestGuard } from "@/components/auth/guest-guard";
import { setSessionHint } from "@/lib/auth/session-hint";
import { buildUser } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  useCurrentUser: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/auth/use-current-user", () => ({
  useCurrentUser: simulations.useCurrentUser,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: simulations.replace,
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/dashboard",
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
    // Laisser passer les enfants « en attendant » exposerait des données
    // de clinique à quelqu'un qui n'y a pas droit.
    simulations.useCurrentUser.mockReturnValue(session({ isPending: true }));
    renderWithProviders(
      <AuthGuard>
        <p>Agenda de la clinique</p>
      </AuthGuard>,
    );

    expect(screen.queryByText("Agenda de la clinique")).not.toBeInTheDocument();
  });

  it("masque le contenu ET redirige quand la session est invalide", () => {
    simulations.useCurrentUser.mockReturnValue(session({ isError: true }));
    renderWithProviders(
      <AuthGuard>
        <p>Agenda de la clinique</p>
      </AuthGuard>,
    );

    expect(screen.queryByText("Agenda de la clinique")).not.toBeInTheDocument();
    expect(simulations.replace).toHaveBeenCalledWith("/login");
  });

  it("efface le drapeau de session en repartant", () => {
    // Sans cela, le prochain passage sur /login relancerait une
    // vérification vouée à échouer.
    setSessionHint();
    simulations.useCurrentUser.mockReturnValue(session({ isError: true }));
    renderWithProviders(
      <AuthGuard>
        <p>x</p>
      </AuthGuard>,
    );

    expect(
      window.localStorage.getItem("vetolib_b2b_session_hint"),
    ).toBeNull();
  });

  it("affiche le contenu une fois la session confirmée", () => {
    simulations.useCurrentUser.mockReturnValue(session({ data: buildUser() }));
    renderWithProviders(
      <AuthGuard>
        <p>Agenda de la clinique</p>
      </AuthGuard>,
    );

    expect(screen.getByText("Agenda de la clinique")).toBeInTheDocument();
    expect(simulations.replace).not.toHaveBeenCalled();
  });
});

describe("GuestGuard", () => {
  it("affiche le formulaire sans attendre le réseau", () => {
    simulations.useCurrentUser.mockReturnValue(session({ isPending: true }));
    renderWithProviders(
      <GuestGuard>
        <p>Formulaire de connexion</p>
      </GuestGuard>,
    );

    expect(screen.getByText("Formulaire de connexion")).toBeInTheDocument();
  });

  it("ne vérifie rien pour un visiteur sans drapeau de session", () => {
    // Économie d'un 401 inutile : quelqu'un qui n'a jamais eu de compte
    // n'a aucune raison de déclencher une vérification.
    simulations.useCurrentUser.mockReturnValue(session());
    renderWithProviders(
      <GuestGuard>
        <p>x</p>
      </GuestGuard>,
    );

    expect(simulations.useCurrentUser).toHaveBeenCalledWith({ enabled: false });
  });

  it("vérifie la session quand le drapeau existe", () => {
    setSessionHint();
    simulations.useCurrentUser.mockReturnValue(session());
    renderWithProviders(
      <GuestGuard>
        <p>x</p>
      </GuestGuard>,
    );

    expect(simulations.useCurrentUser).toHaveBeenCalledWith({ enabled: true });
  });

  it("renvoie vers le tableau de bord quand une session valide existe", () => {
    setSessionHint();
    simulations.useCurrentUser.mockReturnValue(session({ data: buildUser() }));
    renderWithProviders(
      <GuestGuard>
        <p>x</p>
      </GuestGuard>,
    );

    expect(simulations.replace).toHaveBeenCalledWith("/dashboard");
  });

  it("ne redirige pas quand la vérification a échoué", () => {
    // Garde anti-boucle : rediriger enverrait vers une page qui
    // renverrait ici même.
    setSessionHint();
    simulations.useCurrentUser.mockReturnValue(
      session({ data: buildUser(), isError: true }),
    );
    renderWithProviders(
      <GuestGuard>
        <p>x</p>
      </GuestGuard>,
    );

    expect(simulations.replace).not.toHaveBeenCalled();
  });
});
