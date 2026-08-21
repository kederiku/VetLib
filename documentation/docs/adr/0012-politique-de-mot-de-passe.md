---
sidebar_position: 12
title: "ADR-0012 — Politique de mot de passe alignée NIST 800-63B"
sidebar_label: "0012 — Politique de mot de passe"
description: "Décision 0012 : longueur seule, aucune règle de composition, et vérification anti-compromission."
---

# ADR-0012 — Politique de mot de passe alignée NIST 800-63B

|               |            |
| ------------- | ---------- |
| **Statut**    | Accepté    |
| **Date**      | 2026-08-21 |
| **Décideurs** | @kederiku  |
| **Remplace**  | —          |

## Contexte

Le projet exigeait jusqu'ici **12 caractères minimum**, sans autre contrainte. La règle
était appliquée par un `Field(min_length=12)` dans deux schémas Pydantic, dupliqué dans
deux schémas zod.

Trois choses la rendaient insuffisante.

D'abord, elle vivait dans la **couche presentation**. Une règle métier écrite dans un
schéma HTTP échappe au domaine, ne peut pas être testée sans FastAPI, et se duplique à
chaque nouveau point d'entrée — un futur flux « changer mon mot de passe » l'aurait
réécrite une troisième fois.

Ensuite, la longueur seule ne dit rien de la **qualité** du secret : `motdepasse1234` fait
14 caractères et figure dans toutes les listes d'attaque publiques.

Enfin, la tentation évidente — imposer majuscule, chiffre et caractère spécial — va à
l'encontre des recommandations en vigueur. NIST SP 800-63B déconseille explicitement les
règles de composition depuis sa révision 3 : elles ne produisent pas des secrets plus
solides mais des variantes prévisibles, et déplacent le mot de passe vers le post-it.

## Décision

Nous appliquons la politique suivante à **toute création de mot de passe**, propriétaires
comme personnel de clinique :

- **14 caractères minimum**, 128 maximum ;
- **aucune règle de composition** ;
- **refus des mots de passe présents dans une fuite de données connue**, via l'API Have I
  Been Pwned interrogée en k-anonymity, avec repli sur une liste embarquée si le service
  est injoignable.

La règle de forme vit désormais dans le **domaine**, portée par le value object
`PlainPassword`. La vérification anti-compromission est une entrée/sortie : elle passe par
un **port** de la couche application, `CompromisedPasswordChecker`, et trois adapters
composables en infrastructure.

Le plafond de 128 caractères n'est pas une règle métier mais un garde-fou : Argon2 hache
l'entrée telle quelle.

**La connexion n'applique aucune de ces règles.** Les comptes antérieurs continuent de
fonctionner, et un refus dépendant de l'ancienneté du mot de passe donnerait un oracle à
un attaquant.

## Conséquences

**Positives** — La règle est écrite à un seul endroit et testable sans framework. Un mot
de passe long mais notoire est désormais refusé, ce que la longueur seule ne pouvait pas
attraper. Les phrases de passe, espaces compris, passent sans obstacle. Le futur flux de
changement de mot de passe réutilisera le value object et le port sans rien réécrire.

**Coûts** — Le backend gagne une **dépendance réseau sortante dans un flux
d'inscription** : `httpx` passe de dépendance de développement à dépendance d'exécution,
et un client partagé rejoint le `lifespan`. L'inscription dépend d'un service tiers, d'où
le repli. Le durcissement de 12 à 14 caractères invalide des mots de passe que le projet
acceptait la veille — sans effet sur les comptes existants, qui ne sont vérifiés qu'à la
création.

**Neutres** — La liste embarquée de repli est un filet mince, et c'est assumé : les
corpus publics du type « top 10 000 » ne contiennent presque que des entrées de
12 caractères ou moins, déjà refusées par la longueur. Le vrai filtre est HIBP.

## Alternatives écartées

| Alternative                                             | Pourquoi écartée                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imposer majuscule, chiffre et caractère spécial         | Contraire à NIST SP 800-63B. Produit `Motdepasse1!`, que les outils d'attaque essaient en premier, et pousse à noter le mot de passe.             |
| Longueur seule, sans vérification anti-compromission    | Abandonner les règles de composition sans prendre la contrepartie exigée par la norme laisserait passer `motdepasse1234`.                         |
| Liste embarquée uniquement, sans appel réseau           | Aucune dépendance externe, mais une couverture dérisoire au-delà de 14 caractères. Le service tiers apporte l'essentiel de la valeur.             |
| Vérifier la compromission dans un validateur Pydantic   | Un validateur Pydantic est synchrone : impossible d'y faire un appel réseau sans bloquer la boucle d'événements.                                  |
| Rendre la longueur configurable (`PASSWORD_MIN_LENGTH`) | Une règle métier affaiblissable par variable d'environnement n'est plus une règle. Seuls les réglages HIBP, qui relèvent du déploiement, le sont. |

## Où cela vit dans le code

- `backend/src/vetolib/identity/domain/value_objects.py` — `PlainPassword`, l'arbitre de la longueur
- `backend/src/vetolib/identity/domain/errors.py` — `CompromisedPasswordError` (code `identity.password_compromised`)
- `backend/src/vetolib/identity/application/ports.py` — le port `CompromisedPasswordChecker`
- `backend/src/vetolib/identity/infrastructure/password_breach.py` — les trois adapters (HIBP, liste locale, composite de repli)
- `backend/src/vetolib/identity/infrastructure/data/common_passwords.txt` — la liste de repli
- `backend/src/vetolib/identity/presentation/schemas.py` — le `field_validator` qui localise l'erreur sous le champ
- `frontend-b2c/src/lib/auth/password-policy.ts` et son jumeau `frontend-b2b` — le miroir côté client

## Comment on vérifie que la décision tient

- `backend/tests/unit/identity/test_value_objects.py` — un test nommé
  `test_aucune_regle_de_composition_n_est_imposee` casse si quelqu'un ajoute une règle de
  composition « par sécurité » ;
- `backend/tests/unit/identity/test_password_breach.py` — vérifie que le repli absorbe
  **toute** panne de la source principale, et que les entrées de bourrage de HIBP ne sont
  pas prises pour des fuites (sans ce filtre, plus aucune inscription ne passerait) ;
- `backend/tests/unit/identity/test_authenticate_owner.py` — un compte dont le mot de
  passe ne respecte pas la politique doit toujours pouvoir se connecter ;
- `backend/tests/integration/test_owner_auth_flow.py` — l'erreur de longueur sort bien en
  422 avec `loc: ["body", "password"]`, et non dans un corps `{code, detail}` ;
- côté frontends, `password-strength-hint.test.tsx` et `schemas.test.ts` verrouillent la
  même absence de règles de composition.
