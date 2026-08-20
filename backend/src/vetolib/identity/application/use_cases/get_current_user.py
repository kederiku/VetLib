"""Use case GetCurrentUser : résolution de l'utilisateur derrière un access token.

Sert la route /me et la dépendance FastAPI qui établit l'utilisateur
courant de la requête (dependencies.py). Le token lu vient du cookie
HttpOnly vetolib_access ; la couche presentation l'extrait et ne passe ici
que la chaîne brute (le use case ignore cookies et HTTP).
"""

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
        """Déroulé : décoder l'access token, recharger user + clinique en
        base, renvoyer la projection CurrentUser."""
        # Signature, expiration et type "access" vérifiés ici ; un token
        # falsifié ou périmé lève InvalidTokenError avant toute requête DB.
        claims = self._tokens.decode_access(access_token)
        async with self._uow_factory() as uow:
            # Relecture en base plutôt que confiance aveugle aux claims :
            # un compte désactivé ou soft-deleted depuis l'émission du
            # token est rejeté ici, même si le JWT est encore valide.
            user = await uow.users.get_by_id(claims.user_id)
            if user is None or not user.is_active:
                raise InvalidTokenError("Session invalide.")
            clinic = await uow.clinics.get_by_id(user.clinic_id)
            if clinic is None:
                raise ClinicNotFoundError("Clinique introuvable.")
            return to_current_user(user, clinic.name)
