"""Erreurs métier du contexte identity.

Couche domain : ces exceptions expriment des échecs MÉTIER (email pris,
identifiants faux...), pas des pannes techniques. Elles héritent des bases de
shared/domain/errors, dont le type détermine le statut HTTP via les error
handlers partagés : ConflictError -> 409, EntityNotFoundError -> 404,
PermissionDeniedError -> 403, DomainValidationError -> 422. Les erreurs
d'authentification ci-dessous sont mappées sur 401 dans
identity/presentation/router.py (IDENTITY_ERROR_STATUS).

Le champ de classe `code` est un identifiant stable et machine-readable,
exposé tel quel dans le corps des réponses HTTP : les frontends se basent sur
lui (jamais sur le message, qui peut changer ou être traduit). Convention de
nommage : "<contexte>.<cas>".
"""

from vetolib.shared.domain.errors import (
    ConflictError,
    DomainError,
    EntityNotFoundError,
    PermissionDeniedError,
)


class EmailAlreadyExistsError(ConflictError):
    """Inscription refusée : email déjà pris (clinique ou utilisateur) -> 409."""

    code = "identity.email_already_exists"


class InvalidCredentialsError(DomainError):
    """Message identique que l'email soit inconnu ou le mot de passe faux :
    pas d'oracle d'existence de compte.

    (Un attaquant ne doit pas pouvoir deviner quels emails ont un compte en
    comparant les réponses du login.) Mappée sur HTTP 401 en présentation.
    """

    code = "identity.invalid_credentials"


class InvalidTokenError(DomainError):
    """JWT expiré, falsifié, malformé ou de mauvais type -> 401, il faut
    se reconnecter (ou passer par /auth/refresh avec le cookie refresh).

    NB : un cookie absent ne passe pas par ici, la couche presentation
    répond 401 directement (HTTPException), sans erreur de domaine.
    """

    code = "identity.invalid_token"


class UserInactiveError(PermissionDeniedError):
    """Compte désactivé (User.deactivate) : accès refusé -> 403.

    Le compte existe toujours (soft disable, audit conservé) mais ne peut
    plus agir sur la plateforme.
    """

    code = "identity.user_inactive"


class ClinicNotFoundError(EntityNotFoundError):
    """Clinique inexistante ou soft-deleted -> 404."""

    code = "identity.clinic_not_found"


class UserNotFoundError(EntityNotFoundError):
    """Utilisateur inexistant ou soft-deleted -> 404."""

    code = "identity.user_not_found"
