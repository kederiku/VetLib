"""Erreurs domaine du contexte scheduling, avec codes machine stables.

Meme mecanique qu'identity : chaque erreur herite d'une famille partagee
(ConflictError -> 409, EntityNotFoundError -> 404 par defaut) et porte un
code que les frontends utilisent pour afficher le bon message. Le mapping
HTTP explicite du contexte vit dans presentation/router.py.
"""

from vetolib.shared.domain.errors import ConflictError, EntityNotFoundError


class SlotAlreadyBookedError(ConflictError):
    """Deux rendez-vous actifs se chevauchent sur la meme ressource.

    Levee par la traduction de la contrainte EXCLUDE (ex_appointments_no_overlap)
    au commit : c'est PostgreSQL qui arbitre la course entre deux reservations
    simultanees, jamais un SELECT prealable.
    """

    code = "scheduling.slot_already_booked"


class SlotUnavailableError(ConflictError):
    """Le creneau demande ne correspond plus a une disponibilite calculee.

    Cas typique : l'horaire du praticien a change, une absence a ete posee,
    ou le creneau demande n'est pas aligne sur la grille. Distinct de
    SlotAlreadyBookedError (course perdue face a un autre client).
    """

    code = "scheduling.slot_unavailable"


class InvalidAppointmentTransitionError(ConflictError):
    """Transition d'etat interdite (ex : confirmer un rendez-vous annule)."""

    code = "scheduling.invalid_transition"


class CancellationTooLateError(ConflictError):
    """Annulation par le proprietaire a moins de 24 h du rendez-vous."""

    code = "scheduling.cancellation_too_late"


class ResourceNotFoundError(EntityNotFoundError):
    code = "scheduling.resource_not_found"


class AppointmentTypeNotFoundError(EntityNotFoundError):
    code = "scheduling.appointment_type_not_found"


class AppointmentNotFoundError(EntityNotFoundError):
    code = "scheduling.appointment_not_found"


class SchedulingClinicNotFoundError(EntityNotFoundError):
    """Clinique inconnue dans un flux public (annuaire, disponibilites).

    Erreur PROPRE au contexte scheduling : on n'importe pas les erreurs du
    domaine identity (contextes decouples), meme si la notion se recoupe.
    """

    code = "scheduling.clinic_not_found"
