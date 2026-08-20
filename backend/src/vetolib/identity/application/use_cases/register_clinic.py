from vetolib.identity.application.dto import RegisterClinicCommand, RegisterClinicResult
from vetolib.identity.application.ports import IdentityUoWFactory, PasswordHasher
from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.errors import EmailAlreadyExistsError
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import Email, HashedPassword, Role
from vetolib.shared.application.clock import Clock


class RegisterClinic:
    """Crée la clinique (tenant) et son premier utilisateur gérant.

    Flux pré-tenant par nature -> UoW système. L'événement ClinicRegistered
    part dans l'outbox avec la même transaction (atomicité garantie).
    """

    def __init__(
        self, uow_factory: IdentityUoWFactory, hasher: PasswordHasher, clock: Clock
    ) -> None:
        self._uow_factory = uow_factory
        self._hasher = hasher
        self._clock = clock

    async def execute(self, cmd: RegisterClinicCommand) -> RegisterClinicResult:
        email = Email(cmd.email)
        now = self._clock.now()
        # Hash AVANT d'ouvrir la transaction : ~50 ms de CPU Argon2 ne doivent
        # pas retenir une connexion du pool.
        hashed_password = HashedPassword(await self._hasher.hash(cmd.password))
        async with self._uow_factory() as uow:
            email_taken = await uow.users.get_by_email(
                email
            ) is not None or await uow.clinics.exists_with_email(email)
            if email_taken:
                raise EmailAlreadyExistsError(f"L'adresse {email} est déjà utilisée.")

            clinic, event = Clinic.register(
                name=cmd.clinic_name, email=email, phone=cmd.phone, now=now
            )
            await uow.clinics.add(clinic)

            manager = User.create(
                clinic_id=clinic.id,
                email=email,
                hashed_password=hashed_password,
                first_name=cmd.first_name,
                last_name=cmd.last_name,
                role=Role.MANAGER,
                now=now,
            )
            await uow.users.add(manager)

            uow.add_event(event)
            await uow.commit()
            return RegisterClinicResult(clinic_id=clinic.id, user_id=manager.id)
