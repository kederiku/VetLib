---
sidebar_position: 1
title: "Référence de l'API HTTP"
description: "Conventions, tags et carte complète des endpoints."
keywords: [api, rest, openapi, redoc, endpoints, operation_id]
---

# Référence de l'API HTTP

:::info La référence interactive est **générée**, jamais écrite
Elle est produite au build par `redocusaurus` à partir de `backend/openapi.json`, la
sortie de `make openapi`. Cette page-ci donne les conventions et la carte d'ensemble ;
la référence détaillée — schémas, exemples, codes de réponse — vit sur la page
**[Référence API](https://kederiku.github.io/VetLib/api)**.

Sur un dépôt fraîchement cloné, générez d'abord le contrat :

```bash
make openapi
make docs
```

:::

## Les conventions

### Versionnement par le chemin

Toutes les routes métier vivent sous **`/api/v1`**. Une v2 cohabiterait avec la v1 sans
casser les clients existants.

`/healthz` fait exception : elle est **hors** de `/api/v1` et **sans authentification**.
C'est une sonde technique, qui doit rester joignable même si l'authentification ou le
routage métier est cassé.

### `operation_id` obligatoire

Chaque route déclare un `operation_id` explicite. Ce n'est pas cosmétique : **c'est lui
qui donne son nom au hook TypeScript** généré par Orval. `confirmAppointment` produit
`useConfirmAppointment`. Voir
[Le client API généré par Orval](../frontends/client-api-orval.md).

### Le format d'erreur

Toutes les erreurs métier ont la même forme :

```json
{
  "code": "appointment_slot_taken",
  "detail": "Ce créneau vient d'être réservé."
}
```

`code` est un identifiant **stable**, exploitable par un `switch` côté frontend ;
`detail` est destiné à un humain.

| Statut | Famille d'erreur                                                                 |
| ------ | -------------------------------------------------------------------------------- |
| `401`  | Jeton absent, invalide, expiré, ou d'un autre espace                             |
| `403`  | Permission insuffisante                                                          |
| `404`  | Entité introuvable                                                               |
| `409`  | Conflit : transition d'état invalide, créneau déjà pris, annulation trop tardive |
| `422`  | Validation — Pydantic ou domaine                                                 |
| `503`  | `/healthz` seulement : une dépendance est tombée                                 |

Voir
[Une requête HTTP, de bout en bout](../architecture/requete-de-bout-en-bout.md#8-les-erreurs-deviennent-des-statuts-http).

### L'authentification

Aucun en-tête `Authorization`. Tout passe par des **cookies `HttpOnly`**, dans **deux
espaces cloisonnés** :

| Espace                | Préfixe                | Cookies                                         |
| --------------------- | ---------------------- | ----------------------------------------------- |
| Personnel de clinique | `/api/v1/auth/*`       | `vetolib_access`, `vetolib_refresh`             |
| Propriétaires         | `/api/v1/owner/auth/*` | `vetolib_owner_access`, `vetolib_owner_refresh` |

Un jeton d'un espace est **rejeté** par l'autre, grâce au claim `kind`. Voir
[Authentification](../architecture/authentification.md).

### Les tags, et les bounded contexts

| Tag                  | Contexte                  | Qui y accède                                       |
| -------------------- | ------------------------- | -------------------------------------------------- |
| `health`             | `shared`                  | Public                                             |
| `auth`               | `identity`                | Personnel (les routes de connexion sont publiques) |
| `clinics`            | `identity`                | Personnel                                          |
| `owner-auth`         | `identity`                | Propriétaires (connexion publique)                 |
| `owner-profile`      | `identity`                | Propriétaires                                      |
| `public-clinics`     | `identity` + `scheduling` | **Public** — la prise de rendez-vous en ligne      |
| `pets`               | `patients`                | Propriétaires                                      |
| `scheduling`         | `scheduling`              | Personnel                                          |
| `owner-appointments` | `scheduling`              | Propriétaires                                      |

Le tag détermine aussi le sous-dossier généré par Orval (`mode: "tags-split"`).

## La carte des endpoints

### `health` — 1 endpoints

| Méthode | Chemin     | `operation_id` |
| ------- | ---------- | -------------- |
| `GET`   | `/healthz` | `healthz`      |

### `auth` — 4 endpoints

| Méthode | Chemin                 | `operation_id`   |
| ------- | ---------------------- | ---------------- |
| `POST`  | `/api/v1/auth/login`   | `login`          |
| `POST`  | `/api/v1/auth/logout`  | `logout`         |
| `GET`   | `/api/v1/auth/me`      | `getCurrentUser` |
| `POST`  | `/api/v1/auth/refresh` | `refreshToken`   |

### `clinics` — 3 endpoints

| Méthode | Chemin                     | `operation_id`   |
| ------- | -------------------------- | ---------------- |
| `GET`   | `/api/v1/clinics/me`       | `getMyClinic`    |
| `PUT`   | `/api/v1/clinics/me`       | `updateMyClinic` |
| `POST`  | `/api/v1/clinics/register` | `registerClinic` |

### `owner-auth` — 5 endpoints

| Méthode | Chemin                        | `operation_id`      |
| ------- | ----------------------------- | ------------------- |
| `POST`  | `/api/v1/owner/auth/login`    | `ownerLogin`        |
| `POST`  | `/api/v1/owner/auth/logout`   | `ownerLogout`       |
| `GET`   | `/api/v1/owner/auth/me`       | `getCurrentOwner`   |
| `POST`  | `/api/v1/owner/auth/refresh`  | `ownerRefreshToken` |
| `POST`  | `/api/v1/owner/auth/register` | `registerOwner`     |

### `owner-profile` — 1 endpoints

| Méthode | Chemin                  | `operation_id`       |
| ------- | ----------------------- | -------------------- |
| `PUT`   | `/api/v1/owner/profile` | `updateOwnerProfile` |

### `public-clinics` — 3 endpoints

| Méthode | Chemin                                                 | `operation_id`               |
| ------- | ------------------------------------------------------ | ---------------------------- |
| `GET`   | `/api/v1/public/clinics`                               | `listClinics`                |
| `GET`   | `/api/v1/public/clinics/{clinic_id}/appointment-types` | `listClinicAppointmentTypes` |
| `GET`   | `/api/v1/public/clinics/{clinic_id}/availabilities`    | `listAvailabilities`         |

### `pets` — 5 endpoints

| Méthode  | Chemin                        | `operation_id` |
| -------- | ----------------------------- | -------------- |
| `GET`    | `/api/v1/owner/pets`          | `listMyPets`   |
| `POST`   | `/api/v1/owner/pets`          | `createPet`    |
| `GET`    | `/api/v1/owner/pets/{pet_id}` | `getMyPet`     |
| `PUT`    | `/api/v1/owner/pets/{pet_id}` | `updatePet`    |
| `DELETE` | `/api/v1/owner/pets/{pet_id}` | `deletePet`    |

:::note L'édition d'un animal est un `PUT`, pas un `PATCH`

La fiche animal porte des champs effaçables (race, date de naissance). Avec une
sémantique `PATCH` où « `null` = inchangé », il devenait **impossible de vider**
une race saisie par erreur. La sentinelle qui distinguerait « absent » de
« `null` » n'aiderait pas : OpenAPI ne sait pas exprimer cette différence, le
client généré par Orval produirait `breed?: string | null` sans moyen fiable de
faire le tri.

Le `PUT` remplace donc la fiche entière : **un champ facultatif omis vaut `null`,
donc efface**. Même convention que `PUT /api/v1/owner/profile`.

:::

### `scheduling` — 18 endpoints

| Méthode  | Chemin                                                                 | `operation_id`              |
| -------- | ---------------------------------------------------------------------- | --------------------------- |
| `GET`    | `/api/v1/scheduling/agenda`                                            | `getAgenda`                 |
| `GET`    | `/api/v1/scheduling/appointment-types`                                 | `listAppointmentTypes`      |
| `POST`   | `/api/v1/scheduling/appointment-types`                                 | `createAppointmentType`     |
| `DELETE` | `/api/v1/scheduling/appointment-types/{appointment_type_id}`           | `deleteAppointmentType`     |
| `PUT`    | `/api/v1/scheduling/appointment-types/{appointment_type_id}`           | `updateAppointmentType`     |
| `POST`   | `/api/v1/scheduling/appointments`                                      | `createAppointment`         |
| `POST`   | `/api/v1/scheduling/appointments/{appointment_id}/cancel`              | `cancelAppointment`         |
| `POST`   | `/api/v1/scheduling/appointments/{appointment_id}/complete`            | `completeAppointment`       |
| `POST`   | `/api/v1/scheduling/appointments/{appointment_id}/confirm`             | `confirmAppointment`        |
| `GET`    | `/api/v1/scheduling/resources`                                         | `listResources`             |
| `POST`   | `/api/v1/scheduling/resources`                                         | `createResource`            |
| `DELETE` | `/api/v1/scheduling/resources/{resource_id}`                           | `deleteResource`            |
| `PUT`    | `/api/v1/scheduling/resources/{resource_id}`                           | `updateResource`            |
| `GET`    | `/api/v1/scheduling/resources/{resource_id}/exceptions`                | `listResourceExceptions`    |
| `POST`   | `/api/v1/scheduling/resources/{resource_id}/exceptions`                | `createResourceException`   |
| `DELETE` | `/api/v1/scheduling/resources/{resource_id}/exceptions/{exception_id}` | `deleteResourceException`   |
| `GET`    | `/api/v1/scheduling/resources/{resource_id}/weekly-schedule`           | `getResourceWeeklySchedule` |
| `PUT`    | `/api/v1/scheduling/resources/{resource_id}/weekly-schedule`           | `setResourceWeeklySchedule` |

### `owner-appointments` — 3 endpoints

| Méthode | Chemin                                               | `operation_id`        |
| ------- | ---------------------------------------------------- | --------------------- |
| `GET`   | `/api/v1/owner/appointments`                         | `listMyAppointments`  |
| `POST`  | `/api/v1/owner/appointments`                         | `bookAppointment`     |
| `POST`  | `/api/v1/owner/appointments/{appointment_id}/cancel` | `cancelMyAppointment` |

_42 endpoints. Table générée à partir de `backend/openapi.json` — la référence
interactive reste la source de vérité pour les schémas et les codes de réponse._

## Régénérer le contrat

```bash
make openapi          # écrit backend/openapi.json
```

La commande est instantanée et **ne demande ni base ni Redis** : `vetolib.main` est
importable sans effet de bord, toutes les connexions n'étant ouvertes que par le
`lifespan`.

```python
uv run python -c "import json; from vetolib.main import app; print(json.dumps(app.openapi()))"
```

C'est cette propriété qui permet à la CI de produire le contrat dans un simple job,
d'abord pour vérifier la dérive du client Orval, ensuite pour construire la référence de
ce site.

## Améliorations possibles du contrat

L'application déclare aujourd'hui `FastAPI(title="VetoLib API", version="0.1.0")`, sans
`description` ni `openapi_tags` documentés. Les ajouter enrichirait directement la
référence Redoc : une introduction en tête de page, et une description sous chaque groupe
de routes.
