"""Use case AuthenticateUser : login par email + mot de passe.

Orchestration pure : la vérification Argon2 passe par le port
PasswordHasher, l'émission des JWT par le port TokenProvider. La pose des
cookies HttpOnly (vetolib_access / vetolib_refresh) reste dans la couche
presentation : le use case ne sait pas que HTTP existe.

Flux pré-tenant (UoW système) : au moment du login on ne connaît pas
encore la clinique, la recherche par email doit donc voir tous les tenants.

Sécurité : toute cause d'échec côté identifiants (email mal formé, email
inconnu, mauvais mot de passe) produit la même InvalidCredentialsError et,
autant que possible, le même temps de réponse - on ne donne aucun indice
permettant d'énumérer les comptes existants. Les refus d'ETAT (compte
désactivé, clinique suspendue) sont en revanche explicites, mais ils
n'arrivent qu'APRES la vérification du mot de passe : ils ne renseignent
donc que la personne légitime.
"""

from vetolib.identity.application.dto import CurrentUser, LoginCommand, TokenPair
from vetolib.identity.application.mappers import to_current_user
from vetolib.identity.application.ports import (
    IdentityUoWFactory,
    PasswordHasher,
    TokenProvider,
)
from vetolib.identity.domain.errors import (
    ClinicNotFoundError,
    ClinicSuspendedError,
    InvalidCredentialsError,
    UserInactiveError,
)
from vetolib.identity.domain.value_objects import Email, HashedPassword


class AuthenticateUser:
    """Vérifie les identifiants et émet la paire de tokens (access + refresh)."""

    def __init__(
        self,
        uow_factory: IdentityUoWFactory,
        hasher: PasswordHasher,
        tokens: TokenProvider,
    ) -> None:
        self._uow_factory = uow_factory
        self._hasher = hasher
        self._tokens = tokens

    async def execute(self, cmd: LoginCommand) -> tuple[TokenPair, CurrentUser]:
        """Déroulé : normaliser l'email, vérifier le hash Argon2, contrôler
        is_active, rehash transparent si besoin, puis émettre les tokens et
        la projection CurrentUser (les deux repartent vers la presentation,
        qui posera les cookies et sérialisera la réponse)."""
        # Un email mal formé lève une erreur de validation du value object :
        # on la convertit en la MÊME erreur générique qu'un mauvais mot de
        # passe, pour ne jamais révéler si un compte existe.
        try:
            email = Email(cmd.email)
        except Exception as exc:
            raise InvalidCredentialsError("Identifiants invalides.") from exc

        async with self._uow_factory() as uow:
            user = await uow.users.get_by_email(email)
            if user is None:
                # Email inconnu : on vérifie quand même un hash factice pour
                # un temps de réponse constant, et même message d'erreur.
                await self._hasher.verify_and_update(cmd.password, self._hasher.dummy_hash())
                raise InvalidCredentialsError("Identifiants invalides.")

            valid, new_hash = await self._hasher.verify_and_update(
                cmd.password, user.hashed_password.value
            )
            if not valid:
                raise InvalidCredentialsError("Identifiants invalides.")
            # Mot de passe vérifié AVANT is_active : un compte désactivé ne
            # révèle son état qu'à qui connaît déjà le bon mot de passe.
            if not user.is_active:
                raise UserInactiveError("Compte désactivé.")

            if new_hash is not None:
                # Rehash transparent si les paramètres Argon2 ont évolué.
                # Seul cas d'écriture du login : on commite immédiatement
                # pour ne pas perdre le hash renforcé si la suite échouait.
                user.change_password(HashedPassword(new_hash))
                await uow.users.update(user)
                await uow.commit()

            # Le nom de la clinique enrichit la projection CurrentUser
            # (affiché en en-tête des deux frontends dès le login).
            clinic = await uow.clinics.get_by_id(user.clinic_id)
            if clinic is None:
                raise ClinicNotFoundError("Clinique introuvable.")
            # Troisieme et dernier controle, dans cet ordre precis :
            # mot de passe -> compte -> clinique. Une clinique suspendue
            # bloque TOUT son personnel, y compris ses gerants, mais on ne
            # le revele qu'a qui a deja prouve son identite.
            if not clinic.is_active:
                raise ClinicSuspendedError("Clinique suspendue.")

            # Pas de commit ici : lecture seule (hors rehash) et les JWT
            # sont stateless, rien à persister pour ouvrir la session.
            return self._tokens.issue_pair(user), to_current_user(user, clinic.name)
