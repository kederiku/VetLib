/**
 * Bloc de champs d'adresse, partagé par tous les formulaires qui en ont un.
 *
 * Trois l'utilisent aujourd'hui (création et édition d'une clinique, édition
 * d'un propriétaire) et l'affichent à l'identique, règle tout-ou-rien
 * comprise. Une divergence entre eux serait invisible jusqu'à ce qu'un
 * utilisateur la rencontre.
 *
 * Le pays n'est PAS un champ : le backend accepte n'importe quel code à deux
 * lettres, mais le produit ne s'adresse aujourd'hui qu'à des cliniques
 * françaises. Offrir un sélecteur de pays suggérerait une capacité qui
 * n'existe pas ailleurs dans le produit (validation du code postal,
 * fuseaux, facturation).
 */
"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** Forme minimale commune aux deux formulaires qui utilisent ce bloc. */
type ValeursAvecAdresse = {
  address: {
    line1?: string;
    line2?: string;
    postal_code?: string;
    city?: string;
  };
};

export function AddressFields<T extends ValeursAvecAdresse>({
  register,
  errors,
  prefixeId,
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  /** Préfixe des id : deux formulaires peuvent coexister dans le DOM. */
  prefixeId: string;
}) {
  // Le cast est nécessaire : react-hook-form ne sait pas relier un chemin
  // générique "address.line1" au type T sans un typage bien plus lourd, pour
  // un gain nul ici (les quatre chemins sont écrits en dur juste en dessous).
  const champs = errors as FieldErrors<ValeursAvecAdresse>;
  const inscrire = register as unknown as UseFormRegister<ValeursAvecAdresse>;

  return (
    <FieldGroup>
      <Field data-invalid={!!champs.address?.line1}>
        <FieldLabel htmlFor={`${prefixeId}-line1`}>Adresse</FieldLabel>
        <Input
          id={`${prefixeId}-line1`}
          autoComplete="address-line1"
          aria-invalid={!!champs.address?.line1}
          {...inscrire("address.line1")}
        />
        <FieldError errors={[champs.address?.line1]} />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${prefixeId}-line2`}>
          Complément d&apos;adresse
        </FieldLabel>
        <Input
          id={`${prefixeId}-line2`}
          autoComplete="address-line2"
          {...inscrire("address.line2")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <Field data-invalid={!!champs.address?.postal_code}>
          <FieldLabel htmlFor={`${prefixeId}-postal`}>Code postal</FieldLabel>
          <Input
            id={`${prefixeId}-postal`}
            inputMode="numeric"
            autoComplete="postal-code"
            aria-invalid={!!champs.address?.postal_code}
            {...inscrire("address.postal_code")}
          />
          <FieldError errors={[champs.address?.postal_code]} />
        </Field>

        <Field data-invalid={!!champs.address?.city}>
          <FieldLabel htmlFor={`${prefixeId}-city`}>Ville</FieldLabel>
          <Input
            id={`${prefixeId}-city`}
            autoComplete="address-level2"
            aria-invalid={!!champs.address?.city}
            {...inscrire("address.city")}
          />
          <FieldError errors={[champs.address?.city]} />
        </Field>
      </div>
    </FieldGroup>
  );
}
