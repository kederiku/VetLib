"""Pattern Outbox : fiabilise les effets de bord asynchrones.

Les événements sont écrits dans outbox_events au sein de la même
transaction que le métier, puis relayés vers TaskIQ par un relais.
"""
