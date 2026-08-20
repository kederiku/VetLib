"""Use cases PUBLICS : types actifs d'une clinique et calcul des creneaux.

Flux anonymes (portail B2C, avant meme le login) -> UoW SYSTEME : il n'y a
pas de session tenant pour un anonyme, et le role proprietaire du pool
bypasse la RLS. Le filtre clinic_id EXPLICITE passe a chaque methode
*_for_clinic est donc LA barriere d'isolation de ces lectures -- c'est le
pendant public de la RLS, documente dans domain/repositories.py.
"""

import uuid
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from vetolib.scheduling.application.availability import (
    DEFAULT_HORIZON,
    compute_available_slots,
)
from vetolib.scheduling.application.dto import (
    AppointmentTypeDto,
    AvailabilityQuery,
    AvailableSlot,
)
from vetolib.scheduling.application.ports import SchedulingUoWFactory
from vetolib.scheduling.domain.errors import (
    AppointmentTypeNotFoundError,
    SchedulingClinicNotFoundError,
)
from vetolib.shared.application.clock import Clock
from vetolib.shared.domain.errors import DomainValidationError


class ListClinicAppointmentTypes:
    """Types ACTIFS d'une clinique donnee (etape "motif" du wizard B2C)."""

    def __init__(self, uow_factory: SchedulingUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, clinic_id: uuid.UUID) -> list[AppointmentTypeDto]:
        async with self._uow_factory() as uow:
            if await uow.clinic_info.get_info(clinic_id) is None:
                raise SchedulingClinicNotFoundError("Clinique introuvable.")
            types = await uow.appointment_types.list_active_for_clinic(clinic_id)
            return [
                AppointmentTypeDto(
                    id=t.id,
                    name=t.name,
                    duration_minutes=t.duration_minutes,
                    active=t.active,
                )
                for t in types
            ]


class GetPublicAvailabilities:
    """Charge horaires/absences/RDV actifs puis delegue au service pur.

    C'est l'assemblage IO du calcul : toutes les regles (grille, lead time,
    DST...) vivent dans compute_available_slots, teste sans base.
    """

    def __init__(self, uow_factory: SchedulingUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(self, query: AvailabilityQuery) -> list[AvailableSlot]:
        if query.date_to < query.date_from:
            raise DomainValidationError("La date de fin doit suivre la date de debut.")
        now = self._clock.now()
        async with self._uow_factory() as uow:
            info = await uow.clinic_info.get_info(query.clinic_id)
            if info is None:
                raise SchedulingClinicNotFoundError("Clinique introuvable.")
            appointment_type = await uow.appointment_types.get_active_for_clinic(
                query.clinic_id, query.appointment_type_id
            )
            if appointment_type is None:
                raise AppointmentTypeNotFoundError("Type de rendez-vous introuvable.")

            resources = await uow.resources.list_active_for_clinic(query.clinic_id)
            if not resources:
                return []
            resource_ids = [r.id for r in resources]
            names = {r.id: r.name for r in resources}
            tz = ZoneInfo(info.timezone)

            # CLAMP de la periode demandee a [aujourd'hui local, horizon] :
            # 1. evite l'OverflowError de date.max + 1 jour (une route
            #    publique repondrait 500 sur date_to=9999-12-31) ;
            # 2. borne les requetes SQL (exceptions/busy) a la fenetre que
            #    compute_available_slots exploitera vraiment -- sans clamp,
            #    un anonyme ferait scanner des annees d'historique pour un
            #    resultat vide.
            today_local = now.astimezone(tz).date()
            horizon_local = (now + DEFAULT_HORIZON).astimezone(tz).date()
            date_from = max(query.date_from, today_local)
            date_to = min(query.date_to, horizon_local)
            if date_to < date_from:
                return []

            schedules = await uow.schedules.list_for_clinic_resources(query.clinic_id, resource_ids)
            # Fenetre UTC LARGE couvrant les jours demandes dans la tz de la
            # clinique (une journee locale deborde sur deux jours UTC).
            window_start = datetime.combine(date_from, time.min, tzinfo=tz).astimezone(UTC)
            window_end = datetime.combine(
                date_to + timedelta(days=1), time.min, tzinfo=tz
            ).astimezone(UTC)
            exceptions = await uow.exceptions.list_overlapping(
                query.clinic_id, resource_ids, window_start, window_end
            )
            busy = await uow.appointments.list_busy_between(
                query.clinic_id, resource_ids, window_start, window_end
            )

            slots = compute_available_slots(
                schedules=schedules,
                exceptions=exceptions,
                busy=busy,
                duration_minutes=appointment_type.duration_minutes,
                tz=tz,
                date_from=date_from,
                date_to=date_to,
                now=now,
            )
            return [
                AvailableSlot(
                    resource_id=s.resource_id,
                    resource_name=names[s.resource_id],
                    starts_at=s.starts_at,
                    ends_at=s.ends_at,
                )
                for s in slots
            ]
