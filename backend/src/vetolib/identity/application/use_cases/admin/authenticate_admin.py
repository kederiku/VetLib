"""Use case AuthenticateAdmin : connexion au back-office plateforme.

Calque exact d'AuthenticateUser, avec les memes protections anti-oracle
(erreur generique unique, verification d'un hash factice quand l'email est
inconnu, controle du statut APRES le mot de passe) et deux differences :

- pas de clinique a charger : un super-admin n'appartient a aucun tenant ;
- une ecriture systematique en cas de succes (last_login_at), la ou le login
  staff n'ecrit qu'en cas de rehash. Le cout est nul sur une table de
  quelques lignes, et c'est le seul indicateur bon marche d'un compte
  dormant ou d'une connexion anormale.

La limitation de debit ne vit PAS ici : elle raisonne en adresses IP et en
requetes HTTP, deux notions que la couche application ignore. Elle est posee
par le routeur (voir routers/admin_auth.py).
"""

from vetolib.identity.application.dto import CurrentAdmin, LoginCommand, TokenPair
from vetolib.identity.application.mappers import to_current_admin
from vetolib.identity.application.ports import (
    IdentityUoWFactory,
    PasswordHasher,
    PlatformAdminTokenProvider,
)
from vetolib.identity.domain.errors import AdminInactiveError, InvalidCredentialsError
from vetolib.identity.domain.value_objects import Email, HashedPassword
from vetolib.shared.application.clock import Clock


class AuthenticateAdmin:
    """Verifie les identifiants d'un fondateur et emet la paire de jetons."""

    def __init__(
        self,
        uow_factory: IdentityUoWFactory,
        hasher: PasswordHasher,
        tokens: PlatformAdminTokenProvider,
        clock: Clock,
    ) -> None:
        self._uow_factory = uow_factory
        self._hasher = hasher
        self._tokens = tokens
        self._clock = clock

    async def execute(self, cmd: LoginCommand) -> tuple[TokenPair, CurrentAdmin]:
        """Deroule : email -> hash -> statut -> horodatage -> jetons."""
        # Un email mal forme produit la MEME erreur qu'un mot de passe faux :
        # aucune reponse ne doit permettre de deviner qu'un compte existe.
        try:
            email = Email(cmd.email)
        except Exception as exc:
            raise InvalidCredentialsError("Identifiants invalides.") from exc

        async with self._uow_factory() as uow:
            admin = await uow.admins.get_by_email(email)
            if admin is None:
                # Email inconnu : on verifie quand meme un hash factice, pour
                # que la reponse coute le meme temps qu'avec un compte reel.
                await self._hasher.verify_and_update(cmd.password, self._hasher.dummy_hash())
                raise InvalidCredentialsError("Identifiants invalides.")

            valid, new_hash = await self._hasher.verify_and_update(
                cmd.password, admin.hashed_password.value
            )
            if not valid:
                raise InvalidCredentialsError("Identifiants invalides.")
            # Statut verifie APRES le mot de passe : un compte revoque ne
            # revele son etat qu'a qui connait deja le bon mot de passe.
            if not admin.is_active:
                raise AdminInactiveError("Accès révoqué.")

            if new_hash is not None:
                # Rehash transparent si les parametres Argon2 ont evolue.
                admin.change_password(HashedPassword(new_hash))
            admin.record_login(self._clock.now())
            await uow.admins.update(admin)
            await uow.commit()

            return self._tokens.issue_pair(admin), to_current_admin(admin)
