"""Entité Owner : le propriétaire d'animaux, compte du portail B2C.

A ne PAS confondre avec User (le personnel d'une clinique) : un Owner est un
compte GLOBAL, sans clinic_id, car un propriétaire consultera potentiellement
plusieurs cliniques. Le rattachement owner <-> clinique se fera plus tard via
les tables tenantées des autres contextes (ses animaux dans patients, ses RDV
dans scheduling), jamais par une clé de tenant sur le compte lui-même. Il n'a
ni rôle ni permissions : sa seule capacité implicite est de gérer son propre
compte et, bientôt, ses animaux.

Un même email peut exister à la fois dans users (staff) et dans owners : les
deux espaces de comptes sont indépendants (un vétérinaire peut aussi être
propriétaire d'un chien, avec deux comptes distincts).
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from vetolib.identity.domain.events import OwnerRegistered
from vetolib.identity.domain.value_objects import (
    Address,
    Email,
    HashedPassword,
    NotificationPreferences,
)
from vetolib.shared.domain.entity import Entity


@dataclass(kw_only=True, eq=False)
class Owner(Entity):
    """Compte propriétaire : identité de connexion + fiche personnelle."""

    email: Email
    hashed_password: HashedPassword
    first_name: str
    last_name: str
    phone: str | None = None
    address: Address | None = None
    # default_factory (et non une instance partagée) : convention dataclass
    # pour tout défaut construit, même immuable — et ruff (RUF009) y veille.
    notification_preferences: NotificationPreferences = field(
        default_factory=NotificationPreferences
    )

    @classmethod
    def register(
        cls,
        *,
        email: Email,
        hashed_password: HashedPassword,
        first_name: str,
        last_name: str,
        phone: str | None,
        now: datetime,
    ) -> tuple["Owner", OwnerRegistered]:
        """Factory d'inscription : crée le compte ET l'événement associé.

        Retourner l'événement avec l'entité (plutot que de le publier ici)
        laisse le use case l'ajouter au UnitOfWork : il partira dans l'outbox
        avec la même transaction que l'INSERT du compte (atomicité).
        """
        owner = cls(
            id=uuid.uuid4(),
            created_at=now,
            email=email,
            hashed_password=hashed_password,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
        )
        event = OwnerRegistered(
            occurred_at=now,
            owner_id=owner.id,
            email=email.value,
            first_name=first_name,
        )
        return owner, event

    def update_profile(
        self,
        *,
        first_name: str,
        last_name: str,
        phone: str | None,
        address: Address | None,
        notification_preferences: NotificationPreferences,
    ) -> None:
        """Met à jour la fiche personnelle.

        Volontairement SANS email ni mot de passe : l'email est l'identifiant
        de connexion (son changement exigera une vérification par lien, flux
        futur), et le mot de passe aura son propre flux sécurisé (saisie de
        l'ancien mot de passe). Les exclure d'ici rend l'oubli impossible.
        """
        self.first_name = first_name
        self.last_name = last_name
        self.phone = phone
        self.address = address
        self.notification_preferences = notification_preferences

    def change_password(self, hashed: HashedPassword) -> None:
        """Remplace l'empreinte (rehash transparent au login)."""
        self.hashed_password = hashed
