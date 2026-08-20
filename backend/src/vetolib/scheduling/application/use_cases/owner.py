"""Use cases PROPRIETAIRES : reserver, lister et annuler ses rendez-vous.

Trois modes d'acces distincts, chacun avec sa barriere de securite :
- BookAppointmentByOwner : UoW TENANT construit avec le clinic_id de la
  DEMANDE (la clinique choisie) ; owner_id vient du token, l'appartenance
  de l'animal est verifiee en SQL, et le creneau est REVALIDE avant
  insertion (la contrainte EXCLUDE restant l'arbitre final de la course) ;
- ListOwnerAppointments : UoW SYSTEME + filtre owner_id (les rendez-vous
  d'un proprietaire traversent TOUTES les cliniques : aucune session
  tenant ne peut les couvrir) ;
- CancelAppointmentByOwner : chargement par (id, owner_id) en SQL -- le
  rendez-vous d'un autre est introuvable, jamais interdit.
"""

import uuid
from datetime import timedelta

from vetolib.patients.domain.errors import PetNotFoundError
from vetolib.scheduling.application.availability import DEFAULT_HORIZON
from vetolib.scheduling.application.dto import (
    AppointmentDto,
    AvailabilityQuery,
    OwnerAppointmentView,
    OwnerBookAppointmentCommand,
)
from vetolib.scheduling.application.ports import (
    SchedulingTenantUoWFactory,
    SchedulingUoWFactory,
)
from vetolib.scheduling.application.use_cases._mappers import to_appointment_dto
from vetolib.scheduling.application.use_cases.public import GetPublicAvailabilities
from vetolib.scheduling.domain.appointment import Appointment
from vetolib.scheduling.domain.errors import (
    AppointmentNotFoundError,
    SlotUnavailableError,
)
from vetolib.shared.application.clock import Clock


class BookAppointmentByOwner:
    """Reservation en ligne : creneau revalide, rendez-vous PENDING + event."""

    def __init__(
        self,
        make_tenant_uow: SchedulingTenantUoWFactory,
        system_uow_factory: SchedulingUoWFactory,
        clock: Clock,
    ) -> None:
        self._make_tenant_uow = make_tenant_uow
        # La revalidation du creneau reutilise le use case public (UoW
        # systeme + filtres clinic_id explicites) : une seule implementation
        # du calcul, pas de derive entre l'affichage et la reservation.
        self._availabilities = GetPublicAvailabilities(system_uow_factory, clock)
        self._clock = clock

    async def execute(self, cmd: OwnerBookAppointmentCommand) -> AppointmentDto:
        now = self._clock.now()

        # 0. Borne temporelle AVANT tout calcul : un starts_at dans le passe
        # ou au-dela de l'horizon (60 j) ne correspond a aucun creneau
        # proposable -- et l'an 9999 leverait un OverflowError (500) dans
        # l'arithmetique de dates ci-dessous.
        if not (now <= cmd.starts_at <= now + DEFAULT_HORIZON):
            raise SlotUnavailableError("Ce creneau n'est plus disponible.")

        # 1. Revalidation : le creneau demande doit ENCORE figurer dans les
        # disponibilites calculees du jour demande (aligne ET libre). Couvre
        # les horaires modifies, absences posees, creneaux non alignes.
        local_day = cmd.starts_at.date()
        slots = await self._availabilities.execute(
            AvailabilityQuery(
                clinic_id=cmd.clinic_id,
                appointment_type_id=cmd.appointment_type_id,
                date_from=local_day - timedelta(days=1),
                date_to=local_day + timedelta(days=1),
            )
        )
        matching = next(
            (s for s in slots if s.resource_id == cmd.resource_id and s.starts_at == cmd.starts_at),
            None,
        )
        if matching is None:
            raise SlotUnavailableError("Ce creneau n'est plus disponible.")

        # 2. Insertion sous UoW TENANT de la clinique cible : la RLS
        # (WITH CHECK) garantit que la ligne porte bien ce clinic_id, et la
        # contrainte EXCLUDE arbitre toute course residuelle (deux clients
        # sur le meme creneau -> un seul commit passe).
        async with self._make_tenant_uow(cmd.clinic_id) as uow:
            if await uow.pet_info.get_owned(cmd.pet_id, cmd.owner_id) is None:
                raise PetNotFoundError("Cet animal n'existe pas dans votre compte.")

            appointment, event = Appointment.book_by_owner(
                clinic_id=cmd.clinic_id,
                resource_id=cmd.resource_id,
                appointment_type_id=cmd.appointment_type_id,
                owner_id=cmd.owner_id,
                pet_id=cmd.pet_id,
                starts_at=matching.starts_at,
                ends_at=matching.ends_at,
                reason=cmd.reason,
                now=now,
            )
            await uow.appointments.add(appointment)
            uow.add_event(event)
            await uow.commit()
            return to_appointment_dto(appointment)


class ListOwnerAppointments:
    def __init__(self, system_uow_factory: SchedulingUoWFactory) -> None:
        self._uow_factory = system_uow_factory

    async def execute(self, owner_id: uuid.UUID) -> list[OwnerAppointmentView]:
        async with self._uow_factory() as uow:
            return await uow.appointments.list_for_owner(owner_id)


class CancelAppointmentByOwner:
    def __init__(self, system_uow_factory: SchedulingUoWFactory, clock: Clock) -> None:
        self._uow_factory = system_uow_factory
        self._clock = clock

    async def execute(self, appointment_id: uuid.UUID, *, owner_id: uuid.UUID) -> AppointmentDto:
        async with self._uow_factory() as uow:
            appointment = await uow.appointments.get_for_owner(appointment_id, owner_id)
            if appointment is None:
                raise AppointmentNotFoundError("Rendez-vous introuvable.")
            # Transitions strictes + regle des 24 h : portees par l'entite.
            event = appointment.cancel_by_owner(cancelled_reason=None, now=self._clock.now())
            await uow.appointments.update(appointment)
            uow.add_event(event)
            await uow.commit()
            return to_appointment_dto(appointment)
