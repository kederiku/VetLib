/**
 * Politique de mot de passe, côté client : le MIROIR de la règle backend.
 *
 * Le backend est seul juge (value object PlainPassword du domaine identity,
 * doublé d'un validateur Pydantic à la frontière HTTP). Ce module ne sert
 * qu'au confort : refuser tout de suite, sous le champ, ce que le serveur
 * refuserait de toute façon — sans aller-retour réseau.
 *
 * Ce qui surprend et qui est VOLONTAIRE : il n'y a aucune règle de
 * composition. Ni majuscule, ni chiffre, ni caractère spécial exigés. C'est la
 * recommandation de NIST SP 800-63B depuis sa révision 3 : ces règles ne
 * produisent pas des mots de passe plus solides, seulement des variantes
 * prévisibles ("Motdepasse1!"), pendant qu'elles poussent les gens à noter
 * leur mot de passe. La longueur, elle, protège vraiment.
 *
 * La contrepartie exigée par la même norme — refuser les mots de passe déjà
 * présents dans une fuite de données — n'est PAS vérifiable ici : elle demande
 * le corpus Have I Been Pwned. Elle arrive donc du serveur, sous le code
 * métier identity.password_compromised (voir server-errors.ts).
 *
 * Fichier volontairement dupliqué dans les deux portails : le monorepo n'a pas
 * de paquet partagé entre frontend-b2c et frontend-b2b, et introduire cette
 * plomberie pour trois constantes coûterait plus qu'elle ne rapporte. Toute
 * modification ici doit être reportée dans l'autre portail.
 */
import { z } from "zod";

/** Miroir de PASSWORD_MIN_LENGTH (backend, identity/domain/value_objects.py). */
export const PASSWORD_MIN_LENGTH = 14;

/**
 * Miroir de PASSWORD_MAX_LENGTH. Ce n'est pas une règle métier mais un
 * garde-fou technique : Argon2 hache l'entrée telle quelle côté serveur.
 */
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Seuil purement VISUEL à partir duquel l'indicateur affiche « Solide ».
 * Il n'a aucune conséquence sur l'acceptation : à 14 caractères le mot de
 * passe est déjà valide. Il sert à encourager d'aller plus loin.
 */
export const STRONG_PASSWORD_LENGTH = 20;

/**
 * Le schéma zod du champ mot de passe des formulaires d'INSCRIPTION.
 *
 * Réservé à la création de compte : les écrans de connexion se contentent
 * d'un `min(1)`. Y annoncer la politique donnerait un indice à un attaquant
 * et bloquerait les comptes créés avant son durcissement.
 */
export const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`,
  )
  .max(
    PASSWORD_MAX_LENGTH,
    `Le mot de passe ne peut pas dépasser ${PASSWORD_MAX_LENGTH} caractères.`,
  );
