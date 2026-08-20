/**
 * Carte "Mon profil" : le formulaire d'édition de la fiche propriétaire.
 *
 * C'est le formulaire le plus complet du portail, avec trois mécanismes
 * à connaître :
 * 1. PRÉ-REMPLISSAGE : l'option `values:` de react-hook-form (et non
 *    defaultValues seuls) resynchronise le formulaire quand la query /me
 *    arrive ou change — defaultValues n'est lu qu'AU PREMIER montage,
 *    donc un formulaire monté avant la réponse resterait vide sans ça ;
 * 2. ADRESSE TOUT-OU-RIEN : le backend attend `address: null` si aucune
 *    adresse (jamais un objet vide) ; le schéma zod garantit qu'une
 *    adresse entamée est complète, et l'envoi traduit "tout vide" en null ;
 * 3. CHECKBOX CONTRÔLÉES : la Checkbox Base UI n'expose pas de value
 *    lisible par register() ; les deux cases de préférences passent donc
 *    par <Controller> (checked / onCheckedChange).
 * Le PUT est un remplacement COMPLET de la fiche : tous les champs
 * partent à chaque enregistrement, y compris ceux non modifiés.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ApiError } from "@/lib/api/errors";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { useUpdateOwnerProfile } from "@/lib/api/generated/owner-profile/owner-profile";
import type { OwnerResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { applyServerErrors } from "@/lib/auth/server-errors";
import { profileSchema, type ProfileFormValues } from "@/lib/auth/schemas";
import { useCurrentUser } from "@/lib/auth/use-current-user";

// Le portail cible la France : le pays n'est pas un champ du formulaire,
// il part en constante dans chaque adresse envoyée au backend.
const COUNTRY_FR = "FR";

// Champs "plats" que ce formulaire affiche : une erreur 422 sur un champ
// imbriqué (loc = ["body", "address", ...]) ou inconnu part dans le
// bandeau global (voir applyServerErrors).
const KNOWN_FIELDS = ["first_name", "last_name", "phone"] as const;

/**
 * Traduit la réponse API (nullable) en valeurs de formulaire (chaînes).
 * Un <input> ne sait pas afficher null : chaque champ absent devient "",
 * et l'envoi fera la conversion inverse ("" -> null).
 */
function toFormValues(owner: OwnerResponse): ProfileFormValues {
  return {
    first_name: owner.first_name,
    last_name: owner.last_name,
    phone: owner.phone ?? "",
    address: {
      line1: owner.address?.line1 ?? "",
      line2: owner.address?.line2 ?? "",
      postal_code: owner.address?.postal_code ?? "",
      city: owner.address?.city ?? "",
    },
    notification_preferences: {
      // ?? : miroir des défauts du domaine backend (email opt-in par
      // défaut, SMS non) au cas où l'API omettrait un canal.
      email: owner.notification_preferences.email ?? true,
      sms: owner.notification_preferences.sms ?? false,
    },
  };
}

export function ProfileForm() {
  const queryClient = useQueryClient();
  const { data: owner } = useCurrentUser();
  // TError = ApiError : le mutator jette toujours un ApiError normalisé.
  const updateMutation = useUpdateOwnerProfile<ApiError>();

  // Message "Profil enregistré" : affiché après un succès, masqué dès la
  // modification suivante (onChange du <form> + onCheckedChange des
  // cases). Un état local suffit : c'est une info éphémère d'UI, pas une
  // donnée serveur à mettre en cache.
  const [saved, setSaved] = useState(false);

  // useMemo : `values` est comparé en profondeur par react-hook-form,
  // mais autant ne pas reconstruire l'objet à chaque rendu pour rien.
  const formValues = useMemo(
    () => (owner !== undefined ? toFormValues(owner) : undefined),
    [owner],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    // values (et PAS defaultValues seuls) : resynchronise le formulaire
    // chaque fois que la donnée /me change (arrivée de la query, mise à
    // jour du cache après enregistrement...).
    values: formValues,
    // Si une resynchronisation survient PENDANT une saisie (refetch de
    // /me en arrière-plan), on garde les champs déjà modifiés par
    // l'utilisateur au lieu de les écraser.
    resetOptions: { keepDirtyValues: true },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false);

    // Adresse tout-ou-rien : le superRefine du schéma garantit qu'ici
    // l'adresse est soit entièrement vide (les quatre champs, complément
    // inclus), soit complète — line1 suffit donc comme sentinelle. Le
    // backend attend address: null quand il n'y a pas d'adresse — JAMAIS
    // un objet aux champs vides (422).
    const hasAddress = values.address.line1 !== "";

    try {
      const res = await updateMutation.mutateAsync({
        data: {
          first_name: values.first_name,
          last_name: values.last_name,
          // "" -> null : phone est nullable côté backend, une chaîne
          // vide échouerait sa validation.
          phone: values.phone || null,
          address: hasAddress
            ? {
                line1: values.address.line1,
                line2: values.address.line2 || null,
                postal_code: values.address.postal_code,
                city: values.address.city,
                country: COUNTRY_FR,
              }
            : null,
          notification_preferences: values.notification_preferences,
        },
      });

      // La réponse du PUT est le OwnerResponse à jour : on remplace
      // directement l'entrée de cache de /me. Tous les composants qui
      // lisent useCurrentUser (en-tête, carte compte...) se mettent à
      // jour sans requête supplémentaire.
      queryClient.setQueryData(getGetCurrentOwnerQueryKey(), res);

      // Le mutator jette sur tout statut >= 400 : à l'exécution on est
      // forcément en 200 ici. Ce test sert uniquement à rétrécir le type
      // TypeScript (l'union générée par Orval inclut la variante 422).
      if (res.status === 200) {
        // reset avec les valeurs serveur : efface les drapeaux "dirty"
        // pour repartir d'un formulaire propre, aligné sur le cache.
        reset(toFormValues(res.data));
      }
      setSaved(true);
    } catch (error) {
      applyServerErrors(error, setError, KNOWN_FIELDS);
    }
  });

  // L'AuthGuard (layout parent) garantit qu'on n'arrive ici que
  // connecté ; ce garde-fou couvre l'instant de transition où la query
  // n'est pas encore résolue (et rassure TypeScript sur undefined).
  if (owner === undefined) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mon profil</CardTitle>
        <CardDescription>
          Vos coordonnées et vos préférences de rappels.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* onChange sur le <form> : toute frappe dans un champ masque le
            message "Profil enregistré" (les resynchronisations
            programmatiques via reset/values ne déclenchent PAS cet
            événement DOM, donc ne le masquent pas à tort). noValidate :
            validation confiée à zod, pas aux bulles du navigateur. */}
        <form onSubmit={onSubmit} onChange={() => setSaved(false)} noValidate>
          <FieldGroup>
            {errors.root?.server && (
              <Alert variant="destructive">
                <AlertTitle>{errors.root.server.message}</AlertTitle>
              </Alert>
            )}

            {/* Confirmation inline (variante par défaut, pas destructive) :
                visible jusqu'à la prochaine modification du formulaire. */}
            {saved && (
              <Alert>
                <AlertTitle>Profil enregistré</AlertTitle>
              </Alert>
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={!!errors.first_name}>
                <FieldLabel htmlFor="profile-first-name">Prénom</FieldLabel>
                <Input
                  id="profile-first-name"
                  type="text"
                  autoComplete="given-name"
                  aria-invalid={!!errors.first_name}
                  {...register("first_name")}
                />
                <FieldError errors={[errors.first_name]} />
              </Field>

              <Field data-invalid={!!errors.last_name}>
                <FieldLabel htmlFor="profile-last-name">Nom</FieldLabel>
                <Input
                  id="profile-last-name"
                  type="text"
                  autoComplete="family-name"
                  aria-invalid={!!errors.last_name}
                  {...register("last_name")}
                />
                <FieldError errors={[errors.last_name]} />
              </Field>
            </div>

            <Field data-invalid={!!errors.phone}>
              <FieldLabel htmlFor="profile-phone">
                Téléphone{" "}
                <span className="font-normal text-muted-foreground">
                  (optionnel)
                </span>
              </FieldLabel>
              <Input
                id="profile-phone"
                type="tel"
                autoComplete="tel"
                aria-invalid={!!errors.phone}
                {...register("phone")}
              />
              <FieldError errors={[errors.phone]} />
            </Field>

            {/* FieldSet/FieldLegend : groupe sémantique <fieldset> — les
                lecteurs d'écran annoncent "Adresse" avant chaque champ
                du bloc. */}
            <FieldSet>
              <FieldLegend>Adresse</FieldLegend>
              <FieldDescription>
                Facultative. Si vous la renseignez, l&apos;adresse, le code
                postal et la ville sont requis.
              </FieldDescription>
              <FieldGroup>
                <Field data-invalid={!!errors.address?.line1}>
                  <FieldLabel htmlFor="profile-address-line1">
                    Adresse (ligne 1)
                  </FieldLabel>
                  <Input
                    id="profile-address-line1"
                    type="text"
                    autoComplete="address-line1"
                    placeholder="12 rue des Lilas"
                    aria-invalid={!!errors.address?.line1}
                    {...register("address.line1")}
                  />
                  <FieldError errors={[errors.address?.line1]} />
                </Field>

                <Field data-invalid={!!errors.address?.line2}>
                  <FieldLabel htmlFor="profile-address-line2">
                    Complément{" "}
                    <span className="font-normal text-muted-foreground">
                      (optionnel)
                    </span>
                  </FieldLabel>
                  <Input
                    id="profile-address-line2"
                    type="text"
                    autoComplete="address-line2"
                    placeholder="Bâtiment B, 3e étage"
                    aria-invalid={!!errors.address?.line2}
                    {...register("address.line2")}
                  />
                  <FieldError errors={[errors.address?.line2]} />
                </Field>

                <div className="grid gap-6 sm:grid-cols-[10rem_1fr]">
                  <Field data-invalid={!!errors.address?.postal_code}>
                    <FieldLabel htmlFor="profile-address-postal-code">
                      Code postal
                    </FieldLabel>
                    <Input
                      id="profile-address-postal-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="75011"
                      aria-invalid={!!errors.address?.postal_code}
                      {...register("address.postal_code")}
                    />
                    <FieldError errors={[errors.address?.postal_code]} />
                  </Field>

                  <Field data-invalid={!!errors.address?.city}>
                    <FieldLabel htmlFor="profile-address-city">Ville</FieldLabel>
                    <Input
                      id="profile-address-city"
                      type="text"
                      autoComplete="address-level2"
                      placeholder="Paris"
                      aria-invalid={!!errors.address?.city}
                      {...register("address.city")}
                    />
                    <FieldError errors={[errors.address?.city]} />
                  </Field>
                </div>
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Rappels</FieldLegend>
              <FieldDescription>
                Comment souhaitez-vous recevoir les rappels de rendez-vous et
                de vaccins de vos animaux ?
              </FieldDescription>
              <FieldGroup className="gap-3">
                {/* Checkbox Base UI = composant CONTRÔLÉ : pas de value
                    exploitable par register(), on passe par Controller
                    qui relie checked/onCheckedChange à l'état
                    react-hook-form. setSaved(false) est appelé ici
                    explicitement car le clic sur la case ne déclenche pas
                    le onChange DOM du <form>. */}
                <Field orientation="horizontal">
                  <Controller
                    control={control}
                    name="notification_preferences.email"
                    render={({ field }) => (
                      <Checkbox
                        id="profile-notif-email"
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          setSaved(false);
                          field.onChange(checked);
                        }}
                      />
                    )}
                  />
                  <FieldLabel
                    htmlFor="profile-notif-email"
                    className="font-normal"
                  >
                    Rappels par email
                  </FieldLabel>
                </Field>

                <Field orientation="horizontal">
                  <Controller
                    control={control}
                    name="notification_preferences.sms"
                    render={({ field }) => (
                      <Checkbox
                        id="profile-notif-sms"
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          setSaved(false);
                          field.onChange(checked);
                        }}
                      />
                    )}
                  />
                  <FieldLabel
                    htmlFor="profile-notif-sms"
                    className="font-normal"
                  >
                    Rappels par SMS
                  </FieldLabel>
                </Field>
              </FieldGroup>
            </FieldSet>

            <div>
              {/* disabled pendant la soumission : pas de double PUT. */}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner data-icon="inline-start" />}
                Enregistrer
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
