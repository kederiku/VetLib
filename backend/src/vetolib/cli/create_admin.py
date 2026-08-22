"""Commande `make create-admin` : cree ou administre un compte du back-office.

Pourquoi une commande locale plutot qu'une route ou une migration :

- une ROUTE d'inscription serait, par construction, joignable par tout
  Internet ; la seule protection serait un secret partage, c'est-a-dire un
  mot de passe de plus a gerer ;
- une MIGRATION qui insere un compte poserait un identifiant PAR DEFAUT dans
  toute base, y compris en production, et son mot de passe serait ecrit dans
  un depot PUBLIC ;
- une VARIABLE D'ENVIRONNEMENT lue au demarrage laisserait le secret dans
  l'environnement du processus, visible de tout ce qui sait lire /proc.

Il reste donc une commande lancee par un humain, qui saisit le mot de passe
a l'invite. La politique appliquee est exactement celle des deux autres
espaces (longueur minimale du value object PlainPassword + verification
anti-compromission) : un compte tout-puissant ne merite pas moins qu'un
compte de proprietaire d'animaux.

Usage :

    make create-admin email=prenom.nom@exemple.fr          # creation
    make create-admin email=... args=--reset-password      # nouveau mot de passe
    make create-admin email=... args=--disable             # revoque l'acces
    make create-admin email=... args=--enable              # le retablit

Codes de sortie : 0 succes, 1 refus metier ou validation, 2 base injoignable.
"""

import argparse
import asyncio
import getpass
import sys
from collections.abc import Sequence

from sqlalchemy.exc import SQLAlchemyError

from vetolib.config import get_settings
from vetolib.identity.domain.errors import PlatformAdminNotFoundError
from vetolib.identity.domain.platform_admin import PlatformAdmin
from vetolib.identity.domain.value_objects import Email, HashedPassword, PlainPassword
from vetolib.identity.infrastructure.password_breach import (
    FallbackPasswordChecker,
    HibpPasswordChecker,
    LocalBlocklistPasswordChecker,
)
from vetolib.identity.infrastructure.password_hasher import PwdlibPasswordHasher
from vetolib.identity.infrastructure.uow import SqlAlchemyIdentityUnitOfWork
from vetolib.shared.domain.errors import DomainError
from vetolib.shared.infrastructure.clock import SystemClock
from vetolib.shared.infrastructure.db.engine import create_engine_and_sessionmaker

_CODE_REFUS = 1
_CODE_BASE_INJOIGNABLE = 2


class _RefusError(Exception):
    """Refus METIER de la commande, avec un message destine a l'operateur.

    Une exception dediee plutot que SystemExit : SystemExit derive de
    BaseException, elle traverse les `except Exception` et se propage depuis
    des endroits ou on ne l'attend pas (une saisie interactive, par exemple,
    qui a lieu AVANT le bloc de traitement). Une exception ordinaire se
    rattrape la ou on a decide de le faire, et nulle part ailleurs.
    """


def _lire_mot_de_passe(*, confirmer: bool) -> str:
    """Lit un mot de passe sans jamais l'exposer.

    getpass lit directement sur le TERMINAL, echo desactive : la valeur
    n'apparait ni dans l'historique du shell, ni dans la sortie de `ps` (ce
    que ferait une option --password=...), ni dans l'environnement du
    processus.

    Si l'entree standard n'est PAS un terminal (tube, provisionnement
    automatise), on lit une ligne sur stdin -- convention `--password-stdin`
    de Docker, qui permet par exemple `pass show vetolib/admin |
    make create-admin email=...` sans jamais ecrire le secret sur disque.

    Il n'y a volontairement AUCUNE option --password : une option en ligne de
    commande est lisible par tout utilisateur de la machine pendant
    l'execution.
    """
    if not sys.stdin.isatty():
        return sys.stdin.readline().rstrip("\n")
    mot_de_passe = getpass.getpass("Mot de passe (saisie masquée) : ")
    if confirmer and mot_de_passe != getpass.getpass("Confirmation : "):
        raise _RefusError("Les deux saisies diffèrent.")
    return mot_de_passe


async def _empreinte(mot_de_passe: str) -> str:
    """Valide la politique complete puis renvoie l'empreinte Argon2.

    Deux moities, exactement comme a l'inscription d'un proprietaire : la
    longueur est portee par le value object du domaine, la compromission par
    le port CompromisedPasswordChecker. On monte ici le meme composite que la
    DI de l'API (HIBP avec repli sur la liste embarquee), pilote par les
    memes reglages -- HIBP_ENABLED=false coupe l'appel reseau.
    """
    settings = get_settings()
    PlainPassword(mot_de_passe)  # leve DomainValidationError si trop court/long

    locale = LocalBlocklistPasswordChecker()
    if settings.hibp_enabled:
        import httpx

        async with httpx.AsyncClient() as client:
            verificateur = FallbackPasswordChecker(
                HibpPasswordChecker(
                    client,
                    api_url=settings.hibp_api_url,
                    timeout_seconds=settings.hibp_timeout_seconds,
                ),
                locale,
            )
            compromis = await verificateur.is_compromised(mot_de_passe)
    else:
        compromis = await locale.is_compromised(mot_de_passe)

    if compromis:
        raise _RefusError(
            "Ce mot de passe figure dans une fuite de données connue. Choisissez-en un autre."
        )
    return await PwdlibPasswordHasher().hash(mot_de_passe)


async def _changer_statut(args: argparse.Namespace, email: Email) -> int:
    """Revoque (--disable) ou retablit (--enable) un compte existant."""
    settings = get_settings()
    engine, sessionmaker = create_engine_and_sessionmaker(settings.database_url)
    try:
        async with SqlAlchemyIdentityUnitOfWork(
            sessionmaker, app_db_role=settings.app_db_role
        ) as uow:
            admin = await uow.admins.get_by_email(email)
            if admin is None:
                raise PlatformAdminNotFoundError(f"Aucun administrateur pour {email.value}.")
            if args.disable:
                # Garde-fou : revoquer le dernier compte actif verrouillerait
                # tout le monde dehors. Aucune ROUTE ne permet d'en recreer un
                # -- seule cette commande le peut, et elle exige un acces a la
                # base, que la personne bloquee n'a peut-etre pas.
                if admin.is_active and await uow.admins.count_active() <= 1:
                    raise _RefusError(
                        "Refus : c'est le dernier administrateur actif. "
                        "Créez-en un autre avant de révoquer celui-ci."
                    )
                admin.deactivate()
            else:
                admin.activate()
            await uow.admins.update(admin)
            await uow.commit()
            etat = "réactivé" if args.enable else "révoqué"
            sys.stdout.write(f"Administrateur {etat} : {admin.id}\n")
            return 0
    finally:
        await engine.dispose()


async def _creer_ou_reinitialiser(args: argparse.Namespace, email: Email, mot_de_passe: str) -> int:
    """Cree un compte, ou remplace le mot de passe d'un compte existant.

    Le mot de passe est deja SAISI quand on arrive ici (voir main) : on
    n'ouvre jamais une transaction pour la laisser attendre une frappe
    humaine. Une transaction PostgreSQL laissee ouverte pendant qu'un
    operateur cherche son gestionnaire de mots de passe, c'est un verrou tenu
    plusieurs minutes -- et, dans un flux async, la boucle bloquee.
    """
    settings = get_settings()
    # Le hachage et la verification anti-compromission se font AVANT
    # d'ouvrir la transaction, pour la meme raison : Argon2 coute des
    # dizaines de millisecondes, et HIBP est un appel reseau.
    empreinte = HashedPassword(await _empreinte(mot_de_passe))
    engine, sessionmaker = create_engine_and_sessionmaker(settings.database_url)
    try:
        async with SqlAlchemyIdentityUnitOfWork(
            sessionmaker, app_db_role=settings.app_db_role
        ) as uow:
            existant = await uow.admins.get_by_email(email)

            if existant is not None:
                if not args.reset_password:
                    # Jamais de remplacement silencieux : ce serait
                    # transformer une faute de frappe en prise de controle.
                    sys.stderr.write(
                        f"Un administrateur existe déjà avec l'adresse {email.value}. "
                        "Utilisez --reset-password pour changer son mot de passe.\n"
                    )
                    return _CODE_REFUS
                existant.change_password(empreinte)
                await uow.admins.update(existant)
                await uow.commit()
                sys.stdout.write(f"Mot de passe réinitialisé : {existant.id}\n")
                return 0

            if args.reset_password:
                sys.stderr.write(f"Aucun administrateur avec l'adresse {email.value}.\n")
                return _CODE_REFUS

            admin = PlatformAdmin.create(
                email=email,
                hashed_password=empreinte,
                first_name=args.first_name,
                last_name=args.last_name,
                now=SystemClock().now(),
            )
            await uow.admins.add(admin)
            await uow.commit()
            # On affiche l'identifiant, JAMAIS le mot de passe ni l'empreinte.
            sys.stdout.write(f"Administrateur créé : {admin.id}\n")
            return 0
    finally:
        await engine.dispose()


def _analyser(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="create-admin",
        description="Cree ou administre un compte du back-office plateforme.",
    )
    parser.add_argument("--email", required=True, help="Adresse de connexion.")
    parser.add_argument("--first-name", default="Admin", help="Prénom affiché.")
    parser.add_argument("--last-name", default="Plateforme", help="Nom affiché.")
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Change le mot de passe d'un compte existant (confirmation demandée).",
    )
    parser.add_argument("--disable", action="store_true", help="Révoque l'accès du compte.")
    parser.add_argument("--enable", action="store_true", help="Rétablit un accès révoqué.")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    """Point d'entree : saisie interactive, puis travail en base.

    L'ordre est delibere : TOUT ce qui attend un humain (confirmation, mot de
    passe) se passe ici, en synchrone, AVANT d'ouvrir la moindre connexion.
    Contrepartie assumee : sur une creation dont l'adresse est deja prise, on
    aura saisi un mot de passe pour rien -- un desagrement mineur en regard
    d'une transaction laissee ouverte pendant une saisie.
    """
    args = _analyser(argv)
    if args.disable and args.enable:
        sys.stderr.write("--disable et --enable sont exclusifs.\n")
        return _CODE_REFUS

    # L'adresse est validee AVANT toute saisie : inutile de faire taper un mot
    # de passe deux fois pour refuser ensuite sur une faute de frappe.
    try:
        email = Email(args.email)
    except DomainError as exc:
        sys.stderr.write(f"{exc}\n")
        return _CODE_REFUS

    try:
        mot_de_passe: str | None = None
        if not (args.disable or args.enable):
            # Confirmation explicite de la reinitialisation, en mode
            # interactif seulement : sur une entree redirigee, la ligne
            # disponible EST le mot de passe, et --reset-password est deja
            # une intention claire.
            if args.reset_password and sys.stdin.isatty():
                if input('Taper "oui" pour confirmer la réinitialisation : ') != "oui":
                    raise _RefusError("Abandon.")
            mot_de_passe = _lire_mot_de_passe(confirmer=True)

        if mot_de_passe is None:
            return asyncio.run(_changer_statut(args, email))
        return asyncio.run(_creer_ou_reinitialiser(args, email, mot_de_passe))
    except _RefusError as exc:
        sys.stderr.write(f"{exc}\n")
        return _CODE_REFUS
    except DomainError as exc:
        sys.stderr.write(f"{exc}\n")
        return _CODE_REFUS
    except SQLAlchemyError as exc:
        sys.stderr.write(f"Base de données injoignable : {exc}\n")
        return _CODE_BASE_INJOIGNABLE


if __name__ == "__main__":
    raise SystemExit(main())
