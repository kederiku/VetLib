"""Use case : inscription d'un propriétaire d'animaux (compte B2C).

Miroir de RegisterClinic pour l'espace propriétaires : un seul compte est
créé (pas de tenant), l'événement OwnerRegistered part dans l'outbox avec
la même transaction. Flux pré-tenant par nature -> UoW système.
"""

from vetolib.identity.application.dto import RegisterOwnerCommand, RegisterOwnerResult
from vetolib.identity.application.ports import (
    CompromisedPasswordChecker,
    IdentityUoWFactory,
    PasswordHasher,
)
from vetolib.identity.domain.errors import CompromisedPasswordError, EmailAlreadyExistsError
from vetolib.identity.domain.owner import Owner
from vetolib.identity.domain.value_objects import Email, HashedPassword, PlainPassword
from vetolib.shared.application.clock import Clock


class RegisterOwner:
    """Crée le compte propriétaire et émet l'événement d'inscription."""

    def __init__(
        self,
        uow_factory: IdentityUoWFactory,
        hasher: PasswordHasher,
        clock: Clock,
        breaches: CompromisedPasswordChecker,
    ) -> None:
        self._uow_factory = uow_factory
        self._hasher = hasher
        self._clock = clock
        self._breaches = breaches

    async def execute(self, cmd: RegisterOwnerCommand) -> RegisterOwnerResult:
        email = Email(cmd.email)
        # Politique de mot de passe en DEUX temps, du moins cher au plus cher :
        # 1. la forme (longueur), verdict immédiat rendu par le value object ;
        # 2. la compromission, qui coûte un appel réseau -- inutile de le
        #    payer pour un mot de passe déjà refusé à l'étape précédente.
        password = PlainPassword(cmd.password)
        if await self._breaches.is_compromised(password.value):
            raise CompromisedPasswordError(
                "Ce mot de passe figure dans une fuite de données connue. Choisissez-en un autre."
            )
        now = self._clock.now()
        # Hash AVANT d'ouvrir la transaction : ~50 ms de CPU Argon2 ne doivent
        # pas retenir une connexion du pool.
        hashed_password = HashedPassword(await self._hasher.hash(password.value))
        async with self._uow_factory() as uow:
            # Unicité restreinte à l'espace owners : un email deja utilisé par
            # un compte STAFF (users) n'est pas bloquant — les deux espaces de
            # comptes sont indépendants (un vétérinaire peut aussi être
            # propriétaire). La course concurrente résiduelle est arbitrée par
            # l'index unique partiel uq_owners_email_active (traduite en 409
            # par la UoW).
            if await uow.owners.get_by_email(email) is not None:
                raise EmailAlreadyExistsError(f"L'adresse {email} est déjà utilisée.")

            owner, event = Owner.register(
                email=email,
                hashed_password=hashed_password,
                first_name=cmd.first_name,
                last_name=cmd.last_name,
                phone=cmd.phone,
                now=now,
            )
            await uow.owners.add(owner)
            uow.add_event(event)
            await uow.commit()
            return RegisterOwnerResult(owner_id=owner.id)
