"""Commandes d'administration en ligne de commande.

Ces modules ne sont PAS des routes : ils s'executent sur la machine qui a
acces a la base (poste de developpement, conteneur d'exploitation). C'est
deliberement le seul moyen de creer un compte du back-office plateforme --
une inscription par HTTP serait une inscription ouverte a n'importe qui le
jour d'un oubli de garde, et le depot est public.
"""
