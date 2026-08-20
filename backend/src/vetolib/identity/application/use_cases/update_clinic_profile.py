"""Use case : mise a jour de la fiche de la clinique (PUT /clinics/me).

Le clinic_id vient TOUJOURS du token de la session staff, jamais du body :
un manager ne modifie que SA clinique (la route exige en plus la permission
clinic:manage). L'email n'est pas modifiable ici -- identifiant
d'inscription, l'entite Clinic.update_profile ne l'accepte pas, l'oubli est
donc impossible par construction.

UoW systeme, comme GetClinicProfile : la table clinics (les tenants
eux-memes) est hors RLS, l'acces par PK = cid du token suffit.
"""

from vetolib.identity.application.dto import ClinicProfile, UpdateClinicProfileCommand
from vetolib.identity.application.mappers import to_clinic_profile
from vetolib.identity.application.ports import IdentityUoWFactory
from vetolib.identity.domain.errors import ClinicNotFoundError
from vetolib.identity.domain.value_objects import Address, Timezone


class UpdateClinicProfile:
    """Applique la fiche recue a la clinique de la session puis la retourne."""

    def __init__(self, uow_factory: IdentityUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, cmd: UpdateClinicProfileCommand) -> ClinicProfile:
        # Construction des value objects AVANT d'ouvrir la transaction : une
        # entree invalide echoue sans toucher a la base.
        #
        # Address : tout-ou-rien, comme UpdateOwnerProfile. Le schema Pydantic
        # a deja impose la completude du bloc adresse ; ici c'est la defense
        # en profondeur -- une adresse partielle (postal_code ou city
        # manquants, remplaces par "") leverait une DomainValidationError
        # (-> 422), jamais une demi-adresse en base.
        address: Address | None = None
        if cmd.address_line1 is not None:
            address = Address(
                line1=cmd.address_line1,
                line2=cmd.address_line2,
                postal_code=cmd.postal_code or "",
                city=cmd.city or "",
                country=cmd.country,
            )
        # Timezone : valide l'identifiant IANA via zoneinfo ("Mars/Olympus"
        # -> DomainValidationError -> 422).
        timezone = Timezone(cmd.timezone)

        async with self._uow_factory() as uow:
            clinic = await uow.clinics.get_by_id(cmd.clinic_id)
            if clinic is None:
                # Le token reference une clinique disparue (soft delete entre
                # deux requetes) : 404, comme en lecture.
                raise ClinicNotFoundError("Clinique introuvable.")

            clinic.update_profile(
                name=cmd.name, phone=cmd.phone, address=address, timezone=timezone
            )
            await uow.clinics.update(clinic)
            await uow.commit()
            return to_clinic_profile(clinic)
