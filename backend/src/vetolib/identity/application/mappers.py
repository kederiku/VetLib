"""Mappers domaine -> DTO du contexte identity (couche application).

Traduisent les entités du domaine en projections exposables : la couche
presentation ne manipule ainsi jamais les entités directement. On choisit
explicitement ce qui sort - le hash du mot de passe, par exemple, reste
confiné dans l'entité User et ne traverse jamais cette frontière.
"""

from vetolib.identity.application.dto import (
    ClinicProfile,
    CurrentAdmin,
    CurrentOwner,
    CurrentUser,
)
from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.owner import Owner
from vetolib.identity.domain.platform_admin import PlatformAdmin
from vetolib.identity.domain.user import User


def to_current_user(user: User, clinic_name: str) -> CurrentUser:
    """Aplatit User + nom de la clinique en projection CurrentUser.

    - email : on extrait la str du value object Email, le DTO reste ainsi
      sérialisable tel quel par Pydantic côté presentation ;
    - clinic_name : dénormalisé ici pour éviter aux frontends un second
      appel juste pour afficher le nom de la clinique ;
    - permissions : dérivées du rôle via la matrice ROLE_PERMISSIONS
      (propriété User.permissions), jamais stockées en base.
    """
    return CurrentUser(
        id=user.id,
        clinic_id=user.clinic_id,
        clinic_name=clinic_name,
        email=user.email.value,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        permissions=user.permissions,
    )


def to_current_owner(owner: Owner) -> CurrentOwner:
    """Projette un Owner en CurrentOwner (fiche exposable).

    Le hash du mot de passe reste confiné dans l'entité ; l'adresse et les
    préférences (value objects immuables) traversent tels quels, la couche
    presentation les aplatira en schéma Pydantic.
    """
    return CurrentOwner(
        id=owner.id,
        email=owner.email.value,
        first_name=owner.first_name,
        last_name=owner.last_name,
        phone=owner.phone,
        address=owner.address,
        notification_preferences=owner.notification_preferences,
    )


def to_clinic_profile(clinic: Clinic) -> ClinicProfile:
    """Projette une Clinic en fiche exposable (GET et PUT /clinics/me).

    L'email (value object) est aplati en str ; l'adresse (value object
    immuable) traverse telle quelle, la couche presentation l'aplatira en
    schéma Pydantic (AddressPayload).
    """
    return ClinicProfile(
        id=clinic.id,
        name=clinic.name,
        email=clinic.email.value,
        phone=clinic.phone,
        address=clinic.address,
        timezone=clinic.timezone,
    )


def to_current_admin(admin: PlatformAdmin) -> CurrentAdmin:
    """Projette un PlatformAdmin en CurrentAdmin (fiche exposable).

    Volontairement sans permissions ni role : l'autorisation de l'espace
    plateforme est binaire. On n'expose que de quoi afficher un menu
    utilisateur -- ni l'empreinte du mot de passe, ni last_login_at, dont le
    back-office n'a rien a faire aujourd'hui.
    """
    return CurrentAdmin(
        id=admin.id,
        email=admin.email.value,
        first_name=admin.first_name,
        last_name=admin.last_name,
    )
