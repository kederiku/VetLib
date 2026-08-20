"""Use case RefreshToken : renouvellement de session via le refresh token.

Le refresh token arrive du cookie HttpOnly vetolib_refresh, dont le path
est restreint à /api/v1/auth/refresh : le navigateur ne l'envoie que sur
cette route, ce qui limite drastiquement sa surface d'exposition.
L'access token ne vivant que 15 min, ce use case est le seul moyen de
prolonger une session sans redemander le mot de passe (jusqu'à 7 jours).
"""

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
        """Déroulé : décoder le refresh token (signature, expiration, type),
        recharger user et clinique en base, puis ré-émettre une paire neuve
        qui reflète le rôle et les permissions ACTUELS de l'utilisateur."""
        # decode_refresh lève InvalidTokenError si le token est falsifié,
        # expiré, ou si c'est un access token déguisé (claim type vérifié).
        claims = self._tokens.decode_refresh(refresh_token)
        async with self._uow_factory() as uow:
            # get_by_id filtre les soft-deleted (deleted_at non nul) : un
            # compte supprimé ou désactivé perd sa session au plus tard à
            # l'expiration de son access token courant (15 min).
            user = await uow.users.get_by_id(claims.user_id)
            if user is None:
                raise InvalidTokenError("Session expirée.")
            if not user.is_active:
                raise UserInactiveError("Compte désactivé.")
            clinic = await uow.clinics.get_by_id(user.clinic_id)
            if clinic is None:
                raise ClinicNotFoundError("Clinique introuvable.")
            return self._tokens.issue_pair(user), to_current_user(user, clinic.name)
