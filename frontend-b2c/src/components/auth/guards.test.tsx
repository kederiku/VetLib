/**
 * Tests des deux gardes de session du portail propriétaires.
 *
 * Ce sont des composants de SÉCURITÉ perçue : AuthGuard ne doit jamais laisser
 * entrevoir le contenu protégé à quelqu'un dont la session est invalide, même
 * une fraction de seconde avant la redirection. GuestGuard fait l'inverse, et
 * porte une subtilité : il affiche ses enfants tout de suite (rendu optimiste)
 * pour que le formulaire de connexion n'attende pas une requête réseau.
 *
 * On simule `useCurrentUser` plutôt que le réseau : les trois états se posent
 * alors de façon synchrone, sans attente.
 */
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthGuard } from "@/components/auth/auth-guard";
import { GuestGuard } from "@/components/auth/guest-guard";
import { buildOwner } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  useCurrentUser: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/auth/use-current-user", () => ({
  useCurrentUser: simulations.useCurrentUser,
}));

// next/navigation n'a aucune valeur utilisable hors de Next : useRouter()
// lève une exception au lieu de renvoyer un objet inerte.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: simulations.replace,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

function session(surcharges: Record<string, unknown> = {}) {
  return { data: undefined, isPending: false, isError: false, ...surcharges };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("AuthGuard", () => {
  it("masque le contenu pendant la vérification de session", () => {
    // Point de sécurité : afficher les enfants « en attendant » laisserait
    // entrevoir des données de clinique à quelqu'un qui n'y a pas droit.
    simulations.useCurrentUser.mockReturnValue(session({ isPending: true }));
    renderWithProviders(
      <AuthGuard>
        <p>Contenu protégé</p>
      </AuthGuard>,
    );

    expect(screen.queryByText("Contenu protégé")).not.toBeInTheDocument();
  });

  it("masque le contenu ET redirige quand la session est invalide", () => {
    simulations.useCurrentUser.mockReturnValue(session({ isError: true }));
    renderWithProviders(
      <AuthGuard>
        <p>Contenu protégé</p>
      </AuthGuard>,
    );

    expect(screen.queryByText("Contenu protégé")).not.toBeInTheDocument();
    expect(simulations.replace).toHaveBeenCalledWith("/login");
  });

  it("affiche le contenu une fois la session confirmée", () => {
    simulations.useCurrentUser.mockReturnValue(session({ data: buildOwner() }));
    renderWithProviders(
      <AuthGuard>
        <p>Contenu protégé</p>
      </AuthGuard>,
    );

    expect(screen.getByText("Contenu protégé")).toBeInTheDocument();
    expect(simulations.replace).not.toHaveBeenCalled();
  });

  it("ne redirige pas pendant le simple chargement", () => {
    // Rediriger sur un état d'attente déconnecterait à chaque rechargement
    // de page, avant même que la réponse n'arrive.
    simulations.useCurrentUser.mockReturnValue(session({ isPending: true }));
    renderWithProviders(
      <AuthGuard>
        <p>x</p>
      </AuthGuard>,
    );

    expect(simulations.replace).not.toHaveBeenCalled();
  });
});

describe("GuestGuard", () => {
  it("affiche le formulaire sans attendre le réseau", () => {
    // Rendu optimiste assumé : faire patienter un visiteur non connecté
    // devant un écran vide, le temps d'un aller-retour, serait absurde.
    simulations.useCurrentUser.mockReturnValue(session({ isPending: true }));
    renderWithProviders(
      <GuestGuard>
        <p>Formulaire de connexion</p>
      </GuestGuard>,
    );

    expect(screen.getByText("Formulaire de connexion")).toBeInTheDocument();
  });

  it("renvoie vers le compte quand une session valide existe déjà", () => {
    simulations.useCurrentUser.mockReturnValue(session({ data: buildOwner() }));
    renderWithProviders(
      <GuestGuard>
        <p>Formulaire de connexion</p>
      </GuestGuard>,
    );

    expect(simulations.replace).toHaveBeenCalledWith("/mon-compte");
  });

  it("ne redirige pas quand la vérification a échoué", () => {
    // Garde anti-boucle : si la requête échoue tout en ayant une donnée en
    // cache, rediriger enverrait le visiteur sur une page qui le renverrait
    // ici même.
    simulations.useCurrentUser.mockReturnValue(
      session({ data: buildOwner(), isError: true }),
    );
    renderWithProviders(
      <GuestGuard>
        <p>x</p>
      </GuestGuard>,
    );

    expect(simulations.replace).not.toHaveBeenCalled();
  });

  it("ne redirige pas un visiteur sans session", () => {
    simulations.useCurrentUser.mockReturnValue(session({ isError: true }));
    renderWithProviders(
      <GuestGuard>
        <p>x</p>
      </GuestGuard>,
    );

    expect(simulations.replace).not.toHaveBeenCalled();
  });

  it("laisse passer une session ouverte quand le garde est désactivé", () => {
    // Le besoin du parcours d'INSCRIPTION : son étape 1 crée le compte et
    // ouvre la session, mais les étapes 2 et 3 se déroulent sur la même page
    // /register. Sans ce commutateur, le garde éjecterait la personne vers
    // /mon-compte au milieu de son inscription.
    simulations.useCurrentUser.mockReturnValue(session({ data: buildOwner() }));
    renderWithProviders(
      <GuestGuard enabled={false}>
        <p>Suite de l&apos;inscription</p>
      </GuestGuard>,
    );

    expect(simulations.replace).not.toHaveBeenCalled();
    expect(screen.getByText("Suite de l'inscription")).toBeInTheDocument();
  });
});
