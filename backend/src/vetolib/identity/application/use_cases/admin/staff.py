"""Use cases d'ECRITURE du back-office sur le personnel des cliniques.

Trois operations : creer un compte dans une clinique existante, changer un
role, et activer ou desactiver un acces.

Le fil rouge de ce module est le GARDE-FOU DU DERNIER GERANT. Retrograder ou
desactiver le dernier `manager` actif d'une clinique la rendrait
ingouvernable : plus personne n'y detiendrait `clinic:manage`, donc plus de
fiche clinique, plus de reglages d'agenda, plus de gestion du personnel -- et
la clinique elle-meme ne pourrait pas s'en sortir. Ce n'est pas de la
prudence excessive : c'est un etat dont on ne sort pas, cree par un clic qui
a l'air anodin.
"""

import uuid

from vetolib.identity.application.dto import (
    AdminActor,
    AdminCreateStaffCommand,
    AdminStaffCreated,
    AdminStaffRow,
)
from vetolib.identity.application.mappers import to_admin_staff_row
from vetolib.identity.application.ports import (
    CompromisedPasswordChecker,
    IdentityUnitOfWork,
    IdentityUoWFactory,
    PasswordHasher,
)
from vetolib.identity.application.use_cases._email_availability import (
    ensure_email_available,
)
from vetolib.identity.application.use_cases.admin.clinics import _tracer
from vetolib.identity.domain.admin_audit import AuditAction, AuditTargetType
from vetolib.identity.domain.errors import (
    ClinicNotFoundError,
    LastManagerError,
    UserNotFoundError,
)
from vetolib.identity.domain.passphrase import generer_phrase_de_passe
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import (
    Email,
    HashedPassword,
    PlainPassword,
    Role,
)
from vetolib.shared.application.clock import Clock


async def _refuser_si_dernier_gerant(
    uow: IdentityUnitOfWork, membre: User, *, restera_gerant_actif: bool
) -> None:
    """Leve si l'operation retirerait le DERNIER gerant actif de la clinique.

    Le controle ne se declenche que si le membre EST aujourd'hui un gerant
    actif et ne le restera pas : retrograder un ASV ou desactiver un
    veterinaire ne menace rien.
    """
    if membre.role is not Role.MANAGER or not membre.is_active or restera_gerant_actif:
        return
    if await uow.directory.count_active_managers(membre.clinic_id) <= 1:
        raise LastManagerError(
            "C'est le dernier gérant actif de cette clinique. "
            "Nommez-en un autre avant de retirer celui-ci."
        )


class CreateAdminStaff:
    """Cree un membre du personnel dans une clinique existante.

    Comble au passage un trou du produit : il n'existait AUCUN moyen
    d'ajouter un membre du personnel a une clinique. Le test d'integration
    test_scheduling_permissions.py devait taper directement dans la couche
    infrastructure pour s'en fabriquer un.

    Le mot de passe est GENERE et renvoye une seule fois : voir
    AdminStaffCreated et domain/passphrase.py.
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

    async def execute(self, cmd: AdminCreateStaffCommand, actor: AdminActor) -> AdminStaffCreated:
        email = Email(cmd.email)
        now = self._clock.now()
        phrase = generer_phrase_de_passe()
        # Meme politique que partout ailleurs, y compris sur un secret
        # genere : aucun chemin du code ne doit mener a une empreinte
        # stockee sans etre passe par la.
        PlainPassword(phrase)
        await self._breaches.is_compromised(phrase)
        empreinte = HashedPassword(await self._hasher.hash(phrase))

        async with self._uow_factory() as uow:
            clinique = await uow.clinics.get_by_id(cmd.clinic_id)
            if clinique is None:
                raise ClinicNotFoundError("Clinique introuvable.")
            await ensure_email_available(uow, email)

            membre = User.create(
                clinic_id=cmd.clinic_id,
                email=email,
                hashed_password=empreinte,
                first_name=cmd.first_name,
                last_name=cmd.last_name,
                role=cmd.role,
                now=now,
            )
            await uow.users.add(membre)
            await _tracer(
                uow,
                actor=actor,
                action=AuditAction.STAFF_CREATED,
                target_type=AuditTargetType.USER,
                target_id=membre.id,
                now=now,
                details={"clinic_id": str(cmd.clinic_id), "role": membre.role.value},
            )
            await uow.commit()

            return AdminStaffCreated(
                user_id=membre.id,
                email=membre.email.value,
                role=membre.role,
                temporary_password=phrase,
            )


class ChangeAdminStaffRole:
    """Change le role d'un membre du personnel.

    Note a faire remonter dans l'interface : le backend embarque les
    permissions dans le jeton d'acces (fat token). Le nouveau role ne prend
    donc effet chez l'interesse qu'au PROCHAIN jeton, dans quinze minutes au
    plus. Ce n'est pas un bug, c'est la contrepartie assumee du fat token --
    mais l'ecran doit le dire, sinon l'administrateur croira que son clic n'a
    rien fait.
    """

    def __init__(self, uow_factory: IdentityUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(self, user_id: uuid.UUID, *, role: Role, actor: AdminActor) -> AdminStaffRow:
        async with self._uow_factory() as uow:
            membre = await uow.users.get_by_id(user_id)
            if membre is None:
                raise UserNotFoundError("Membre du personnel introuvable.")

            ancien = membre.role
            if ancien is not role:
                await _refuser_si_dernier_gerant(
                    uow, membre, restera_gerant_actif=role is Role.MANAGER
                )
                membre.change_role(role)
                await uow.users.update(membre)
                await _tracer(
                    uow,
                    actor=actor,
                    action=AuditAction.STAFF_ROLE_CHANGED,
                    target_type=AuditTargetType.USER,
                    target_id=membre.id,
                    now=self._clock.now(),
                    details={"from": ancien.value, "to": role.value},
                )
                await uow.commit()

            return await _relire(uow, user_id)


class SetAdminStaffStatus:
    """Active ou desactive un membre du personnel. IDEMPOTENT."""

    def __init__(self, uow_factory: IdentityUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(
        self, user_id: uuid.UUID, *, active: bool, actor: AdminActor
    ) -> AdminStaffRow:
        async with self._uow_factory() as uow:
            membre = await uow.users.get_by_id(user_id)
            if membre is None:
                raise UserNotFoundError("Membre du personnel introuvable.")

            if membre.is_active is not active:
                if not active:
                    await _refuser_si_dernier_gerant(uow, membre, restera_gerant_actif=False)
                    membre.deactivate()
                else:
                    membre.activate()
                await uow.users.update(membre)
                await _tracer(
                    uow,
                    actor=actor,
                    action=(
                        AuditAction.STAFF_ACTIVATED if active else AuditAction.STAFF_DEACTIVATED
                    ),
                    target_type=AuditTargetType.USER,
                    target_id=membre.id,
                    now=self._clock.now(),
                )
                await uow.commit()

            return await _relire(uow, user_id)


async def _relire(uow: IdentityUnitOfWork, user_id: uuid.UUID) -> AdminStaffRow:
    """Relit la ligne complete (nom de clinique compris) apres mutation.

    On ne reconstruit pas la projection a la main depuis l'entite : le nom de
    la clinique n'est pas un champ de User, et deux facons de fabriquer la
    meme ligne finiraient par diverger.
    """
    ligne = await uow.directory.get_staff_row(user_id)
    if ligne is None:
        raise UserNotFoundError("Membre du personnel introuvable.")
    return to_admin_staff_row(ligne)
