class DomainError(Exception):
    """Erreur métier. `code` est un identifiant machine-readable stable,
    exposé tel quel dans les réponses HTTP."""

    code: str = "domain.error"


class DomainValidationError(DomainError):
    code = "domain.validation"


class EntityNotFoundError(DomainError):
    code = "domain.not_found"


class ConflictError(DomainError):
    code = "domain.conflict"


class PermissionDeniedError(DomainError):
    code = "domain.permission_denied"
