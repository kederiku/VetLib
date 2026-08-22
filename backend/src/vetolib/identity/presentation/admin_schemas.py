"""Schemas Pydantic du back-office plateforme (contrat HTTP de /admin/*).

Fichier separe de schemas.py pour la meme raison qu'admin_dependencies.py :
le contrat public de l'espace le plus privilegie doit se lire d'un bloc.

Regle qui vaut ici plus qu'ailleurs : ne sort de l'API que ce qui est declare
dans ces classes. Aucune empreinte de mot de passe, aucun jeton -- les JWT
voyagent exclusivement en cookies HttpOnly (voir cookies.py).
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from vetolib.identity.application.dto import (
    AdminClinicDetail,
    AdminClinicRow,
    AdminOwnerDetail,
    AdminOwnerRow,
    AdminStaffCreated,
    AdminStaffRow,
    CurrentAdmin,
)
from vetolib.identity.domain.repositories import PlatformStats
from vetolib.identity.domain.value_objects import Address, Role
from vetolib.identity.presentation.schemas import (
    AddressPayload,
    NotificationPreferencesPayload,
)
from vetolib.shared.presentation.pagination import PageResponse


class AdminResponse(BaseModel):
    """Profil du super-admin connecte (login, refresh et /admin/auth/me).

    Volontairement maigre : ni permissions, ni role, ni date de derniere
    connexion. L'autorisation de cet espace est binaire, et le front n'a
    besoin que de quoi afficher un menu utilisateur.
    """

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str

    @classmethod
    def from_current_admin(cls, current: CurrentAdmin) -> "AdminResponse":
        return cls(
            id=current.id,
            email=current.email,
            first_name=current.first_name,
            last_name=current.last_name,
        )


# --- Enveloppes paginees, une sous-classe NOMMEE par ressource ---------------
# Voir shared/presentation/pagination.py : le generique parametre produirait
# des noms de schema illisibles dans l'OpenAPI (PageResponse_AdminClinicRow_)
# et donc dans les trois clients generes.


class AdminClinicSummary(BaseModel):
    """Une ligne de la liste des cliniques."""

    id: uuid.UUID
    name: str
    email: str
    phone: str | None
    city: str | None
    is_active: bool
    staff_count: int = Field(
        description="Nombre de comptes du personnel ACTIFS dans cette clinique."
    )
    created_at: datetime

    @classmethod
    def from_dto(cls, ligne: AdminClinicRow) -> "AdminClinicSummary":
        return cls(
            id=ligne.id,
            name=ligne.name,
            email=ligne.email,
            phone=ligne.phone,
            city=ligne.city,
            is_active=ligne.is_active,
            staff_count=ligne.staff_count,
            created_at=ligne.created_at,
        )


class AdminClinicPage(PageResponse[AdminClinicSummary]):
    """Une page de la liste des cliniques."""


class AdminClinicResponse(BaseModel):
    """Fiche complete d'une clinique (adresse et fuseau compris)."""

    id: uuid.UUID
    name: str
    email: str
    phone: str | None
    address: AddressPayload | None
    timezone: str
    is_active: bool
    staff_count: int
    created_at: datetime

    @classmethod
    def from_dto(cls, fiche: AdminClinicDetail) -> "AdminClinicResponse":
        return cls(
            id=fiche.id,
            name=fiche.name,
            email=fiche.email,
            phone=fiche.phone,
            address=_adresse_payload(fiche.address),
            timezone=fiche.timezone,
            is_active=fiche.is_active,
            staff_count=fiche.staff_count,
            created_at=fiche.created_at,
        )


class AdminOwnerSummary(BaseModel):
    """Une ligne de la liste des proprietaires."""

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    phone: str | None
    city: str | None
    is_active: bool
    pet_count: int
    created_at: datetime

    @classmethod
    def from_dto(cls, ligne: AdminOwnerRow) -> "AdminOwnerSummary":
        return cls(
            id=ligne.id,
            email=ligne.email,
            first_name=ligne.first_name,
            last_name=ligne.last_name,
            phone=ligne.phone,
            city=ligne.city,
            is_active=ligne.is_active,
            pet_count=ligne.pet_count,
            created_at=ligne.created_at,
        )


class AdminOwnerPage(PageResponse[AdminOwnerSummary]):
    """Une page de la liste des proprietaires."""


class AdminOwnerResponse(BaseModel):
    """Fiche complete d'un proprietaire."""

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    phone: str | None
    address: AddressPayload | None
    notification_preferences: NotificationPreferencesPayload
    is_active: bool
    pet_count: int
    created_at: datetime

    @classmethod
    def from_dto(cls, fiche: AdminOwnerDetail) -> "AdminOwnerResponse":
        return cls(
            id=fiche.id,
            email=fiche.email,
            first_name=fiche.first_name,
            last_name=fiche.last_name,
            phone=fiche.phone,
            address=_adresse_payload(fiche.address),
            notification_preferences=NotificationPreferencesPayload(
                email=fiche.notification_preferences.email,
                sms=fiche.notification_preferences.sms,
            ),
            is_active=fiche.is_active,
            pet_count=fiche.pet_count,
            created_at=fiche.created_at,
        )


class AdminStaffSummary(BaseModel):
    """Une ligne de la liste transverse du personnel."""

    id: uuid.UUID
    clinic_id: uuid.UUID
    clinic_name: str
    clinic_is_active: bool = Field(
        description="False si la clinique elle-meme est suspendue : ce compte ne "
        "peut alors pas se connecter, quel que soit son propre statut."
    )
    email: str
    first_name: str
    last_name: str
    role: Role
    is_active: bool
    created_at: datetime

    @classmethod
    def from_dto(cls, ligne: AdminStaffRow) -> "AdminStaffSummary":
        return cls(
            id=ligne.id,
            clinic_id=ligne.clinic_id,
            clinic_name=ligne.clinic_name,
            clinic_is_active=ligne.clinic_is_active,
            email=ligne.email,
            first_name=ligne.first_name,
            last_name=ligne.last_name,
            role=ligne.role,
            is_active=ligne.is_active,
            created_at=ligne.created_at,
        )


class AdminStaffPage(PageResponse[AdminStaffSummary]):
    """Une page de la liste du personnel."""


# --- Corps de requete --------------------------------------------------------


class AdminManagerPayload(BaseModel):
    """Le premier gerant d'une clinique, a la creation. Bloc OPTIONNEL.

    Pas de champ mot de passe, et c'est le point : il est GENERE par le
    backend et renvoye une seule fois. Voir AdminStaffCreatedResponse.
    """

    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)


class AdminCreateClinicRequest(BaseModel):
    """Corps de POST /admin/clinics.

    `manager` absent = on cree la clinique seule, et les gerants arriveront
    par POST /admin/clinics/{id}/staff. Un seul endpoint couvre les deux
    flux, ce qui evite d'avoir a choisir entre "creer" et "creer avec".
    """

    name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=30)
    address: AddressPayload | None = None
    timezone: str = Field(default="Europe/Paris")
    manager: AdminManagerPayload | None = None


class AdminUpdateClinicRequest(BaseModel):
    """Corps de PUT /admin/clinics/{id}.

    Volontairement SANS email : c'est l'identifiant d'inscription de la
    clinique. Qu'un administrateur puisse le changer d'un clic serait une
    prise de controle en un geste. L'exclure du schema rend l'oubli
    impossible par construction, exactement comme cote domaine.
    """

    name: str = Field(min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    address: AddressPayload | None = None
    timezone: str = Field(default="Europe/Paris")


class AdminCreateStaffRequest(BaseModel):
    """Corps de POST /admin/clinics/{id}/staff."""

    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    role: Role = Field(default=Role.MANAGER)


class AdminStaffCreatedResponse(BaseModel):
    """201 de la creation d'un compte du personnel.

    ATTENTION -- `temporary_password` est le SEUL moment ou ce secret est
    lisible. Il n'est stocke nulle part en clair, ne figure dans aucun
    journal, n'apparait pas dans l'audit, et aucune route ne permet de le
    relire. Le front doit l'afficher dans un dialogue avec un bouton
    "copier" et un avertissement explicite.

    Oui, cela fait transiter un secret dans un corps JSON, ce que la
    convention du projet interdit -- pour les JETONS. Ce n'en est pas un :
    c'est un identifiant que l'administrateur doit lire et transmettre, et il
    n'existe aujourd'hui aucun autre canal (l'envoi d'email n'est pas
    branche). Decision assumee, pas oubli.
    """

    user_id: uuid.UUID
    email: str
    role: Role
    temporary_password: str = Field(
        description="Mot de passe genere, affiche UNE SEULE FOIS. Non re-consultable."
    )

    @classmethod
    def from_dto(cls, cree: AdminStaffCreated) -> "AdminStaffCreatedResponse":
        return cls(
            user_id=cree.user_id,
            email=cree.email,
            role=cree.role,
            temporary_password=cree.temporary_password,
        )


class AdminClinicCreatedResponse(BaseModel):
    """201 de la creation d'une clinique, avec son gerant s'il a ete demande."""

    clinic: AdminClinicResponse
    manager: AdminStaffCreatedResponse | None


class AdminChangeRoleRequest(BaseModel):
    """Corps de PUT /admin/staff/{id}/role."""

    role: Role


class AdminUpdateOwnerRequest(BaseModel):
    """Corps de PUT /admin/owners/{id}.

    Sans email ni mot de passe, pour les memes raisons que la fiche clinique
    -- et une de plus : donner a un exploitant le moyen de changer le mot de
    passe d'un client serait lui donner le moyen d'entrer dans son compte.
    """

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=30)
    address: AddressPayload | None = None
    notification_preferences: NotificationPreferencesPayload = Field(
        default_factory=NotificationPreferencesPayload
    )


class AdminStatsResponse(BaseModel):
    """Compteurs du tableau de bord du back-office."""

    active_clinics: int
    suspended_clinics: int
    active_owners: int
    inactive_owners: int
    active_staff: int
    inactive_staff: int

    @classmethod
    def from_dto(cls, stats: PlatformStats) -> "AdminStatsResponse":
        return cls(
            active_clinics=stats.active_clinics,
            suspended_clinics=stats.suspended_clinics,
            active_owners=stats.active_owners,
            inactive_owners=stats.inactive_owners,
            active_staff=stats.active_staff,
            inactive_staff=stats.inactive_staff,
        )


def _adresse_payload(adresse: Address | None) -> AddressPayload | None:
    """Aplatit le value object Address en schema, ou None."""
    if adresse is None:
        return None
    return AddressPayload(
        line1=adresse.line1,
        line2=adresse.line2,
        postal_code=adresse.postal_code,
        city=adresse.city,
        country=adresse.country,
    )
