"""Adapters du port CompromisedPasswordChecker : la moitié "compromission"
de la politique de mot de passe.

Couche infrastructure de l'architecture hexagonale. Le domaine ne porte que
la longueur minimale (value object PlainPassword) ; NIST SP 800-63B exige en
contrepartie de refuser tout mot de passe déjà présent dans une fuite connue,
ce qui suppose une entrée/sortie -- donc un adapter, ici.

Trois classes, composables :

1. HibpPasswordChecker : la source de vérité, l'API publique Have I Been
   Pwned et son milliard de mots de passe issus de fuites réelles ;
2. LocalBlocklistPasswordChecker : un fichier embarqué, sans réseau ;
3. FallbackPasswordChecker : le composite réellement injecté, qui tente
   HIBP et se rabat sur la liste locale dès que le réseau fait défaut.

Pourquoi ce repli plutôt qu'un simple échec : refuser une inscription parce
qu'un service tiers est en panne serait pire que le risque qu'on cherche à
couvrir. Le contrat du port est explicite -- ne jamais lever pour une raison
technique.
"""

import hashlib
from functools import lru_cache
from importlib import resources

import httpx
import structlog

from vetolib.identity.application.ports import CompromisedPasswordChecker

logger = structlog.get_logger(__name__)

# Le fichier de repli vit à côté de ce module, dans data/. Il est embarqué
# dans le paquet (hatchling inclut tout src/vetolib), donc disponible en
# conteneur comme en local.
_BLOCKLIST_PACKAGE = "vetolib.identity.infrastructure"
_BLOCKLIST_FILE = "data/common_passwords.txt"


@lru_cache(maxsize=1)
def load_common_passwords() -> frozenset[str]:
    """Charge la liste de repli en mémoire, UNE seule fois par processus.

    Quelques milliers d'entrées : le frozenset tient dans quelques centaines
    de Ko et la recherche est en temps constant. lru_cache évite de relire le
    fichier à chaque inscription.
    """
    contenu = (
        resources.files(_BLOCKLIST_PACKAGE).joinpath(_BLOCKLIST_FILE).read_text(encoding="utf-8")
    )
    return frozenset(
        ligne.strip().lower()
        for ligne in contenu.splitlines()
        # Les commentaires d'en-tête documentent la provenance du fichier.
        if ligne.strip() and not ligne.lstrip().startswith("#")
    )


class HibpPasswordChecker:
    """Interroge l'API Have I Been Pwned en k-anonymity.

    LE MOT DE PASSE NE QUITTE JAMAIS LE SERVEUR. On en calcule l'empreinte
    SHA-1, puis on n'envoie que ses CINQ premiers caractères hexadécimaux.
    L'API renvoie toutes les empreintes connues qui commencent par ce
    préfixe (quelques centaines à quelques milliers), et c'est nous qui
    cherchons la nôtre dans cette liste, en local. Le service ne peut donc
    ni reconstituer le mot de passe, ni même savoir lequel des candidats
    nous intéressait.

    SHA-1 est imposé par le protocole HIBP. Il ne protège rien ici (il sert
    d'index, pas de rempart), d'où le usedforsecurity=False qui le dit
    explicitement -- et qui satisfait au passage la règle ruff S324.

    En-tête Add-Padding : sans lui, la TAILLE de la réponse renseignerait un
    observateur du réseau sur le préfixe demandé. Avec lui, l'API complète
    chaque réponse avec de fausses empreintes, reconnaissables à leur
    compteur d'occurrences nul -- d'où le filtre sur le compteur ci-dessous,
    sans lequel n'importe quel mot de passe serait déclaré compromis.
    """

    def __init__(self, client: httpx.AsyncClient, *, api_url: str, timeout_seconds: float) -> None:
        self._client = client
        self._api_url = api_url.rstrip("/")
        self._timeout = timeout_seconds

    async def is_compromised(self, password: str) -> bool:
        """True si l'empreinte figure dans le corpus HIBP. Peut lever
        httpx.HTTPError : c'est le composite qui absorbe la panne."""
        empreinte = hashlib.sha1(password.encode("utf-8"), usedforsecurity=False).hexdigest()
        empreinte = empreinte.upper()
        prefixe, suffixe = empreinte[:5], empreinte[5:]

        reponse = await self._client.get(
            f"{self._api_url}/{prefixe}",
            headers={"Add-Padding": "true"},
            timeout=self._timeout,
        )
        reponse.raise_for_status()

        for ligne in reponse.text.splitlines():
            candidat, _, occurrences = ligne.partition(":")
            if candidat.strip().upper() == suffixe:
                # Compteur à zéro = entrée de bourrage ajoutée par Add-Padding,
                # pas une vraie fuite.
                return occurrences.strip() not in ("", "0")
        return False


class LocalBlocklistPasswordChecker:
    """Consulte la liste embarquée : aucun réseau, réponse immédiate.

    Filet volontairement mince (voir l'en-tête du fichier de données) : il
    ne couvre que les mots de passe longs mais prévisibles. Sa raison d'être
    est l'indisponibilité de HIBP, pas la couverture exhaustive.
    """

    def __init__(self, entries: frozenset[str] | None = None) -> None:
        # Injection possible pour les tests ; sinon on lit le fichier embarqué.
        self._entries = entries if entries is not None else load_common_passwords()

    async def is_compromised(self, password: str) -> bool:
        # Comparaison en minuscules : "Motdepasse1234" est aussi prévisible
        # que "motdepasse1234", la casse ne doit pas suffire à passer.
        return password.lower() in self._entries


class FallbackPasswordChecker:
    """Composite injecté aux use cases : HIBP d'abord, liste locale ensuite.

    C'est ici que se tient la promesse du port -- ne jamais lever pour une
    raison technique. Toute défaillance de la source principale (timeout,
    DNS, 503, réponse illisible) est journalisée puis absorbée, et la
    vérification se poursuit en mode dégradé. Le log est délibérément de
    niveau warning : un repli durable doit se voir en supervision, car la
    couverture réelle chute alors énormément.
    """

    def __init__(
        self,
        primary: CompromisedPasswordChecker,
        fallback: CompromisedPasswordChecker,
    ) -> None:
        self._primary = primary
        self._fallback = fallback

    async def is_compromised(self, password: str) -> bool:
        try:
            return await self._primary.is_compromised(password)
        # Volontairement large : le contrat du port interdit de laisser
        # remonter une panne technique, quelle qu'en soit la nature.
        except Exception as exc:
            # str(exc) et non l'exception complète : une trace httpx peut
            # contenir l'URL appelée, donc le préfixe d'empreinte demandé.
            logger.warning("compromised_password_check_degraded", error=str(exc))
            return await self._fallback.is_compromised(password)
