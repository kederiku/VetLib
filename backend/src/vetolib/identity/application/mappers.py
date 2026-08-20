"""Mappers domaine -> DTO du contexte identity (couche application).

Traduisent les entités du domaine en projections exposables : la couche
presentation ne manipule ainsi jamais les entités directement. On choisit
explicitement ce qui sort - le hash du mot de passe, par exemple, reste
confiné dans l'entité User et ne traverse jamais cette frontière.
"""

from vetolib.identity.application.dto import CurrentUser
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
