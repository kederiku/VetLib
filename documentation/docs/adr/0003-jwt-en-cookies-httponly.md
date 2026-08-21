---
sidebar_position: 3
title: "ADR-0003 — JWT en cookies HttpOnly et deux espaces cloisonnés"
sidebar_label: "0003 — JWT en cookies HttpOnly"
description: "Décision 0003 : cookies HttpOnly, double jeton et claim kind."
---

# ADR-0003 — JWT en cookies HttpOnly et deux espaces cloisonnés

|               |            |
| ------------- | ---------- |
| **Statut**    | Accepté    |
| **Date**      | 2026-08-20 |
| **Décideurs** | @kederiku  |

## Contexte

Deux populations partagent un même backend : le **personnel de clinique**, qui appartient
à une clinique et porte un rôle, et les **propriétaires d'animaux**, comptes globaux sans
clinique ni rôle. Le même email peut exister dans les deux mondes — une vétérinaire peut
être cliente d'une autre clinique pour son chat.

Deux risques distincts en découlent. D'abord le vol de jeton : un jeton stocké en
`localStorage` est lisible par n'importe quel script injecté, donc exfiltrable par une
faille XSS. Ensuite la confusion d'espaces : les deux populations partageant secret,
émetteur et audience, un jeton signé pour l'une serait cryptographiquement valide pour
l'autre.

## Décision

**Les jetons ne transitent que dans des cookies `HttpOnly`.** Jamais dans un corps JSON,
jamais dans un en-tête posé par le frontend.

Deux jetons : un jeton d'**accès** de 15 minutes (`path=/`) et un jeton de
**rafraîchissement** de 7 jours, dont le `path` est restreint à son propre endpoint.

Deux **espaces indépendants**, avec des noms de cookies distincts, et un claim `kind`
(`"staff"` ou `"owner"`) vérifié au décodage.

Le jeton d'accès du personnel est « gras » : il embarque `cid`, `role` et `perms`, ce qui
permet d'autoriser sans requête en base.

## Conséquences

**Positives**

- Une faille XSS dans un portail **ne peut pas** exfiltrer les jetons.
- Le frontend n'a aucun jeton à stocker, joindre ou faire expirer.
- Le `path` restreint réduit au minimum la surface d'exposition du jeton long.
- L'autorisation ne coûte aucune requête en base.
- Un jeton copié d'un espace à l'autre est rejeté.

**Coûts**

- Il faut se protéger du CSRF : `SameSite=Lax` et une liste d'origines CORS **exacte**,
  imposée par `allow_credentials`.
- Une révocation n'est effective qu'à l'expiration du jeton d'accès, au plus 15 minutes.
- Le rafraîchissement silencieux côté client demande un mutex : le backend fait tourner
  le jeton, et deux rafraîchissements concurrents s'invalideraient mutuellement.
- Une tolérance temporaire (`allow_missing_kind`) subsiste côté personnel, le temps que
  les anciens jetons de rafraîchissement expirent.

**Neutres**

- HS256 suffit tant qu'un seul service émet **et** vérifie. Un passage multi-services
  imposerait RS256 ou EdDSA.

## Alternatives écartées

| Alternative                                       | Pourquoi écartée                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| Jeton en `localStorage` + en-tête `Authorization` | Exfiltrable par XSS — le risque principal                                   |
| Session serveur avec identifiant en base          | Une requête par appel ; l'état serveur complique la mise à l'échelle        |
| Un seul espace avec un champ « type de compte »   | Un même email ne pourrait plus être à la fois membre du personnel et client |
| Cookies partagés entre les deux espaces           | Deux sessions ouvertes sur le même hôte s'écraseraient                      |

## Où cela vit dans le code

- `identity/presentation/cookies.py` — **seul** endroit qui connaît noms et chemins
- `identity/infrastructure/token_provider.py` — émission, décodage, claim `kind`
- `identity/presentation/routers/{auth,owner_auth}.py`
- `backend/src/vetolib/main.py` — CORS avec `allow_credentials`
- `frontend-*/src/lib/api/mutator.ts` — rafraîchissement silencieux et mutex

## Comment on vérifie que la décision tient

`test_auth_flow.py` et `test_owner_auth_flow.py` exercent connexion, rafraîchissement et
déconnexion sur les deux espaces, et vérifient qu'un jeton de l'un est **rejeté** par
l'autre. Le gabarit de demande de fusion porte en outre une case « aucun jeton dans un
corps JSON ».

Voir [Authentification](../architecture/authentification.md).
