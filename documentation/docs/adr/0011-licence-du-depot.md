---
sidebar_position: 11
title: "ADR-0011 — Choix d'une licence pour un dépôt public"
sidebar_label: "0011 — Licence du dépôt"
description: "Décision 0011 : question ouverte sur la licence d'un dépôt public sans LICENSE."
---

# ADR-0011 — Choix d'une licence pour un dépôt public

|               |                          |
| ------------- | ------------------------ |
| **Statut**    | **Proposé — à trancher** |
| **Date**      | 2026-08-21               |
| **Décideurs** | @kederiku                |

:::warning Cet ADR consigne une question ouverte
Un ADR n'a pas à attendre d'être tranché pour exister. Écrire la question évite qu'elle
reste implicite — et qu'on découvre le problème le jour où quelqu'un demande à réutiliser
le code.
:::

## Contexte

Le dépôt `kederiku/VetLib` est **public**. N'importe qui peut le lire, le cloner, le
forker depuis l'interface GitHub.

Il **ne contient aucun fichier `LICENSE`**. Les deux `package.json` sont `"private": true`
et n'ont pas de champ `license` ; `backend/pyproject.toml` n'en déclare pas non plus.

En droit d'auteur, l'absence de licence ne signifie pas « domaine public ». Elle signifie
**« tous droits réservés »** : le code est protégé par défaut, et personne ne peut
légalement le copier, le modifier ni le réutiliser — alors même qu'il est visible par
tous.

C'est une situation ambiguë, dans les deux sens :

- un lecteur de bonne foi qui reprendrait un extrait serait en infraction sans le savoir ;
- si l'intention est au contraire de partager, l'absence de licence l'empêche
  effectivement.

## Décision

**À trancher.** Quatre voies, chacune cohérente, à choisir selon l'intention.

| Option                              | Ce qu'elle permet                                                                                  | Pour qui                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **MIT**                             | Réutilisation quasi libre, y compris commerciale, avec conservation de l'avis de copyright         | Projet vitrine, adoption maximale                                       |
| **Apache-2.0**                      | Idem MIT, plus une **clause de brevets** explicite et une obligation de signaler les modifications | Idem, avec une meilleure protection juridique                           |
| **AGPL-3.0**                        | Copyleft **réseau** : quiconque exploite une version modifiée en SaaS doit en publier les sources  | Cohérent avec un produit SaaS que l'on ne veut pas voir repris tel quel |
| **Rester « tous droits réservés »** | Rien, mais **écrit explicitement** dans le README                                                  | Projet personnel non destiné à la réutilisation                         |

Une cinquième voie existe — une licence _source-available_ de type BUSL-1.1, qui autorise
la lecture et l'usage non concurrent avec bascule vers une licence libre après quelques
années — mais elle ajoute une complexité de gouvernance sans rapport avec la taille
actuelle du projet.

:::tip La quatrième option est une vraie décision
« Tous droits réservés » **écrit** vaut infiniment mieux que « tous droits réservés »
subi. Une phrase dans le README lève l'ambiguïté au même titre qu'un fichier `LICENSE`.
:::

## Conséquences

**Si une licence permissive est retenue** — MIT ou Apache-2.0 : ajouter `LICENSE` à la
racine, une section dans le README, et le champ `license` dans `pyproject.toml`. Les
`package.json` peuvent rester `"private": true`, ce qui les empêche seulement d'être
publiés sur npm.

**Si l'AGPL est retenue** : mesurer la conséquence réelle — l'obligation porte sur
quiconque exploite une version **modifiée** en service réseau, ce qui inclut vous-même si
le produit devient commercial et fermé. Un accord de licence contributeur devient
souhaitable dès qu'un second contributeur arrive.

**Si le statu quo est retenu** : l'écrire noir sur blanc dans le README, et fermer cet
ADR au statut « Accepté ».

## Alternatives écartées

Aucune pour l'instant : c'est précisément l'objet de la décision à prendre.

## Où cela vit dans le code

- **Absence** de `LICENSE*` à la racine
- `README.md` — aucune section licence
- `frontend-*/package.json` — `"private": true`, sans champ `license`
- `backend/pyproject.toml` — sans champ `license`

## Comment on vérifie que la décision tient

Une fois tranchée : la présence du fichier `LICENSE` et la cohérence du champ `license`
dans les manifestes. GitHub affiche d'ailleurs la licence détectée dans l'en-tête du
dépôt — son absence est visible d'un coup d'œil aujourd'hui.
