from vetolib.identity.application.dto import CurrentUser, LoginCommand, TokenPair
from vetolib.identity.application.mappers import to_current_user
from vetolib.identity.application.ports import (
    IdentityUoWFactory,
    PasswordHasher,
    TokenProvider,
)
from vetolib.identity.domain.errors import (
    ClinicNotFoundError,
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
        try:
            email = Email(cmd.email)
        except Exception as exc:
            raise InvalidCredentialsError("Identifiants invalides.") from exc

        async with self._uow_factory() as uow:
            user = await uow.users.get_by_email(email)
            if user is None:
                # Email inconnu : on vérifie quand même un hash factice pour
                # un temps de réponse constant, et même message d'erreur.
                self._hasher.verify_and_update(cmd.password, self._hasher.dummy_hash())
                raise InvalidCredentialsError("Identifiants invalides.")

            valid, new_hash = self._hasher.verify_and_update(
                cmd.password, user.hashed_password.value
            )
            if not valid:
                raise InvalidCredentialsError("Identifiants invalides.")
            if not user.is_active:
                raise UserInactiveError("Compte désactivé.")

            if new_hash is not None:
                # Rehash transparent si les paramètres Argon2 ont évolué.
                user.change_password(HashedPassword(new_hash))
                await uow.users.update(user)
                await uow.commit()

            clinic = await uow.clinics.get_by_id(user.clinic_id)
            if clinic is None:
                raise ClinicNotFoundError("Clinique introuvable.")

            return self._tokens.issue_pair(user), to_current_user(user, clinic.name)
