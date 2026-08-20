from vetolib.shared.domain.errors import (
    ConflictError,
    DomainError,
    EntityNotFoundError,
    PermissionDeniedError,
)


class EmailAlreadyExistsError(ConflictError):
    code = "identity.email_already_exists"


class InvalidCredentialsError(DomainError):
    """Message identique que l'email soit inconnu ou le mot de passe faux :
    pas d'oracle d'existence de compte."""

    code = "identity.invalid_credentials"


class InvalidTokenError(DomainError):
    code = "identity.invalid_token"


class UserInactiveError(PermissionDeniedError):
    code = "identity.user_inactive"


class ClinicNotFoundError(EntityNotFoundError):
    code = "identity.clinic_not_found"


class UserNotFoundError(EntityNotFoundError):
    code = "identity.user_not_found"
