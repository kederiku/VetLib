"""Use case : profil du propriétaire courant (GET /owner/auth/me).

Décode l'access token owner (kind == "owner" exigé) puis RECHARGE l'owner
en base : le token prouve la session, mais la fiche affichée doit refléter
l'état réel (soft delete récent -> session invalide, profil à jour après
un update_profile).
"""

from vetolib.identity.application.dto import CurrentOwner
from vetolib.identity.application.mappers import to_current_owner
from vetolib.identity.application.ports import IdentityUoWFactory, OwnerTokenProvider
from vetolib.identity.domain.errors import InvalidTokenError


class GetCurrentOwner:
    """Résout l'access token owner en projection CurrentOwner."""

    def __init__(self, uow_factory: IdentityUoWFactory, tokens: OwnerTokenProvider) -> None:
        self._uow_factory = uow_factory
        self._tokens = tokens

    async def execute(self, access_token: str) -> CurrentOwner:
        claims = self._tokens.decode_access(access_token)
        async with self._uow_factory() as uow:
            owner = await uow.owners.get_by_id(claims.owner_id)
            if owner is None:
                raise InvalidTokenError("Session invalide.")
            return to_current_owner(owner)
