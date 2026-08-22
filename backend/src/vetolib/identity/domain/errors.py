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
    DomainValidationError,
    EntityNotFoundError,
    PermissionDeniedError,
)


class EmailAlreadyExistsError(ConflictError):
    """Inscription refusée : email déjà pris (clinique ou utilisateur) -> 409."""

    code = "identity.email_already_exists"


class CompromisedPasswordError(DomainValidationError):
    """Mot de passe présent dans une fuite de données connue -> 422.

    Contrepartie de l'abandon des règles de composition (voir la politique
    dans domain/value_objects.py) : NIST SP 800-63B exige de confronter tout
    nouveau mot de passe à une liste de secrets compromis. Un mot de passe de
    20 caractères peut être parfaitement conforme ET déjà connu de tous les
    attaquants ; seule cette vérification l'attrape.

    Le message reste explicite : contrairement au login, il n'y a ici aucun
    secret à protéger, et une personne qui ne comprend pas le refus va
    simplement réessayer avec un autre mot de passe compromis.
    """

    code = "identity.password_compromised"


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


class ClinicSuspendedError(PermissionDeniedError):
    """Clinique suspendue par la plateforme : tout son personnel est bloque -> 403.

    A ne pas confondre avec ClinicNotFoundError (404), qui signale une
    clinique inexistante ou effacee. Ici la clinique existe, ses donnees sont
    intactes, et la reactivation est un clic dans le back-office : le message
    metier correct est "suspendue", pas "introuvable".

    Levee APRES la verification du mot de passe et de user.is_active : l'etat
    d'une clinique ne se revele qu'a quelqu'un qui a deja prouve son identite.
    """

    code = "identity.clinic_suspended"


class OwnerInactiveError(PermissionDeniedError):
    """Compte proprietaire desactive par la plateforme -> 403.

    Pendant B2C de UserInactiveError. Comme pour le staff, l'erreur n'est
    levee qu'une fois le mot de passe verifie : sinon elle deviendrait un
    oracle permettant de tester l'existence d'un compte.
    """

    code = "identity.owner_inactive"


class AdminInactiveError(PermissionDeniedError):
    """Compte super-admin revoque -> 403.

    Troisieme membre de la famille (avec UserInactiveError et
    OwnerInactiveError). Meme regle : leve APRES la verification du mot de
    passe, jamais avant.
    """

    code = "identity.admin_inactive"


class PlatformAdminNotFoundError(EntityNotFoundError):
    """Super-admin inexistant ou efface -> 404.

    Utilise par la commande d'administration (activation/desactivation d'un
    compte existant), pas par une route HTTP : l'espace admin ne dit jamais
    a un anonyme si un compte existe.
    """

    code = "identity.platform_admin_not_found"


class OwnerNotFoundError(EntityNotFoundError):
    """Proprietaire inexistant ou efface -> 404."""

    code = "identity.owner_not_found"


class LastManagerError(ConflictError):
    """Refus de retirer le DERNIER gerant actif d'une clinique -> 409.

    Retrograder ou desactiver ce compte rendrait la clinique ingouvernable :
    plus personne n'y detiendrait `clinic:manage`, donc plus de fiche
    clinique, plus de reglages d'agenda, plus de gestion du personnel. Et
    aucune route ne permettrait de reparer depuis l'interface de la clinique
    elle-meme.

    Ce n'est pas de la prudence excessive : c'est un etat dont on ne sort
    pas, cree par un clic qui a l'air anodin.
    """

    code = "identity.last_manager"
