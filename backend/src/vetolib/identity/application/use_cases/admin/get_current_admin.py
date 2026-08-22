"""Use case GetCurrentAdmin : resolution du super-admin derriere un jeton.

Sert la route /admin/auth/me ET la dependance qui protege TOUT l'espace
d'administration : c'est donc le code le plus souvent execute du back-office.

Il RELIT le compte en base a chaque requete, la ou l'espace staff se
contente des claims embarques dans son "fat token". Ce n'est pas une
incoherence mais l'inverse exact, et c'est voulu : l'espace plateforme voit
les donnees de tous les tenants, la revocation d'un acces doit donc y
prendre effet a la requete suivante, pas au bout de quinze minutes. Sur une
table de quelques lignes, la lecture ne coute rien.
"""

from vetolib.identity.application.dto import CurrentAdmin
from vetolib.identity.application.mappers import to_current_admin
from vetolib.identity.application.ports import (
    IdentityUoWFactory,
    PlatformAdminTokenProvider,
)
from vetolib.identity.domain.errors import AdminInactiveError, InvalidTokenError


class GetCurrentAdmin:
    """Decode l'access token admin et recharge le compte."""

    def __init__(self, uow_factory: IdentityUoWFactory, tokens: PlatformAdminTokenProvider) -> None:
        self._uow_factory = uow_factory
        self._tokens = tokens

    async def execute(self, access_token: str) -> CurrentAdmin:
        claims = self._tokens.decode_access(access_token)
        async with self._uow_factory() as uow:
            admin = await uow.admins.get_by_id(claims.admin_id)
            if admin is None:
                raise InvalidTokenError("Session invalide.")
            if not admin.is_active:
                raise AdminInactiveError("Accès révoqué.")
            return to_current_admin(admin)
