from vetolib.identity.application.dto import CurrentUser, TokenPair
from vetolib.identity.application.mappers import to_current_user
from vetolib.identity.application.ports import IdentityUoWFactory, TokenProvider
from vetolib.identity.domain.errors import (
    ClinicNotFoundError,
    InvalidTokenError,
    UserInactiveError,
)


class RefreshToken:
    """Rotation complète : chaque refresh ré-émet une paire access + refresh.

    Le rechargement du user en base vaut révocation implicite (désactivé ou
    soft-deleted -> refresh refusé).
    TODO: denylist des `jti` consommés (Redis) pour invalider un refresh volé.
    """

    def __init__(self, uow_factory: IdentityUoWFactory, tokens: TokenProvider) -> None:
        self._uow_factory = uow_factory
        self._tokens = tokens

    async def execute(self, refresh_token: str) -> tuple[TokenPair, CurrentUser]:
        claims = self._tokens.decode_refresh(refresh_token)
        async with self._uow_factory() as uow:
            user = await uow.users.get_by_id(claims.user_id)
            if user is None:
                raise InvalidTokenError("Session expirée.")
            if not user.is_active:
                raise UserInactiveError("Compte désactivé.")
            clinic = await uow.clinics.get_by_id(user.clinic_id)
            if clinic is None:
                raise ClinicNotFoundError("Clinique introuvable.")
            return self._tokens.issue_pair(user), to_current_user(user, clinic.name)
