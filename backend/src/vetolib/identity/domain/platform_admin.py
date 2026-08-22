"""Entite PlatformAdmin : un fondateur de la plateforme (back-office).

Couche domain du contexte identity. C'est le TROISIEME espace de comptes du
produit, et le plus puissant : contrairement a User (le personnel d'une
clinique) et a Owner (un proprietaire d'animaux), un PlatformAdmin
n'appartient a AUCUNE clinique et voit le parc entier.

Trois consequences directes, toutes visibles dans cette classe :

1. Pas de clinic_id, donc pas de Row-Level Security possible (il n'existe
   aucune colonne sur laquelle une policy pourrait filtrer). La protection
   de la table passe par les PRIVILEGES PostgreSQL : le role applicatif
   vetolib_app n'a aucun droit dessus (voir la migration 0008).
2. Pas de role ni de permissions : l'autorisation est BINAIRE (on est
   fondateur, ou on ne l'est pas). Une matrice de permissions sur une
   population de trois personnes serait une ceremonie inutile ; la porte de
   sortie, le jour ou un role "support" en lecture seule apparaitrait, est
   decrite dans la docstring de PyJWTPlatformAdminTokenProvider.
3. Aucune inscription publique : les comptes sont crees par une commande
   locale (make create-admin), jamais par une route HTTP. D'ou l'absence
   d'evenement de domaine a la creation -- il n'y a personne a prevenir.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from vetolib.identity.domain.value_objects import Email, HashedPassword
from vetolib.shared.domain.entity import Entity


@dataclass(kw_only=True, eq=False)
class PlatformAdmin(Entity):
    """Compte fondateur : une identite de connexion, rien de plus."""

    email: Email
    hashed_password: HashedPassword
    first_name: str
    last_name: str
    # Seul levier de revocation d'un acces : il n'y a pas d'inscription, donc
    # pas de "je supprime et je recree". Un fondateur qui quitte le projet
    # perd son acces sans que sa ligne disparaisse -- le futur journal
    # d'audit la referencera par cle etrangere.
    is_active: bool = True
    # Indicateur bon marche d'un compte dormant (donc a desactiver) ou d'une
    # connexion anormale. Un UPDATE par login est sans effet sur une table de
    # trois lignes ; la meme colonne sur users ou owners ajouterait une
    # ecriture a chaque connexion de tout le parc -- a ne pas faire.
    last_login_at: datetime | None = None

    @classmethod
    def create(
        cls,
        *,
        email: Email,
        hashed_password: HashedPassword,
        first_name: str,
        last_name: str,
        now: datetime,
    ) -> "PlatformAdmin":
        """Factory de creation, SANS evenement de domaine.

        Contrairement a Clinic.register ou Owner.register, aucun effet de
        bord n'aurait de sens : le compte est cree par une commande locale
        lancee par la personne elle-meme, il n'y a ni email de bienvenue a
        envoyer ni tiers a notifier.
        """
        return cls(
            id=uuid.uuid4(),
            created_at=now,
            email=email,
            hashed_password=hashed_password,
            first_name=first_name,
            last_name=last_name,
        )

    def record_login(self, now: datetime) -> None:
        """Horodate la derniere connexion reussie."""
        self.last_login_at = now

    def change_password(self, hashed: HashedPassword) -> None:
        """Remplace l'empreinte (rehash transparent au login, ou reinitialisation)."""
        self.hashed_password = hashed

    def deactivate(self) -> None:
        """Revoque l'acces sans supprimer la ligne (idempotent)."""
        self.is_active = False

    def activate(self) -> None:
        """Retablit un acces revoque (idempotent)."""
        self.is_active = True
