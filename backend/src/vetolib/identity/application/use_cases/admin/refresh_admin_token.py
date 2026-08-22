"""Use case RefreshAdminToken : rotation de session du back-office.

Comme pour les deux autres espaces, chaque refresh re-emet une paire
complete et le rechargement du compte en base vaut revocation implicite
(compte efface ou revoque -> refresh refuse). Le decode exige strictement
kind == "platform" : un refresh staff ou proprietaire glisse dans le cookie
admin est rejete ici.

Le cookie de refresh admin a un TTL dedie de 12 h (contre 7 jours ailleurs)
et un path restreint a cette seule route : c'est le jeton le plus puissant
du systeme, il circule le moins possible.
"""

from vetolib.identity.application.dto import CurrentAdmin, TokenPair
from vetolib.identity.application.mappers import to_current_admin
from vetolib.identity.application.ports import (
    IdentityUoWFactory,
    PlatformAdminTokenProvider,
)
from vetolib.identity.domain.errors import AdminInactiveError, InvalidTokenError


class RefreshAdminToken:
    """Verifie le refresh admin et re-emet une paire complete (rotation)."""

    def __init__(self, uow_factory: IdentityUoWFactory, tokens: PlatformAdminTokenProvider) -> None:
        self._uow_factory = uow_factory
        self._tokens = tokens

    async def execute(self, refresh_token: str) -> tuple[TokenPair, CurrentAdmin]:
        claims = self._tokens.decode_refresh(refresh_token)
        async with self._uow_factory() as uow:
            admin = await uow.admins.get_by_id(claims.admin_id)
            if admin is None:
                raise InvalidTokenError("Session expirée.")
            # Sans ce controle, une session ouverte avant la revocation se
            # prolongerait de 12 h en 12 h, indefiniment.
            if not admin.is_active:
                raise AdminInactiveError("Accès révoqué.")
            return self._tokens.issue_pair(admin), to_current_admin(admin)
