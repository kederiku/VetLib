/**
 * Tests du parcours d'inscription en trois étapes du portail propriétaires.
 *
 * Ce parcours a une propriété inhabituelle : il ÉCRIT à chaque étape, au lieu
 * de tout envoyer à la fin. C'est ce qui fait sa robustesse (un abandon à
 * l'étape 2 laisse malgré tout un compte utilisable) et c'est aussi ce qui
 * peut mal tourner. Les tests ci-dessous couvrent donc, par ordre
 * d'importance :
 *
 * 1. les états INTERMÉDIAIRES. Compte créé mais connexion échouée ; deux
 *    animaux dont le second échoue. Dans les deux cas quelque chose EXISTE
 *    déjà en base, et proposer de « recommencer » créerait des doublons ou
 *    buterait sur un « email déjà utilisé » incompréhensible ;
 * 2. le caractère FACULTATIF des étapes 2 et 3 : passer ne doit déclencher
 *    aucune requête ;
 * 3. l'impossibilité de revenir à l'étape 1 une fois le compte créé.
 *
 * La session est simulée par une variable que le mock de connexion bascule :
 * on reproduit ainsi fidèlement la réalité (pas de session à l'étape 1, une
 * session ouverte ensuite), dont dépendent le GuestGuard et le pré-remplissage
 * de l'étape 2.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterWizard } from "@/components/auth/register/register-wizard";
import { ApiError } from "@/lib/api/errors";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { buildOwner } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  inscrire: vi.fn(),
  connecter: vi.fn(),
  enregistrerProfil: vi.fn(),
  creerAnimal: vi.fn(),
  useCurrentUser: vi.fn(),
  push: vi.fn(),
}));

vi.mock(
  "@/lib/api/generated/owner-auth/owner-auth",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/api/generated/owner-auth/owner-auth")
    >()),
    useRegisterOwner: () => ({ mutateAsync: simulations.inscrire }),
    useOwnerLogin: () => ({ mutateAsync: simulations.connecter }),
  }),
);

vi.mock("@/lib/api/generated/owner-profile/owner-profile", () => ({
  useUpdateOwnerProfile: () => ({ mutateAsync: simulations.enregistrerProfil }),
}));

vi.mock("@/lib/api/generated/pets/pets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/generated/pets/pets")>()),
  useCreatePet: () => ({ mutateAsync: simulations.creerAnimal }),
}));

vi.mock("@/lib/auth/use-current-user", () => ({
  useCurrentUser: simulations.useCurrentUser,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: simulations.push,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/register",
  useSearchParams: () => new URLSearchParams(),
}));

/** Le propriétaire tel que le renvoie /me une fois la session ouverte. */
const OWNER = buildOwner({
  first_name: "Marie",
  last_name: "Dupont",
  email: "marie@example.test",
  phone: "0612345678",
});

const MOT_DE_PASSE = "phrase-de-passe-a-moi";

// État de session courant, lu par le mock de useCurrentUser. Il bascule quand
// la connexion réussit — exactement comme en vrai.
let sessionCourante: unknown;

/** Remplit l'étape 1 et la soumet. */
async function remplirEtape1(surcharges: Record<string, string> = {}) {
  const valeurs: Record<string, string> = {
    "^Prénom": "Marie",
    "^Nom": "Dupont",
    "^Email": "marie@example.test",
    "^Téléphone": "0612345678",
    "^Mot de passe": MOT_DE_PASSE,
    "^Confirmer le mot de passe": MOT_DE_PASSE,
    ...surcharges,
  };
  const user = userEvent.setup();
  for (const [libelle, valeur] of Object.entries(valeurs)) {
    if (valeur === "") continue;
    await user.type(screen.getByLabelText(new RegExp(libelle)), valeur);
  }
  await user.click(screen.getByRole("button", { name: "Continuer" }));
}

/** Amène le parcours jusqu'à l'étape 2 (compte créé, session ouverte). */
async function allerEtape2() {
  const rendu = renderWithProviders(<RegisterWizard />);
  await remplirEtape1();
  expect(await screen.findByText("Votre adresse")).toBeInTheDocument();
  return rendu;
}

/**
 * Coche une espèce sur la ligne d'animal demandée.
 *
 * getAllByRole("radio") et non getByLabelText : la RadioGroup de Base UI rend
 * DEUX éléments par option (le bouton visible et un input natif masqué), tous
 * deux porteurs du libellé. Le rôle lève l'ambiguïté, et l'index désigne la
 * ligne.
 */
async function cocherEspece(libelle: string, ligne = 0) {
  const options = screen.getAllByRole("radio", { name: libelle });
  await userEvent.setup().click(options[ligne]);
}

/** Amène le parcours jusqu'à l'étape 3, en sautant l'adresse. */
async function allerEtape3() {
  const rendu = await allerEtape2();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Passer cette étape" }));
  expect(await screen.findByText("Vos animaux")).toBeInTheDocument();
  return rendu;
}

beforeEach(() => {
  // Étape 1 : aucune session (le GuestGuard ne doit donc pas rediriger).
  sessionCourante = { data: undefined, isPending: false, isError: true };
  simulations.useCurrentUser.mockImplementation(() => sessionCourante);
  simulations.inscrire.mockResolvedValue({ status: 201 });
  // La connexion OUVRE la session : les étapes suivantes voient un owner.
  simulations.connecter.mockImplementation(async () => {
    sessionCourante = { data: OWNER, isPending: false, isError: false };
    return { status: 200, data: OWNER, headers: new Headers() };
  });
  simulations.enregistrerProfil.mockResolvedValue({
    status: 200,
    data: OWNER,
    headers: new Headers(),
  });
  simulations.creerAnimal.mockResolvedValue({ status: 201 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Inscription — étape 1, validation locale", () => {
  it("refuse un mot de passe trop court sans rien envoyer", async () => {
    renderWithProviders(<RegisterWizard />);
    await remplirEtape1({
      "^Mot de passe": "court",
      "^Confirmer le mot de passe": "court",
    });

    expect(
      await screen.findByText(/au moins 14 caractères/),
    ).toBeInTheDocument();
    expect(simulations.inscrire).not.toHaveBeenCalled();
  });

  it("refuse une confirmation qui ne correspond pas", async () => {
    renderWithProviders(<RegisterWizard />);
    await remplirEtape1({
      "^Confirmer le mot de passe": "phrase-differente-ici",
    });

    expect(
      await screen.findByText("Les deux mots de passe ne correspondent pas."),
    ).toBeInTheDocument();
    expect(simulations.inscrire).not.toHaveBeenCalled();
  });
});

describe("Inscription — étape 1, création du compte", () => {
  it("crée le compte, connecte, amorce le cache et avance", async () => {
    const { queryClient } = renderWithProviders(<RegisterWizard />);
    await remplirEtape1();

    await waitFor(() => expect(simulations.connecter).toHaveBeenCalled());
    // La confirmation reste LOCALE : elle ne doit jamais partir au backend.
    expect(simulations.inscrire).toHaveBeenCalledWith({
      data: {
        first_name: "Marie",
        last_name: "Dupont",
        email: "marie@example.test",
        phone: "0612345678",
        password: MOT_DE_PASSE,
      },
    });
    expect(queryClient.getQueryData(getGetCurrentOwnerQueryKey())).toEqual({
      status: 200,
      data: OWNER,
      headers: expect.any(Headers),
    });
    expect(await screen.findByText("Votre adresse")).toBeInTheDocument();
  });

  it("place l'email déjà utilisé sous le champ et reste à l'étape 1", async () => {
    simulations.inscrire.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "identity.email_already_exists",
        detail: "Email already registered",
      }),
    );
    renderWithProviders(<RegisterWizard />);
    await remplirEtape1();

    expect(
      await screen.findByText("Cette adresse email est déjà utilisée."),
    ).toBeInTheDocument();
    expect(simulations.connecter).not.toHaveBeenCalled();
    // C'est tout l'intérêt de créer le compte dès l'étape 1 : la personne
    // l'apprend AVANT de saisir son adresse et ses animaux.
    expect(screen.getByText("Créer mon compte")).toBeInTheDocument();
  });

  it("signale un mot de passe compromis sous le champ mot de passe", async () => {
    // Vérification impossible côté client : elle vient du backend, qui seul
    // interroge le corpus Have I Been Pwned.
    simulations.inscrire.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "identity.password_compromised",
        detail: "Mot de passe compromis",
      }),
    );
    renderWithProviders(<RegisterWizard />);
    await remplirEtape1();

    expect(
      await screen.findByText(/figure dans une fuite de données connue/),
    ).toBeInTheDocument();
  });

  it("renvoie vers la connexion si le compte est créé mais la connexion échoue", async () => {
    // Le compte EXISTE : afficher une erreur d'inscription pousserait la
    // personne à recommencer et à buter sur « email déjà utilisé ».
    simulations.connecter.mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithProviders(<RegisterWizard />);
    await remplirEtape1();

    await waitFor(() =>
      expect(simulations.push).toHaveBeenCalledWith("/login"),
    );
  });
});

describe("Inscription — étape 2, l'adresse", () => {
  it("n'envoie rien quand l'étape est passée", async () => {
    await allerEtape3();
    expect(simulations.enregistrerProfil).not.toHaveBeenCalled();
  });

  it("n'envoie rien non plus quand le formulaire est laissé vide", async () => {
    // Un PUT qui ne change rien coûterait un aller-retour pour rien.
    await allerEtape2();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Continuer" }));

    expect(await screen.findByText("Vos animaux")).toBeInTheDocument();
    expect(simulations.enregistrerProfil).not.toHaveBeenCalled();
  });

  it("exige les trois champs essentiels dès que l'adresse est entamée", async () => {
    await allerEtape2();
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/Adresse \(ligne 1\)/),
      "12 rue des Lilas",
    );
    await user.click(screen.getByRole("button", { name: "Continuer" }));

    expect(
      await screen.findByText(/Le code postal est requis/),
    ).toBeInTheDocument();
    expect(simulations.enregistrerProfil).not.toHaveBeenCalled();
  });

  it("renvoie les champs déjà connus, que le PUT remplacerait sinon", async () => {
    // PUT /owner/profile est un remplacement COMPLET : omettre le nom ou le
    // téléphone les effacerait de la fiche tout juste créée.
    await allerEtape2();
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/Adresse \(ligne 1\)/),
      "12 rue des Lilas",
    );
    await user.type(screen.getByLabelText(/Code postal/), "75011");
    await user.type(screen.getByLabelText(/^Ville/), "Paris");
    await user.click(screen.getByRole("button", { name: "Continuer" }));

    await waitFor(() =>
      expect(simulations.enregistrerProfil).toHaveBeenCalled(),
    );
    expect(simulations.enregistrerProfil).toHaveBeenCalledWith({
      data: {
        first_name: "Marie",
        last_name: "Dupont",
        phone: "0612345678",
        address: {
          line1: "12 rue des Lilas",
          line2: null,
          postal_code: "75011",
          city: "Paris",
          country: "FR",
        },
        notification_preferences: { email: true, sms: false },
      },
    });
  });
});

describe("Inscription — étape 3, les animaux", () => {
  it("termine sans rien envoyer quand l'étape est passée", async () => {
    await allerEtape3();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Je le ferai plus tard" }));

    expect(await screen.findByText(/Bienvenue Marie/)).toBeInTheDocument();
    expect(simulations.creerAnimal).not.toHaveBeenCalled();
  });

  it("crée un appel par animal saisi", async () => {
    await allerEtape3();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^Nom/), "Rex");
    await cocherEspece("Chien");
    await user.click(
      screen.getByRole("button", { name: /Ajouter un autre animal/ }),
    );
    await user.type(screen.getAllByLabelText(/^Nom/)[1], "Mistigri");
    await cocherEspece("Chat", 1);
    await user.click(screen.getByRole("button", { name: "Terminer" }));

    await waitFor(() =>
      expect(simulations.creerAnimal).toHaveBeenCalledTimes(2),
    );
    expect(simulations.creerAnimal).toHaveBeenNthCalledWith(1, {
      data: { name: "Rex", species: "dog" },
    });
    expect(simulations.creerAnimal).toHaveBeenNthCalledWith(2, {
      data: { name: "Mistigri", species: "cat" },
    });
    expect(await screen.findByText(/Bienvenue Marie/)).toBeInTheDocument();
  });

  it("conserve l'acquis et retire les lignes créées après un échec partiel", async () => {
    // LE cas qui compte : le premier animal EXISTE déjà en base. Le laisser
    // dans le formulaire le créerait en double au prochain essai.
    simulations.creerAnimal
      .mockResolvedValueOnce({ status: 201 })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await allerEtape3();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^Nom/), "Rex");
    await cocherEspece("Chien");
    await user.click(
      screen.getByRole("button", { name: /Ajouter un autre animal/ }),
    );
    await user.type(screen.getAllByLabelText(/^Nom/)[1], "Mistigri");
    await cocherEspece("Chat", 1);
    await user.click(screen.getByRole("button", { name: "Terminer" }));

    expect(
      await screen.findByText(/1 animal a bien été enregistré/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Impossible de contacter le serveur/),
    ).toBeInTheDocument();
    // Une seule ligne subsiste : celle qui reste à enregistrer.
    expect(screen.getAllByLabelText(/^Nom/)).toHaveLength(1);
    expect(screen.getAllByLabelText(/^Nom/)[0]).toHaveValue("Mistigri");
  });
});

describe("Inscription — navigation", () => {
  it("interdit tout retour à l'étape 1 une fois le compte créé", async () => {
    // Le compte existe : le formulaire de création n'a plus rien à créer, et
    // le proposer ferait buter sur un « email déjà utilisé ».
    await allerEtape3();

    expect(
      screen.queryByRole("button", { name: /Compte/ }),
    ).not.toBeInTheDocument();
    // L'étape 2, elle, reste accessible.
    expect(screen.getByRole("button", { name: /Adresse/ })).toBeInTheDocument();
  });

  it("permet de revenir à l'adresse depuis les animaux", async () => {
    await allerEtape3();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Retour/ }));

    expect(await screen.findByText("Votre adresse")).toBeInTheDocument();
  });
});
