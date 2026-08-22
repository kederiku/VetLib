"""Schemas Pydantic du back-office plateforme (contrat HTTP de /admin/*).

Fichier separe de schemas.py pour la meme raison qu'admin_dependencies.py :
le contrat public de l'espace le plus privilegie doit se lire d'un bloc.

Regle qui vaut ici plus qu'ailleurs : ne sort de l'API que ce qui est declare
dans ces classes. Aucune empreinte de mot de passe, aucun jeton -- les JWT
voyagent exclusivement en cookies HttpOnly (voir cookies.py).
"""

import uuid

from pydantic import BaseModel

from vetolib.identity.application.dto import CurrentAdmin


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
