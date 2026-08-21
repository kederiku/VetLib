---
sidebar_position: 11
title: "ADR-0011 — Licence MIT pour un dépôt public"
sidebar_label: "0011 — Licence MIT"
description: "Décision 0011 : le projet est publié sous licence MIT."
---

# ADR-0011 — Licence MIT pour un dépôt public

|               |            |
| ------------- | ---------- |
| **Statut**    | Accepté    |
| **Date**      | 2026-08-21 |
| **Décideurs** | @kederiku  |

## Contexte

Le dépôt `kederiku/VetLib` est **public**. N'importe qui peut le lire, le cloner, le
forker depuis l'interface GitHub.

Il ne contenait **aucun fichier `LICENSE`**. Les deux `package.json` étaient
`"private": true` sans champ `license` ; `backend/pyproject.toml` n'en déclarait pas non
plus.

En droit d'auteur, l'absence de licence ne signifie pas « domaine public ». Elle signifie
**« tous droits réservés »** : le code est protégé par défaut, et personne ne peut
légalement le copier, le modifier ni le réutiliser — alors même qu'il est visible par
tous.

L'ambiguïté coupait dans les deux sens :

- un lecteur de bonne foi qui aurait repris un extrait aurait été en infraction sans le
  savoir ;
- l'intention étant au contraire de partager, l'absence de licence l'empêchait
  effectivement.

## Décision

Le projet est publié sous **licence MIT**, © 2026 Cédric Delagrée.

Concrètement :

- `LICENSE` à la racine du dépôt, texte MIT intégral ;
- `license = "MIT"` dans `backend/pyproject.toml` — une expression SPDX au sens de la
  PEP 639, que hatchling reporte en `License-Expression: MIT` dans les métadonnées de la
  distribution ;
- `"license": "MIT"` dans les trois `package.json`. Ils restent `"private": true`, ce qui
  les empêche seulement d'être publiés sur npm par mégarde ;
- une section **Licence** dans le README, et la mention correspondante dans
  [Contribuer](../contribuer/workflow-de-contribution.md).

## Conséquences

**Positives**

- L'ambiguïté est levée : chacun sait ce qu'il a le droit de faire.
- MIT est la licence permissive la plus lue et la plus courte — elle ne demande aucune
  expertise juridique pour être comprise.
- Aucune friction pour une réutilisation partielle : reprendre le montage RLS, le pattern
  outbox ou le job `gate` dans un autre projet est explicitement autorisé.
- GitHub affiche désormais la licence dans l'en-tête du dépôt, et le champ SPDX descend
  dans les métadonnées des paquets construits.

**Coûts**

- Une réutilisation commerciale par un tiers, y compris concurrente, est autorisée. C'est
  la contrepartie assumée d'une licence permissive.
- Aucune obligation de reversement : une version modifiée peut rester fermée.
- Aucune clause de brevets explicite — voir l'alternative Apache-2.0 ci-dessous.

**Neutres**

- En contribuant, on accepte implicitement que sa contribution soit distribuée sous la
  même licence. Un accord de licence contributeur formel deviendrait utile le jour où
  plusieurs personnes contribueraient régulièrement.

## Alternatives écartées

| Alternative                                        | Pourquoi écartée                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apache-2.0**                                     | Équivalente à MIT sur le fond, avec une **clause de brevets** explicite et une obligation de signaler les modifications. Plus protectrice, mais nettement plus longue, pour un bénéfice théorique sur un projet sans portefeuille de brevets                            |
| **AGPL-3.0**                                       | Copyleft réseau : quiconque exploite une version modifiée en SaaS doit en publier les sources. Cohérent avec un produit SaaS que l'on ne veut pas voir repris — mais l'obligation s'appliquerait **aussi au projet lui-même** s'il devenait un jour commercial et fermé |
| **BUSL-1.1** (_source-available_)                  | Autorise la lecture et l'usage non concurrent, avec bascule vers une licence libre après quelques années. Ajoute une complexité de gouvernance sans rapport avec la taille du projet                                                                                    |
| **Rester « tous droits réservés », mais l'écrire** | Aurait levé l'ambiguïté, mais aurait aussi empêché toute réutilisation d'un dépôt volontairement public                                                                                                                                                                 |

## Où cela vit dans le code

- `LICENSE` — le texte MIT
- `README.md` — la section **Licence**
- `backend/pyproject.toml` — `license = "MIT"`
- `frontend-b2c/package.json`, `frontend-b2b/package.json`,
  `documentation/package.json` — `"license": "MIT"`

## Comment on vérifie que la décision tient

GitHub détecte la licence à partir du fichier `LICENSE` et l'affiche dans l'en-tête du
dépôt : sa disparition serait visible d'un coup d'œil. Côté paquet Python, un
`uv build --wheel` produit des métadonnées portant `License-Expression: MIT` — une
régression du champ se verrait dans la distribution construite.
