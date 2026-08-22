"""Use case RegisterClinic : inscription d'une nouvelle clinique (tenant).

Un use case est le point d'orchestration de la couche application : il
enchaîne value objects, entités du domaine et ports (UoW, hasher, horloge)
pour réaliser UN scénario métier, sans aucun détail technique (ni SQL, ni
HTTP, ni framework). La route FastAPI ne fait que traduire HTTP <-> DTO et
déléguer ici ; les règles métier fines vivent dans le domaine (Clinic.register,
User.create) ; la technique vit dans les adapters injectés.
"""

from vetolib.identity.application.dto import RegisterClinicCommand, RegisterClinicResult
from vetolib.identity.application.ports import (
    CompromisedPasswordChecker,
    IdentityUoWFactory,
    PasswordHasher,
)
from vetolib.identity.application.use_cases._email_availability import (
    ensure_email_available,
)
from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.errors import CompromisedPasswordError
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import Email, HashedPassword, PlainPassword, Role
from vetolib.shared.application.clock import Clock


class RegisterClinic:
    """Crée la clinique (tenant) et son premier utilisateur gérant.

    Flux pré-tenant par nature -> UoW système. L'événement ClinicRegistered
    part dans l'outbox avec la même transaction (atomicité garantie).

    Déroulé de execute() :
    1. valider l'email et le mot de passe (value objects), vérifier que ce
       dernier n'est pas compromis, puis le hasher -- le tout hors TX ;
    2. vérifier que l'email est libre côté users ET côté clinics ;
    3. Clinic.register(...) crée l'entité tenant + l'événement domaine ;
    4. User.create(...) crée le premier compte avec le rôle MANAGER ;
    5. add_event + commit : lignes clinics, users et outbox_events écrites
       dans la MÊME transaction ; le relais TaskIQ publiera l'événement
       ensuite (email de bienvenue...) sans risque d'incohérence.
    """

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

    async def execute(self, cmd: RegisterClinicCommand) -> RegisterClinicResult:
        email = Email(cmd.email)
        # Même politique que pour les propriétaires (RegisterOwner) : forme
        # d'abord (value object, gratuit), compromission ensuite (réseau).
        # Une seule règle pour les deux espaces de comptes, un seul endroit.
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
            # L'email sert d'identifiant de connexion global : il doit être
            # libre dans les deux tables. Recherche pré-tenant (UoW système,
            # la RLS ne s'applique pas : la clinique n'existe pas encore).
            # L'invariant est extrait, car le back-office plateforme crée lui
            # aussi des cliniques et du personnel : la règle est écrite une
            # seule fois, dans _email_availability.py.
            await ensure_email_available(uow, email)

            # La factory du domaine renvoie l'entité ET l'événement associé :
            # c'est le domaine qui décide de ce qui constitue le fait métier
            # "clinique enregistrée", pas la couche application.
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

            # Pattern Outbox : l'événement est inséré dans outbox_events au
            # sein de CETTE transaction. Soit tout est commité (clinique +
            # gérant + événement), soit rien : impossible d'envoyer un email
            # de bienvenue pour une clinique qui n'a pas été créée, ou de
            # créer la clinique en perdant l'événement.
            uow.add_event(event)
            await uow.commit()
            return RegisterClinicResult(clinic_id=clinic.id, user_id=manager.id)
