"""Erreurs métier de base (contexte `shared`, couche domain).

Ces exceptions sont levées par les entités et les use cases, qui ne
connaissent rien de HTTP. C'est la couche presentation (voir
shared/presentation/error_handlers.py) qui les traduit en réponses :
DomainValidationError -> 422, EntityNotFoundError -> 404,
ConflictError -> 409, PermissionDeniedError -> 403. Le domaine reste
ainsi indépendant du framework web (architecture hexagonale) : on peut
le tester sans serveur, et changer de framework sans le toucher.

Chaque classe fige un `code` : un identifiant STABLE et contractuel sur
lequel les frontends branchent leur logique. Le message (str(exc)) est
purement informatif et peut changer ; le code, jamais, une fois publié.

Les contextes métier dérivent leurs propres erreurs de ces classes
(ex : une InvalidCredentialsError dans identity) : le handler résout le
statut HTTP en remontant le MRO, l'entrée la plus précise gagne.
"""


class DomainError(Exception):
    """Erreur métier. `code` est un identifiant machine-readable stable,
    exposé tel quel dans les réponses HTTP.

    Racine de toutes les erreurs métier du projet : un seul exception
    handler FastAPI attrape DomainError et couvre toute la hiérarchie.
    """

    code: str = "domain.error"


class DomainValidationError(DomainError):
    """Donnée refusée par une règle métier (-> HTTP 422)."""

    code = "domain.validation"


class EntityNotFoundError(DomainError):
    """Entité introuvable, soft-deleted, ou invisible via la RLS (-> 404).

    Subtilité multi-tenant : une entité appartenant à une AUTRE clinique
    est filtrée par les policies RLS PostgreSQL, donc jamais chargée.
    Répondre 404 (plutôt que 403) évite de révéler l'existence d'une
    donnée hors du tenant courant.
    """

    code = "domain.not_found"


class ConflictError(DomainError):
    """Conflit avec l'état existant, ex : email déjà enregistré (-> 409)."""

    code = "domain.conflict"


class PermissionDeniedError(DomainError):
    """Utilisateur authentifié mais sans le droit requis (-> HTTP 403)."""

    code = "domain.permission_denied"
