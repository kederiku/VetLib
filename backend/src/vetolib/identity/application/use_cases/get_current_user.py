from vetolib.identity.application.dto import CurrentUser
from vetolib.identity.application.mappers import to_current_user
from vetolib.identity.application.ports import IdentityUoWFactory, TokenProvider
from vetolib.identity.domain.errors import ClinicNotFoundError, InvalidTokenError


class GetCurrentUser:
    """Décode l'access token puis recharge le user : le fat token suffit pour
    l'autorisation, mais /me doit refléter l'état réel en base."""

    def __init__(self, uow_factory: IdentityUoWFactory, tokens: TokenProvider) -> None:
        self._uow_factory = uow_factory
        self._tokens = tokens

    async def execute(self, access_token: str) -> CurrentUser:
        claims = self._tokens.decode_access(access_token)
        async with self._uow_factory() as uow:
            user = await uow.users.get_by_id(claims.user_id)
            if user is None or not user.is_active:
                raise InvalidTokenError("Session invalide.")
            clinic = await uow.clinics.get_by_id(user.clinic_id)
            if clinic is None:
                raise ClinicNotFoundError("Clinique introuvable.")
            return to_current_user(user, clinic.name)
