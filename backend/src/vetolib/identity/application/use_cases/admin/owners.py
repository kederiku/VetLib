"""Use cases d'ECRITURE du back-office sur les comptes proprietaires.

Trois operations : consulter une fiche, la mettre a jour, et activer ou
desactiver le compte.

Ce que ces use cases ne font PAS, et ne doivent pas faire :

- changer l'email. C'est l'identifiant de connexion ; qu'un administrateur
  puisse le remplacer d'un clic serait une prise de controle de compte en un
  geste, pas une correction de fiche. La regle est deja portee par
  Owner.update_profile, qui n'accepte pas ce champ ;
- toucher au mot de passe. Il n'existe aucun flux de reinitialisation, et en
  inventer un ici -- qui donnerait a un exploitant le moyen d'entrer dans le
  compte d'un client -- serait exactement ce qu'il ne faut pas construire ;
- supprimer quoi que ce soit. Desactiver n'efface ni les animaux ni les
  rendez-vous : les cliniques continuent de les voir, un historique medical
  ne disparait pas parce qu'un compte est ferme.
"""

import uuid

from vetolib.identity.application.dto import (
    AdminActor,
    AdminOwnerDetail,
    AdminUpdateOwnerCommand,
)
from vetolib.identity.application.mappers import to_admin_owner_detail
from vetolib.identity.application.ports import IdentityUnitOfWork, IdentityUoWFactory
from vetolib.identity.application.use_cases.admin.clinics import _adresse, _tracer
from vetolib.identity.domain.admin_audit import AuditAction, AuditTargetType
from vetolib.identity.domain.errors import OwnerNotFoundError
from vetolib.identity.domain.owner import Owner
from vetolib.identity.domain.value_objects import NotificationPreferences
from vetolib.shared.application.clock import Clock


async def _nombre_d_animaux(uow: IdentityUnitOfWork, proprietaire: Owner) -> int:
    """Compte les animaux d'un proprietaire pour la fiche.

    Passe par la recherche transverse filtree sur l'email exact : l'adresse
    etant unique parmi les comptes vivants (index unique partiel), le
    resultat est sans ambiguite. C'est un detour assume plutot qu'une
    methode de port supplementaire pour un seul appelant.
    """
    from vetolib.identity.domain.repositories import OwnerSearchCriteria

    page = await uow.directory.search_owners(
        OwnerSearchCriteria(search=proprietaire.email.value, limit=1, offset=0)
    )
    return page.items[0].pet_count if page.items else 0


class GetAdminOwner:
    """Fiche complete d'un proprietaire."""

    def __init__(self, uow_factory: IdentityUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, owner_id: uuid.UUID) -> AdminOwnerDetail:
        async with self._uow_factory() as uow:
            proprietaire = await uow.owners.get_by_id(owner_id)
            if proprietaire is None:
                raise OwnerNotFoundError("Propriétaire introuvable.")
            return to_admin_owner_detail(proprietaire, await _nombre_d_animaux(uow, proprietaire))


class UpdateAdminOwner:
    """Met a jour la fiche d'un proprietaire. Sans email ni mot de passe."""

    def __init__(self, uow_factory: IdentityUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(self, cmd: AdminUpdateOwnerCommand, actor: AdminActor) -> AdminOwnerDetail:
        adresse = _adresse(
            cmd.address_line1, cmd.address_line2, cmd.postal_code, cmd.city, cmd.country
        )
        async with self._uow_factory() as uow:
            proprietaire = await uow.owners.get_by_id(cmd.owner_id)
            if proprietaire is None:
                raise OwnerNotFoundError("Propriétaire introuvable.")

            proprietaire.update_profile(
                first_name=cmd.first_name,
                last_name=cmd.last_name,
                phone=cmd.phone,
                address=adresse,
                notification_preferences=NotificationPreferences(
                    email=cmd.notify_email, sms=cmd.notify_sms
                ),
            )
            await uow.owners.update(proprietaire)
            await _tracer(
                uow,
                actor=actor,
                action=AuditAction.OWNER_UPDATED,
                target_type=AuditTargetType.OWNER,
                target_id=proprietaire.id,
                now=self._clock.now(),
            )
            await uow.commit()
            return to_admin_owner_detail(proprietaire, await _nombre_d_animaux(uow, proprietaire))


class SetAdminOwnerStatus:
    """Active ou desactive un compte proprietaire. IDEMPOTENT.

    L'idempotence est portee par l'entite (deactivate/reactivate renvoient
    None quand rien ne change) : un double-clic ne produit ni erreur, ni
    evenement, ni ligne d'audit.
    """

    def __init__(self, uow_factory: IdentityUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(
        self, owner_id: uuid.UUID, *, active: bool, actor: AdminActor
    ) -> AdminOwnerDetail:
        now = self._clock.now()
        async with self._uow_factory() as uow:
            proprietaire = await uow.owners.get_by_id(owner_id)
            if proprietaire is None:
                raise OwnerNotFoundError("Propriétaire introuvable.")

            evenement = proprietaire.reactivate(now) if active else proprietaire.deactivate(now)
            if evenement is not None:
                await uow.owners.update(proprietaire)
                uow.add_event(evenement)
                await _tracer(
                    uow,
                    actor=actor,
                    action=(
                        AuditAction.OWNER_REACTIVATED if active else AuditAction.OWNER_DEACTIVATED
                    ),
                    target_type=AuditTargetType.OWNER,
                    target_id=proprietaire.id,
                    now=now,
                )
                await uow.commit()

            return to_admin_owner_detail(proprietaire, await _nombre_d_animaux(uow, proprietaire))
