"""Use case : login d'un propriétaire (portail B2C).

Mêmes protections que le login staff (AuthenticateUser) :
- email malformé, inconnu ou mot de passe faux -> la MEME erreur générique
  InvalidCredentialsError (pas d'oracle d'existence de compte) ;
- vérification d'un hash factice quand l'email est inconnu (temps constant) ;
- rehash transparent si les paramètres Argon2 ont évolué.
Différence avec le staff : pas de clinique à charger. Le compte a en
revanche, depuis l'arrivée du back-office plateforme, son propre drapeau
is_active -- vérifié APRÈS le mot de passe, exactement comme côté staff,
pour ne pas en faire un oracle d'existence de compte.
"""

from vetolib.identity.application.dto import CurrentOwner, LoginCommand, TokenPair
from vetolib.identity.application.mappers import to_current_owner
from vetolib.identity.application.ports import (
    IdentityUoWFactory,
    OwnerTokenProvider,
    PasswordHasher,
)
from vetolib.identity.domain.errors import InvalidCredentialsError, OwnerInactiveError
from vetolib.identity.domain.value_objects import Email, HashedPassword


class AuthenticateOwner:
    """Vérifie les identifiants owner et émet la paire de tokens (kind=owner)."""

    def __init__(
        self,
        uow_factory: IdentityUoWFactory,
        hasher: PasswordHasher,
        tokens: OwnerTokenProvider,
    ) -> None:
        self._uow_factory = uow_factory
        self._hasher = hasher
        self._tokens = tokens

    async def execute(self, cmd: LoginCommand) -> tuple[TokenPair, CurrentOwner]:
        try:
            email = Email(cmd.email)
        except Exception as exc:
            raise InvalidCredentialsError("Identifiants invalides.") from exc

        async with self._uow_factory() as uow:
            owner = await uow.owners.get_by_email(email)
            if owner is None:
                # Email inconnu : verification d'un hash factice pour un temps
                # de réponse constant, et même message d'erreur.
                await self._hasher.verify_and_update(cmd.password, self._hasher.dummy_hash())
                raise InvalidCredentialsError("Identifiants invalides.")

            valid, new_hash = await self._hasher.verify_and_update(
                cmd.password, owner.hashed_password.value
            )
            if not valid:
                raise InvalidCredentialsError("Identifiants invalides.")
            # Compte desactive par le back-office : refus explicite, mais
            # seulement une fois le mot de passe verifie.
            if not owner.is_active:
                raise OwnerInactiveError("Compte désactivé.")

            if new_hash is not None:
                # Rehash transparent : migre le parc au fil des connexions.
                owner.change_password(HashedPassword(new_hash))
                await uow.owners.update(owner)
                await uow.commit()

            return self._tokens.issue_pair(owner), to_current_owner(owner)
