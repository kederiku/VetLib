"""Use case : mise à jour de la fiche personnelle d'un propriétaire.

L'owner_id vient TOUJOURS de la session (token décodé par la dépendance
CurrentOwnerDep), jamais du body : un propriétaire ne peut modifier que sa
propre fiche. Ni email ni mot de passe ici — l'entité Owner.update_profile
ne les accepte pas, l'oubli est donc impossible par construction.
"""

from vetolib.identity.application.dto import CurrentOwner, UpdateOwnerProfileCommand
from vetolib.identity.application.mappers import to_current_owner
from vetolib.identity.application.ports import IdentityUoWFactory
from vetolib.identity.domain.errors import InvalidTokenError
from vetolib.identity.domain.value_objects import Address, NotificationPreferences


class UpdateOwnerProfile:
    """Applique la fiche recue a l'owner de la session puis la retourne."""

    def __init__(self, uow_factory: IdentityUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, cmd: UpdateOwnerProfileCommand) -> CurrentOwner:
        # Construction du value object Address : validation domaine (ligne 1
        # et ville requises, code postal FR a 5 chiffres). Le schéma Pydantic
        # a déjà impose le "tout ou rien" du trio adresse ; ici c'est la
        # défense en profondeur — une adresse partielle lèverait une
        # DomainValidationError (-> 422).
        address: Address | None = None
        if cmd.address_line1 is not None:
            address = Address(
                line1=cmd.address_line1,
                line2=cmd.address_line2,
                postal_code=cmd.postal_code or "",
                city=cmd.city or "",
                country=cmd.country,
            )

        async with self._uow_factory() as uow:
            owner = await uow.owners.get_by_id(cmd.owner_id)
            if owner is None:
                # La session référence un compte disparu (soft delete entre
                # deux requêtes) : même traitement qu'un token invalide.
                raise InvalidTokenError("Session invalide.")

            owner.update_profile(
                first_name=cmd.first_name,
                last_name=cmd.last_name,
                phone=cmd.phone,
                address=address,
                notification_preferences=NotificationPreferences(
                    email=cmd.notify_email, sms=cmd.notify_sms
                ),
            )
            await uow.owners.update(owner)
            await uow.commit()
            return to_current_owner(owner)
