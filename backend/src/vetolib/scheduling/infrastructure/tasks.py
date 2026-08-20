"""Taches TaskIQ et handlers outbox du contexte scheduling.

Gabarit identity/infrastructure/tasks.py : chaque evenement domaine ecrit
dans l'outbox est route vers une tache de demonstration (log uniquement --
demain : emails/SMS de confirmation et de rappel via le scheduler TaskIQ).
Idempotentes par nature (relais outbox = at-least-once).
"""

from typing import Any

import structlog

from vetolib.shared.infrastructure.outbox.registry import register_outbox_handler
from vetolib.shared.infrastructure.taskiq.broker import broker

logger = structlog.get_logger(__name__)


@broker.task(task_name="scheduling.notify_appointment_booked")
async def notify_appointment_booked(
    appointment_id: str, clinic_id: str, owner_id: str, starts_at: str
) -> None:
    """Demo : previent la clinique qu'une demande en ligne attend confirmation."""
    logger.info(
        "appointment_booked_notified",
        appointment_id=appointment_id,
        clinic_id=clinic_id,
        owner_id=owner_id,
        starts_at=starts_at,
    )


@broker.task(task_name="scheduling.notify_appointment_confirmed")
async def notify_appointment_confirmed(
    appointment_id: str, clinic_id: str, owner_id: str | None, starts_at: str
) -> None:
    """Demo : confirme le rendez-vous au proprietaire (email/SMS plus tard)."""
    logger.info(
        "appointment_confirmed_notified",
        appointment_id=appointment_id,
        clinic_id=clinic_id,
        owner_id=owner_id,
        starts_at=starts_at,
    )


@broker.task(task_name="scheduling.notify_appointment_cancelled")
async def notify_appointment_cancelled(
    appointment_id: str, clinic_id: str, owner_id: str | None, cancelled_by: str
) -> None:
    """Demo : informe l'autre partie de l'annulation."""
    logger.info(
        "appointment_cancelled_notified",
        appointment_id=appointment_id,
        clinic_id=clinic_id,
        owner_id=owner_id,
        cancelled_by=cancelled_by,
    )


async def _handle_appointment_booked(payload: dict[str, Any]) -> None:
    await notify_appointment_booked.kiq(
        appointment_id=str(payload["appointment_id"]),
        clinic_id=str(payload["clinic_id"]),
        owner_id=str(payload["owner_id"]),
        starts_at=str(payload["starts_at"]),
    )


async def _handle_appointment_confirmed(payload: dict[str, Any]) -> None:
    owner_id = payload.get("owner_id")
    await notify_appointment_confirmed.kiq(
        appointment_id=str(payload["appointment_id"]),
        clinic_id=str(payload["clinic_id"]),
        owner_id=str(owner_id) if owner_id else None,
        starts_at=str(payload["starts_at"]),
    )


async def _handle_appointment_cancelled(payload: dict[str, Any]) -> None:
    owner_id = payload.get("owner_id")
    await notify_appointment_cancelled.kiq(
        appointment_id=str(payload["appointment_id"]),
        clinic_id=str(payload["clinic_id"]),
        owner_id=str(owner_id) if owner_id else None,
        cancelled_by=str(payload["cancelled_by"]),
    )


# Effet de bord d'import volontaire (module importe par vetolib.worker) :
# associe chaque event_type a son handler dans le registre du relais outbox.
register_outbox_handler("scheduling.appointment_booked", _handle_appointment_booked)
register_outbox_handler("scheduling.appointment_confirmed", _handle_appointment_confirmed)
register_outbox_handler("scheduling.appointment_cancelled", _handle_appointment_cancelled)
