"""Generation de phrases de passe pour les comptes crees par le back-office.

Pourquoi le systeme genere le mot de passe au lieu de laisser l'administrateur
le choisir : il n'existe aujourd'hui AUCUN envoi d'email reel (la tache
identity.send_welcome_email se contente de journaliser). Quel que soit le
mecanisme, l'administrateur devra donc transmettre le mot de passe de vive
voix ou par un canal tiers. Autant qu'il soit a forte entropie par
construction -- un mot de passe choisi par un tiers pour quelqu'un d'autre,
c'est le meme "Clinique2026!" pour tout le parc.

Pourquoi une phrase de MOTS et non secrets.token_urlsafe : le secret sera lu
a voix haute ou recopie a la main. Une chaine comme "xQ7-_pZk9Lm" se dicte
mal et se recopie de travers ; "orage-tulipe-galet-fresque-avoine" se dicte
au telephone sans ambiguite. C'est le meme raisonnement que la politique de
mot de passe du projet (NIST SP 800-63B) : la longueur protege, la
complexite typographique ne fait que gener.

Entropie : 5 mots tires dans une liste de 128, soit 7 bits par mot, 35 bits
au total -- auxquels s'ajoute le fait que ce mot de passe est temporaire et
transmis hors bande. Ce n'est pas un secret de longue duree ; il vaut le
temps qu'une personne mette a se connecter et a le changer. Les mots sont
choisis courts, sans accent ni homophone piegeux, pour rester dictables.
"""

import secrets

# 128 mots exactement (7 bits par tirage). Sans accent, sans lettre doublee
# ambigue, et suffisamment distincts les uns des autres pour se dicter sans
# confusion. Ne PAS reduire cette liste sans recalculer l'entropie.
_MOTS = (
    "avoine",
    "azur",
    "balcon",
    "bambou",
    "banquise",
    "baobab",
    "basalte",
    "bassin",
    "bosquet",
    "boussole",
    "brasier",
    "brise",
    "bruyere",
    "cabane",
    "cactus",
    "calanque",
    "canyon",
    "carafe",
    "cascade",
    "cedre",
    "cerise",
    "chalet",
    "chapiteau",
    "cirque",
    "citron",
    "clairiere",
    "cobalt",
    "colline",
    "comete",
    "coquille",
    "corail",
    "coteau",
    "cratere",
    "cristal",
    "cyclone",
    "dahlia",
    "delta",
    "domaine",
    "dune",
    "ebene",
    "echo",
    "eclipse",
    "ecume",
    "embrun",
    "epice",
    "erable",
    "escale",
    "estuaire",
    "etang",
    "falaise",
    "fanal",
    "faucon",
    "fjord",
    "flambeau",
    "foret",
    "fougere",
    "fresque",
    "galet",
    "garrigue",
    "geyser",
    "givre",
    "glacier",
    "goeland",
    "grange",
    "granit",
    "grotte",
    "harpe",
    "hectare",
    "hibou",
    "horizon",
    "igloo",
    "iris",
    "jardin",
    "jasmin",
    "jonquille",
    "kayak",
    "lagune",
    "lande",
    "lanterne",
    "lichen",
    "loutre",
    "lucarne",
    "lupin",
    "magma",
    "manoir",
    "marbre",
    "maree",
    "mesange",
    "meteore",
    "mimosa",
    "mirage",
    "moulin",
    "myrtille",
    "nacre",
    "nebuleuse",
    "nenuphar",
    "obsidienne",
    "ocean",
    "olivier",
    "opale",
    "orage",
    "orchidee",
    "ourse",
    "palissade",
    "papyrus",
    "phare",
    "pinson",
    "plateau",
    "pluie",
    "prairie",
    "quartz",
    "ravin",
    "recif",
    "roseau",
    "safran",
    "saphir",
    "sarcelle",
    "sentier",
    "sequoia",
    "sillage",
    "sirocco",
    "sorbier",
    "tempete",
    "torrent",
    "tourbe",
    "tulipe",
    "vallon",
    "zenith",
)

# Cinq mots : 35 bits d'entropie, et une chaine de 30 a 45 caracteres, donc
# tres au-dessus du minimum de 14 impose par PlainPassword.
_NOMBRE_DE_MOTS = 5


def generer_phrase_de_passe() -> str:
    """Tire une phrase de passe aleatoire, dictable au telephone.

    secrets.choice et non random.choice : `random` est un generateur
    pseudo-aleatoire deterministe, previsible a partir de quelques tirages.
    Pour un secret, c'est `secrets` -- adosse a l'entropie du systeme -- ou
    rien.

    Les mots peuvent se repeter : l'interdire reduirait l'entropie au lieu de
    l'augmenter (et compliquerait le calcul pour rien).
    """
    return "-".join(secrets.choice(_MOTS) for _ in range(_NOMBRE_DE_MOTS))
