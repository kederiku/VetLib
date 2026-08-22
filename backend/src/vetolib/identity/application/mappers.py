"""Mappers domaine -> DTO du contexte identity (couche application).

Traduisent les entités du domaine en projections exposables : la couche
presentation ne manipule ainsi jamais les entités directement. On choisit
explicitement ce qui sort - le hash du mot de passe, par exemple, reste
confiné dans l'entité User et ne traverse jamais cette frontière.
"""

from vetolib.identity.application.dto import (
    AdminClinicDetail,
    AdminClinicRow,
    AdminOwnerDetail,
    AdminOwnerRow,
    AdminStaffRow,
    ClinicProfile,
    CurrentAdmin,
    CurrentOwner,
    CurrentUser,
)
from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.owner import Owner
from vetolib.identity.domain.platform_admin import PlatformAdmin
from vetolib.identity.domain.repositories import ClinicRow, OwnerRow, StaffRow
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


# --- Projections du back-office plateforme -----------------------------------


def to_admin_clinic_row(ligne: ClinicRow) -> AdminClinicRow:
    """Projette une ligne de liste de cliniques.

    La ville est extraite de l'adresse : la liste l'affiche en colonne, mais
    n'a aucun besoin du reste de l'adresse. Transporter cent adresses
    completes pour n'en afficher que la ville serait du gaspillage -- et
    exposerait des donnees dont l'ecran n'a pas l'usage.
    """
    clinique = ligne.clinic
    return AdminClinicRow(
        id=clinique.id,
        name=clinique.name,
        email=clinique.email.value,
        phone=clinique.phone,
        city=clinique.address.city if clinique.address is not None else None,
        is_active=clinique.is_active,
        staff_count=ligne.staff_count,
        created_at=clinique.created_at,
    )


def to_admin_clinic_detail(clinique: Clinic, staff_count: int) -> AdminClinicDetail:
    """Projette la fiche complete d'une clinique (adresse et fuseau compris)."""
    return AdminClinicDetail(
        id=clinique.id,
        name=clinique.name,
        email=clinique.email.value,
        phone=clinique.phone,
        address=clinique.address,
        timezone=clinique.timezone,
        is_active=clinique.is_active,
        staff_count=staff_count,
        created_at=clinique.created_at,
    )


def to_admin_owner_row(ligne: OwnerRow) -> AdminOwnerRow:
    """Projette une ligne de liste de proprietaires."""
    proprietaire = ligne.owner
    return AdminOwnerRow(
        id=proprietaire.id,
        email=proprietaire.email.value,
        first_name=proprietaire.first_name,
        last_name=proprietaire.last_name,
        phone=proprietaire.phone,
        city=proprietaire.address.city if proprietaire.address is not None else None,
        is_active=proprietaire.is_active,
        pet_count=ligne.pet_count,
        created_at=proprietaire.created_at,
    )


def to_admin_owner_detail(proprietaire: Owner, pet_count: int) -> AdminOwnerDetail:
    """Projette la fiche complete d'un proprietaire.

    Sans l'empreinte du mot de passe, evidemment : elle reste confinee dans
    l'entite et ne traverse jamais cette frontiere.
    """
    return AdminOwnerDetail(
        id=proprietaire.id,
        email=proprietaire.email.value,
        first_name=proprietaire.first_name,
        last_name=proprietaire.last_name,
        phone=proprietaire.phone,
        address=proprietaire.address,
        notification_preferences=proprietaire.notification_preferences,
        is_active=proprietaire.is_active,
        pet_count=pet_count,
        created_at=proprietaire.created_at,
    )


def to_admin_staff_row(ligne: StaffRow) -> AdminStaffRow:
    """Projette une ligne de la liste transverse du personnel.

    Conversion quasi a l'identique : StaffRow est deja une projection de
    lecture cote domaine. Le passage par un DTO d'application garde malgre
    tout la couche presentation a distance du domaine -- le jour ou l'ecran
    demandera un champ calcule, il se posera ici et nulle part ailleurs.
    """
    return AdminStaffRow(
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
