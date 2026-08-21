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

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator
from pydantic_core import PydanticCustomError

from vetolib.identity.application.dto import (
    ClinicProfile,
    CurrentOwner,
    CurrentUser,
    PublicClinic,
)
from vetolib.identity.domain.value_objects import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    PlainPassword,
    Role,
)
from vetolib.shared.domain.errors import DomainValidationError

# Les tokens ne transitent JAMAIS dans un body JSON : cookies HttpOnly uniquement.
# C'est pourquoi aucun schéma de réponse ne contient de champ access/refresh token.

# Texte affiché dans l'OpenAPI (donc dans la page de référence de l'API et dans
# les types générés par Orval). Il décrit la politique SANS mentionner les
# règles de composition : il n'y en a pas, et laisser croire le contraire
# pousserait à des mots de passe plus courts et plus prévisibles.
PASSWORD_DESCRIPTION = (
    f"Au moins {PASSWORD_MIN_LENGTH} caractères, {PASSWORD_MAX_LENGTH} au plus. "
    "Aucune règle de composition : une phrase de passe est le meilleur choix. "
    "Les mots de passe présents dans une fuite de données connue sont refusés."
)


def _valider_politique_mot_de_passe(valeur: object) -> object:
    """Validateur partagé par les deux inscriptions (propriétaire et clinique).

    Il ne réimplémente PAS la politique : il construit le value object du
    domaine, seul détenteur de la règle, et se contente de traduire son refus
    dans le vocabulaire de Pydantic.

    Pourquoi cette traduction est indispensable : une DomainValidationError qui
    remonterait jusqu'aux error handlers produirait un corps {code, detail}
    SANS le tableau `validation`, et les frontends afficheraient l'erreur dans
    le bandeau global au lieu de la placer sous le champ mot de passe.
    PydanticCustomError, lui, donne un 422 standard avec loc = ["body",
    "password"] -- et, contrairement à un simple ValueError, sans le préfixe
    "Value error, " devant notre message français.

    Mode "before" (voir les field_validator ci-dessous) : ce validateur passe
    AVANT les contraintes min_length/max_length du Field, dont le message
    serait en anglais. Le Field reste néanmoins déclaré, car c'est lui qui
    documente les bornes dans l'OpenAPI.
    """
    # La valeur brute peut être n'importe quoi (un nombre, null...) : on laisse
    # alors Pydantic produire son erreur de type habituelle.
    if isinstance(valeur, str):
        try:
            PlainPassword(valeur)
        except DomainValidationError as exc:
            raise PydanticCustomError("password_policy", str(exc)) from exc
    return valeur


class RegisterClinicRequest(BaseModel):
    """Corps de POST /clinics/register (onboarding d'une clinique)."""

    clinic_name: str = Field(min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    email: EmailStr  # validation syntaxique de l'adresse par Pydantic
    # SecretStr : masqué dans les repr/logs. Les bornes viennent du domaine
    # (PASSWORD_MIN_LENGTH) : la politique est appliquée dès la frontière HTTP,
    # donc un 422 avant tout hachage. La vérification anti-compromission, elle,
    # est un appel réseau : elle ne peut pas vivre dans un validateur Pydantic
    # (synchrone) et reste dans le use case.
    password: SecretStr = Field(
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
        description=PASSWORD_DESCRIPTION,
    )
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)

    _politique_mot_de_passe = field_validator("password", mode="before")(
        _valider_politique_mot_de_passe
    )


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


# --- Schemas des PROPRIETAIRES (portail B2C) -------------------------------


class RegisterOwnerRequest(BaseModel):
    """Inscription d'un proprietaire : memes exigences de mot de passe que le
    staff, pas de nom de clinique -- le compte est global.

    phone reste nullable dans le CONTRAT : le portail B2C l'exige a
    l'inscription, mais la fiche /account permet de l'effacer ensuite, et le
    staff pourra creer un compte proprietaire sans numero. Une obligation cote
    API rendrait ces deux cas impossibles."""

    email: EmailStr
    password: SecretStr = Field(
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
        description=PASSWORD_DESCRIPTION,
    )
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=30)

    _politique_mot_de_passe = field_validator("password", mode="before")(
        _valider_politique_mot_de_passe
    )


class OwnerRegisteredResponse(BaseModel):
    """201 : l'inscription ne connecte pas, le front enchaine un login."""

    owner_id: uuid.UUID


class AddressPayload(BaseModel):
    """Adresse structuree exposee/recue par l'API (miroir du VO Address).

    str_strip_whitespace : Pydantic valide les longueurs sur les valeurs
    NORMALISEES (comme le VO Address), pas sur les valeurs brutes -- sans
    cela, un pays " F" (2 caracteres bruts) passerait le schema d'entree
    puis, une fois normalise en "F" par le VO, violerait ce meme schema en
    SORTIE (OwnerResponse) : 500 au lieu de 422, et donnee invalide en base.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    line1: str = Field(min_length=1, max_length=200)
    line2: str | None = Field(default=None, max_length=200)
    postal_code: str = Field(min_length=1, max_length=10)
    city: str = Field(min_length=1, max_length=100)
    country: str = Field(default="FR", min_length=2, max_length=2)


class NotificationPreferencesPayload(BaseModel):
    """Preferences de notification (rappels RDV/vaccins) : opt-in par canal."""

    email: bool = True
    sms: bool = False


class UpdateOwnerProfileRequest(BaseModel):
    """Fiche personnelle editable. Ni email (identifiant de connexion, son
    changement exigera une verification par lien) ni mot de passe (flux
    dedie futur) : les exclure du schema rend la modification impossible.

    L'adresse est un bloc optionnel TOUT-OU-RIEN : soit absente (null),
    soit complete -- le sous-schema AddressPayload impose alors line1,
    postal_code et city non vides.
    """

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=30)
    address: AddressPayload | None = None
    notification_preferences: NotificationPreferencesPayload = Field(
        default_factory=NotificationPreferencesPayload
    )


class OwnerResponse(BaseModel):
    """Profil proprietaire (login, refresh, /me et update du profil)."""

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    phone: str | None
    address: AddressPayload | None
    notification_preferences: NotificationPreferencesPayload

    @classmethod
    def from_current_owner(cls, current: CurrentOwner) -> "OwnerResponse":
        """Aplatit la projection application (VOs domaine) en schema API."""
        address = current.address
        return cls(
            id=current.id,
            email=current.email,
            first_name=current.first_name,
            last_name=current.last_name,
            phone=current.phone,
            address=(
                AddressPayload(
                    line1=address.line1,
                    line2=address.line2,
                    postal_code=address.postal_code,
                    city=address.city,
                    country=address.country,
                )
                if address is not None
                else None
            ),
            notification_preferences=NotificationPreferencesPayload(
                email=current.notification_preferences.email,
                sms=current.notification_preferences.sms,
            ),
        )


# --- Schemas du profil CLINIQUE (espace staff B2B) --------------------------


class ClinicProfileResponse(BaseModel):
    """Fiche de la clinique (GET et PUT /clinics/me).

    L'email figure en LECTURE seule : present dans la reponse (affichage)
    mais absent d'UpdateClinicProfileRequest (identifiant d'inscription,
    non modifiable ici).
    """

    id: uuid.UUID
    name: str
    email: str
    phone: str | None
    address: AddressPayload | None
    timezone: str

    @classmethod
    def from_dto(cls, profile: ClinicProfile) -> "ClinicProfileResponse":
        """Aplatit la projection application (VO Address) en schema API."""
        address = profile.address
        return cls(
            id=profile.id,
            name=profile.name,
            email=profile.email,
            phone=profile.phone,
            address=(
                AddressPayload(
                    line1=address.line1,
                    line2=address.line2,
                    postal_code=address.postal_code,
                    city=address.city,
                    country=address.country,
                )
                if address is not None
                else None
            ),
            timezone=profile.timezone,
        )


class UpdateClinicProfileRequest(BaseModel):
    """Fiche editable de la clinique. Pas d'email (identifiant d'inscription,
    exclu du schema donc immuable ici, comme pour la fiche owner).

    L'adresse est un bloc optionnel TOUT-OU-RIEN : soit absente (null), soit
    complete -- le sous-schema AddressPayload impose alors line1, postal_code
    et city non vides. La timezone n'est validee ici que non-vide : l'arbitre
    est le value object Timezone (zoneinfo), un identifiant IANA inconnu
    donne un 422 domaine.
    """

    name: str = Field(min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    address: AddressPayload | None = None
    timezone: str = Field(min_length=1)


class PublicClinicResponse(BaseModel):
    """Entree de l'annuaire public (GET /public/clinics) : projection
    volontairement minimale, l'endpoint est accessible sans authentification."""

    id: uuid.UUID
    name: str
    city: str | None

    @classmethod
    def from_dto(cls, clinic: PublicClinic) -> "PublicClinicResponse":
        return cls(id=clinic.id, name=clinic.name, city=clinic.city)
