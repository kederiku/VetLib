---
sidebar_position: 4
title: "Rôles et permissions"
description: "La matrice d'autorisation du personnel de clinique, et qui en est l'autorité."
keywords:
  [rôles, permissions, asv, vétérinaire, manager, autorisation, fat token]
---

# Rôles et permissions

## Trois rôles hiérarchiques

Les permissions ne concernent que le **personnel de clinique**. Les propriétaires
d'animaux n'ont ni rôle ni permission : leurs droits découlent entièrement de leur
identité (« mes animaux », « mes rendez-vous »).

```python
class Role(StrEnum):
    ASV = "asv"                    # auxiliaire spécialisé vétérinaire
    VETERINARIAN = "veterinarian"
    MANAGER = "manager"            # gérant
```

`StrEnum` signifie que chaque membre **est** une `str` : `Role.MANAGER == "manager"`. Le
stockage en base et la sérialisation dans le JWT en deviennent triviaux.

Le premier utilisateur créé avec la clinique reçoit automatiquement `manager`.

## La matrice

Les rôles se composent par **union**, chacun étendant le précédent :

```python
_VETERINARIAN_PERMISSIONS = _ASV_PERMISSIONS | frozenset({...})
_MANAGER_PERMISSIONS = _VETERINARIAN_PERMISSIONS | frozenset({...})
```

| Permission             | ASV | Vétérinaire | Manager |
| ---------------------- | :-: | :---------: | :-----: |
| `appointment:read`     | ✅  |     ✅      |   ✅    |
| `appointment:write`    | ✅  |     ✅      |   ✅    |
| `owner:read`           | ✅  |     ✅      |   ✅    |
| `owner:write`          | ✅  |     ✅      |   ✅    |
| `pet:read`             | ✅  |     ✅      |   ✅    |
| `pet:write`            | ✅  |     ✅      |   ✅    |
| `medical_record:read`  | ❌  |     ✅      |   ✅    |
| `medical_record:write` | ❌  |     ✅      |   ✅    |
| `prescription:write`   | ❌  |     ✅      |   ✅    |
| `clinic:manage`        | ❌  |     ❌      |   ✅    |
| `staff:manage`         | ❌  |     ❌      |   ✅    |
| `billing:read`         | ❌  |     ❌      |   ✅    |
| `analytics:read`       | ❌  |     ❌      |   ✅    |

La ligne de partage la plus importante : **l'ASV n'a pas accès aux données médicales**.
Un secrétariat gère l'agenda, les propriétaires et les animaux — il n'a aucune raison de
lire un dossier de soins.

Le format `ressource:action` n'est pas décoratif : il rend la matrice lisible d'un coup
d'œil et permet, plus tard, des règles par préfixe.

## Le « fat token » : les permissions voyagent dans le JWT

À la connexion, le jeton d'accès du personnel embarque la clinique, le rôle **et** la
liste des permissions :

```python
"cid": str(user.clinic_id),
"role": user.role.value,
"perms": sorted(user.permissions),   # sorted() : sortie déterministe
```

Chaque endpoint peut donc vérifier une permission **sans requête en base**. C'est ce qui
permet à `require_permission(...)` d'être une simple dépendance FastAPI, sans coût.

La contrepartie est explicite et acceptée : **un changement de rôle n'est effectif qu'au
prochain jeton**, soit au plus 15 minutes. C'est la raison exacte pour laquelle le jeton
d'accès est court. Le jeton de rafraîchissement, lui, est volontairement maigre : au
rafraîchissement, l'utilisateur est relu en base, et un compte désactivé ou un rôle
modifié est pris en compte à ce moment-là.

Voir [Authentification](../architecture/authentification.md).

## Le frontend n'autorise rien

Le portail B2B tient une copie de la liste des permissions, dans
`frontend-b2b/src/lib/auth/permissions.ts` :

```ts
export const PERMISSIONS = [
  "appointment:read",
  "appointment:write",
  // ...
] as const;

export type Permission = (typeof PERMISSIONS)[number];
```

Le `as const` fige le tableau en tuple de littéraux, ce qui permet d'en dériver un type
union. Le compilateur refuse alors `useHasPermission("appointmnt:read")` : une faute de
frappe devient une erreur de compilation au lieu d'un bouton mystérieusement caché.

:::danger Cacher un élément n'est pas une protection
Cette liste sert **uniquement à adapter l'interface** : masquer un onglet, désactiver un
bouton. L'autorité reste le backend, qui vérifie la permission sur **chaque** endpoint.
Un utilisateur qui appellerait l'API directement se heurterait au même `403`.
:::

`hasPermission()` est une fonction pure, pas un hook : elle peut donc être appelée dans
un `.filter()` ou un `.map()` — par exemple pour filtrer les entrées de navigation — là
où les règles des hooks React l'interdiraient. Une session non encore résolue
(`undefined`) renvoie `false` : « pas encore de droits » est le défaut le plus sûr.

## Garder les deux listes synchronisées

La matrice TypeScript est un **miroir** de `ROLE_PERMISSIONS` côté backend. Ajouter une
permission demande donc deux modifications :

1. `backend/src/vetolib/identity/domain/value_objects.py` — la source de vérité ;
2. `frontend-b2b/src/lib/auth/permissions.ts` — le miroir.

Rien n'automatise cette synchronisation aujourd'hui : les permissions ne sont pas dans
le contrat OpenAPI en tant qu'énumération, elles ne descendent donc pas par Orval. La
divergence se manifesterait par un élément d'interface caché à tort — jamais par une
faille, puisque le backend reste l'autorité.

Le fichier `backend/tests/integration/test_scheduling_permissions.py` vérifie qu'un rôle
insuffisant reçoit bien un `403` sur les endpoints protégés.
