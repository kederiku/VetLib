/**
 * Erreurs HTTP normalisees du portail B2B.
 *
 * Le backend FastAPI renvoie TROIS formats d'erreur differents :
 * 1. DomainError : { code: "identity.invalid_credentials", detail: "..." }
 *    (erreurs metier levees par le domaine, avec un code stable) ;
 * 2. HTTPException nue : { detail: "..." } sans code (ex : cookie absent) ;
 * 3. 422 de validation FastAPI : { detail: ValidationError[] } ou chaque
 *    entree pointe un champ via loc = ["body", "nom_du_champ"].
 *
 * Ce module unifie ces trois formats en UNE classe ApiError que tout le
 * frontend manipule : les formulaires regardent `code` et `validation`,
 * les gardes d'auth regardent `status`. Sans cette normalisation, chaque
 * composant devrait re-decoder les trois formats lui-meme.
 */
import type { ValidationError } from "@/lib/api/generated/vetoLibAPI.schemas";

/**
 * Erreur levee par le mutator quand l'API repond avec un statut >= 400.
 *
 * Etendre Error est important : TanStack Query (et instanceof) ne
 * reconnaissent que de vraies erreurs JavaScript. Les champs sont en
 * lecture seule : une erreur est une photographie d'une reponse, elle
 * ne doit jamais etre mutee apres coup.
 */
export class ApiError extends Error {
  /** Statut HTTP de la reponse (401, 409, 422...). */
  readonly status: number;
  /** Code metier stable (ex : "identity.email_already_exists"), si DomainError. */
  readonly code?: string;
  /** Message lisible (destine aux logs ; l'UI prefere ses libelles FR). */
  readonly detail: string;
  /** Erreurs de validation champ par champ, uniquement pour un 422. */
  readonly validation?: ValidationError[];

  constructor(args: {
    status: number;
    code?: string;
    detail: string;
    validation?: ValidationError[];
  }) {
    // Le message de Error = detail : c'est ce qui apparait dans la
    // console et les rapports d'erreur si personne ne l'intercepte.
    super(args.detail);
    this.name = "ApiError";
    this.status = args.status;
    this.code = args.code;
    this.detail = args.detail;
    this.validation = args.validation;
  }
}

/**
 * Retrecit un `unknown` (le type des erreurs attrapees en catch) en
 * ApiError, ou null si l'erreur vient d'ailleurs (panne reseau, bug JS).
 *
 * Pourquoi ce helper : TypeScript type toute erreur catchee en `unknown`,
 * et un fetch qui echoue AVANT d'obtenir une reponse (serveur eteint,
 * DNS...) leve un TypeError natif, pas un ApiError. Les appelants doivent
 * donc distinguer "l'API a repondu une erreur" de "rien n'a repondu".
 */
export function getApiError(error: unknown): ApiError | null {
  return error instanceof ApiError ? error : null;
}

/**
 * Fabrique un ApiError a partir du statut HTTP et du corps deja parse.
 *
 * C'est ici que les trois formats du backend sont discrimines, par ordre
 * de specificite (un corps peut theoriquement matcher plusieurs formes) :
 * tableau detail = 422, presence d'un code = DomainError, detail chaine =
 * HTTPException, sinon message generique (corps vide ou inattendu, ex :
 * une page HTML d'erreur d'un proxy).
 */
export function apiErrorFromBody(status: number, body: unknown): ApiError {
  // Le corps arrive en `unknown` (JSON.parse ne garantit rien) : on le
  // lit a travers un Record pour que chaque acces reste type-sur.
  const record = (body ?? {}) as Record<string, unknown>;

  // Format 3 : erreur de validation FastAPI (statut 422). Le detail est
  // un tableau d'objets { loc, msg, type } ; on le conserve tel quel pour
  // que les formulaires puissent afficher chaque message SOUS son champ.
  if (Array.isArray(record.detail)) {
    return new ApiError({
      status,
      detail: "Certains champs sont invalides.",
      validation: record.detail as ValidationError[],
    });
  }

  // Format 1 : DomainError avec code metier stable. Le code (et non le
  // texte du detail, qui peut changer) sert de cle pour choisir le
  // message francais a afficher.
  if (typeof record.code === "string") {
    return new ApiError({
      status,
      code: record.code,
      detail:
        typeof record.detail === "string"
          ? record.detail
          : `Erreur serveur (HTTP ${status})`,
    });
  }

  // Format 2 : HTTPException FastAPI nue, juste un texte (ex : 401
  // "Not authenticated" quand le cookie d'acces est absent).
  if (typeof record.detail === "string") {
    return new ApiError({ status, detail: record.detail });
  }

  // Corps vide ou format inconnu : on retombe sur un message generique
  // plutot que de planter (defensive coding face aux proxys/CDN).
  return new ApiError({ status, detail: `Erreur serveur (HTTP ${status})` });
}
