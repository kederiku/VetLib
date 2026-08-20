"""Schémas Pydantic v2 du contexte identity : le contrat HTTP de l'API.

Rôle dans l'architecture : ces classes appartiennent à la couche
presentation et font tampon entre le monde HTTP et la couche application.

- En ENTRÉE (xxxRequest) : FastAPI valide le JSON reçu avant que la route ne
  s'exécute (longueurs, format d'email...) ; une entrée invalide donne un
  422 automatique, le use case ne voit jamais de données malformées.
- En SORTIE (xxxResponse) : le response_model filtre et sérialise ; seuls
  les champs déclarés ici sortent, jamais le hash du mot de passe ni les
  tokens.

Ces schémas alimentent aussi l'OpenAPI, dont Orval génère les types
TypeScript et les hooks TanStack Query des deux frontends : toute évolution
ici doit être suivie de `npm run generate:api` dans frontend-b2c et
frontend-b2b.

On ne réutilise volontairement pas les DTOs de la couche application : le
contrat public (HTTP) et le contrat interne peuvent diverger sans se casser
l'un l'autre (ex : CurrentUser porte un frozenset, l'API expose une liste
triée).
"""

import uuid

from pydantic import BaseModel, EmailStr, Field, SecretStr

from vetolib.identity.application.dto import CurrentUser
from vetolib.identity.domain.value_objects import Role

# Les tokens ne transitent JAMAIS dans un body JSON : cookies HttpOnly uniquement.
# C'est pourquoi aucun schéma de réponse ne contient de champ access/refresh token.


class RegisterClinicRequest(BaseModel):
    """Corps de POST /clinics/register (onboarding d'une clinique)."""

    clinic_name: str = Field(min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    email: EmailStr  # validation syntaxique de l'adresse par Pydantic
    # SecretStr : masqué dans les repr/logs. min_length=12 : la politique de
    # longueur est appliquée dès la frontière HTTP (422 avant tout hachage).
    password: SecretStr = Field(min_length=12)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)


class LoginRequest(BaseModel):
    """Corps de POST /auth/login.

    Pas de min_length sur le password ici : la contrainte ne vaut qu'à la
    création ; au login, toute valeur est comparée au hash (réponse 401
    uniforme, sans indice sur la règle de validation).
    """

    email: EmailStr
    password: SecretStr


class ClinicRegisteredResponse(BaseModel):
    """Réponse 201 de /clinics/register : juste les identifiants créés."""

    clinic_id: uuid.UUID
    user_id: uuid.UUID


class UserResponse(BaseModel):
    """Profil renvoyé par /auth/login, /auth/refresh et /auth/me.

    Le front s'en sert pour afficher l'utilisateur et adapter l'UI selon
    role/permissions (l'autorité reste le backend : cacher un bouton n'est
    pas une protection, require_permission oui).
    """

    id: uuid.UUID
    clinic_id: uuid.UUID
    clinic_name: str
    email: str
    first_name: str
    last_name: str
    role: Role  # enum du domaine : sérialisé en chaîne, listé dans l'OpenAPI
    permissions: list[str]

    @classmethod
    def from_current_user(cls, current: CurrentUser) -> "UserResponse":
        """Convertit le DTO applicatif CurrentUser en schéma de réponse."""
        return cls(
            id=current.id,
            clinic_id=current.clinic_id,
            clinic_name=current.clinic_name,
            email=current.email,
            first_name=current.first_name,
            last_name=current.last_name,
            role=current.role,
            # frozenset -> liste triée : sortie JSON déterministe (tests,
            # caches HTTP et comparaisons côté front stables).
            permissions=sorted(current.permissions),
        )
