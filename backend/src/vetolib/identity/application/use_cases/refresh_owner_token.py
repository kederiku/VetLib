"""Use case : rotation de session d'un propriétaire (refresh token B2C).

Comme RefreshToken (staff) : chaque refresh ré-émet une paire complète, et
le rechargement de l'owner en base vaut révocation implicite (soft delete
-> refresh refusé). Le decode exige strictement kind == "owner" : un
refresh STAFF posé dans le cookie owner est rejeté ici.
TODO: denylist des `jti` consommés (Redis) pour invalider un refresh volé.
"""

from vetolib.identity.application.dto import CurrentOwner, TokenPair
from vetolib.identity.application.mappers import to_current_owner
from vetolib.identity.application.ports import IdentityUoWFactory, OwnerTokenProvider
from vetolib.identity.domain.errors import InvalidTokenError


class RefreshOwnerToken:
    """Vérifie le refresh owner et ré-émet une paire complète (rotation)."""

    def __init__(self, uow_factory: IdentityUoWFactory, tokens: OwnerTokenProvider) -> None:
        self._uow_factory = uow_factory
        self._tokens = tokens

    async def execute(self, refresh_token: str) -> tuple[TokenPair, CurrentOwner]:
        claims = self._tokens.decode_refresh(refresh_token)
        async with self._uow_factory() as uow:
            owner = await uow.owners.get_by_id(claims.owner_id)
            if owner is None:
                raise InvalidTokenError("Session expirée.")
            return self._tokens.issue_pair(owner), to_current_owner(owner)
