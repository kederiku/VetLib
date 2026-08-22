"""Entité User : un membre du personnel d'une clinique (ASV, vétérinaire, gérant).

Couche domain du contexte identity : dataclass pure, aucun import de
framework. Un User appartient toujours à une clinique (clinic_id) : c'est la
clé d'isolation multi-tenant que les politiques RLS PostgreSQL appliquent.

Le domaine ne manipule JAMAIS de mot de passe en clair : il ne connaît que
HashedPassword, l'empreinte produite par l'adapter Argon2 (infrastructure)
via le port PasswordHasher de la couche application.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from vetolib.identity.domain.value_objects import (
    ROLE_PERMISSIONS,
    Email,
    HashedPassword,
    Role,
)
from vetolib.shared.domain.entity import Entity


# kw_only : appels avec arguments nommés obligatoires ; eq=False : égalité par
# id héritée d'Entity (deux objets User sont "le même" si leurs id sont égaux).
@dataclass(kw_only=True, eq=False)
class User(Entity):
    """Utilisateur B2B rattaché à une clinique (tenant).

    Hérite d'Entity : id UUID, created_at, deleted_at (soft delete).
    `is_active` est distinct de `deleted_at` : un compte désactivé existe
    toujours (audit, historique des actes) mais ne peut plus se connecter.
    """

    clinic_id: uuid.UUID  # tenant propriétaire : clé de l'isolation RLS
    email: Email  # identifiant de connexion ; value object déjà validé/normalisé
    hashed_password: HashedPassword  # empreinte Argon2, jamais le mot de passe en clair
    first_name: str
    last_name: str
    role: Role  # détermine les permissions via la matrice ROLE_PERMISSIONS
    is_active: bool = True

    @classmethod
    def create(
        cls,
        *,
        clinic_id: uuid.UUID,
        email: Email,
        hashed_password: HashedPassword,
        first_name: str,
        last_name: str,
        role: Role,
        now: datetime,
    ) -> "User":
        """Factory method : construit un utilisateur valide et complet.

        Même logique que Clinic.register : l'id UUID est généré côté domaine
        (pas par la base) et `now` est injecté via le port Clock pour rester
        déterministe en test. Le hachage du mot de passe a eu lieu EN AMONT,
        dans le use case (port PasswordHasher) : le domaine ne reçoit que
        l'empreinte, jamais le secret.
        """
        return cls(
            id=uuid.uuid4(),
            created_at=now,
            clinic_id=clinic_id,
            email=email,
            hashed_password=hashed_password,
            first_name=first_name,
            last_name=last_name,
            role=role,
        )

    @property
    def permissions(self) -> frozenset[str]:
        """Permissions effectives, dérivées du rôle (jamais stockées en base).

        La matrice ROLE_PERMISSIONS est la seule source de vérité : modifier
        les droits d'un rôle ne demande aucune migration de données. Ces
        permissions sont embarquées dans l'access token JWT ("fat token").
        """
        return ROLE_PERMISSIONS[self.role]

    def can(self, permission: str) -> bool:
        """Test d'autorisation métier, ex : user.can("medical_record:read")."""
        return permission in self.permissions

    def change_password(self, hashed: HashedPassword) -> None:
        """Remplace l'empreinte ; le nouveau hash est calculé hors du domaine."""
        self.hashed_password = hashed

    def deactivate(self) -> None:
        """Bloque la connexion sans supprimer le compte (distinct du soft delete)."""
        self.is_active = False

    def activate(self) -> None:
        """Retablit un acces bloque (idempotent : reactiver un compte actif
        ne fait rien et ne leve pas)."""
        self.is_active = True

    def change_role(self, role: Role) -> None:
        """Change le role, donc les permissions derivees.

        Attention a l'effet differe : les permissions sont embarquees dans le
        jeton d'acces (fat token). Le nouveau role ne s'applique donc a
        l'interesse qu'au PROCHAIN jeton, dans quinze minutes au plus. C'est
        la contrepartie assumee du fat token -- l'interface doit le dire,
        sinon le changement passera pour sans effet.
        """
        self.role = role
