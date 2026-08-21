/**
 * Onglet "Ma clinique" : le formulaire d'édition de la fiche clinique.
 *
 * Clone du pattern canonique du projet (profile-form du portail B2C) :
 * 1. PRÉ-REMPLISSAGE : l'option `values:` de react-hook-form (et non
 *    defaultValues seuls) resynchronise le formulaire quand la query
 *    /clinics/me arrive ou change ;
 * 2. ADRESSE TOUT-OU-RIEN : le backend attend `address: null` si aucune
 *    adresse (jamais un objet vide) ; le schéma zod garantit qu'une
 *    adresse entamée est complète ;
 * 3. SELECT CONTRÔLÉ : le Select Base UI du fuseau horaire passe par
 *    <Controller> (value / onValueChange).
 * Le PUT est un remplacement COMPLET de la fiche : tous les champs
 * partent à chaque enregistrement. L'email n'apparaît pas : identifiant
 * d'inscription, il est absent du schéma d'update backend (immuable).
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { ApiError } from "@/lib/api/errors";
import {
  getGetMyClinicQueryKey,
  useGetMyClinic,
  useUpdateMyClinic,
} from "@/lib/api/generated/clinics/clinics";
import type { ClinicProfileResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { applyServerErrors } from "@/lib/auth/server-errors";
import {
  clinicSettingsSchema,
  type ClinicSettingsFormValues,
} from "@/lib/clinic/schemas";

// Le portail cible la France : le pays part en constante dans chaque
// adresse envoyée au backend (comme sur le portail B2C).
const COUNTRY_FR = "FR";

// Champs "plats" que ce formulaire affiche : une erreur 422 sur un champ
// imbriqué (loc = ["body", "address", ...]) ou inconnu part dans le
// bandeau global (voir applyServerErrors).
const KNOWN_FIELDS = ["name", "phone", "timezone"] as const;

// Fuseaux proposés (identifiants IANA), extensibles : le backend valide
// via zoneinfo, cette liste ne fait que borner l'UI aux fuseaux des
// marchés visés.
const TIMEZONES = ["Europe/Paris", "Europe/Brussels", "Europe/Zurich"];

/**
 * Traduit la réponse API (nullable) en valeurs de formulaire (chaînes).
 * Un <input> ne sait pas afficher null : chaque champ absent devient "",
 * et l'envoi fera la conversion inverse ("" -> null).
 */
function toFormValues(clinic: ClinicProfileResponse): ClinicSettingsFormValues {
  return {
    name: clinic.name,
    phone: clinic.phone ?? "",
    address: {
      line1: clinic.address?.line1 ?? "",
      line2: clinic.address?.line2 ?? "",
      postal_code: clinic.address?.postal_code ?? "",
      city: clinic.address?.city ?? "",
    },
    timezone: clinic.timezone,
  };
}

export function ClinicForm() {
  const queryClient = useQueryClient();
  const clinicQuery = useGetMyClinic({
    query: { select: (res) => res.data },
  });
  const clinic = clinicQuery.data;
  // TError = ApiError : le mutator jette toujours un ApiError normalisé.
  const updateMutation = useUpdateMyClinic<ApiError>();

  const formValues = useMemo(
    () => (clinic !== undefined ? toFormValues(clinic) : undefined),
    [clinic],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ClinicSettingsFormValues>({
    resolver: zodResolver(clinicSettingsSchema),
    // defaultValues AVANT l'arrivee de la query : sans eux, field.value du
    // Select timezone serait undefined au premier rendu -> Base UI verrait
    // un composant non controle devenir controle (warning console).
    defaultValues: {
      name: "",
      phone: "",
      address: { line1: "", line2: "", postal_code: "", city: "" },
      timezone: "Europe/Paris",
    },
    // values (et PAS defaultValues seuls) : resynchronise le formulaire
    // chaque fois que la donnée /clinics/me change.
    values: formValues,
    // Si une resynchronisation survient PENDANT une saisie, on garde les
    // champs déjà modifiés par l'utilisateur au lieu de les écraser.
    resetOptions: { keepDirtyValues: true },
  });

  const onSubmit = handleSubmit(async (values) => {
    // Adresse tout-ou-rien : le superRefine du schéma garantit qu'ici
    // l'adresse est soit entièrement vide, soit complète — line1 suffit
    // comme sentinelle. Le backend attend address: null quand il n'y a
    // pas d'adresse, JAMAIS un objet aux champs vides (422).
    const hasAddress = values.address.line1 !== "";

    try {
      const res = await updateMutation.mutateAsync({
        data: {
          name: values.name,
          // "" -> null : phone est nullable côté backend.
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
          timezone: values.timezone,
        },
      });

      // La réponse du PUT est la fiche à jour : on remplace directement
      // l'entrée de cache de /clinics/me, sans requête supplémentaire.
      queryClient.setQueryData(getGetMyClinicQueryKey(), res);

      // Test de statut : uniquement pour rétrécir le type TypeScript
      // (l'union générée par Orval inclut la variante 422) — le mutator
      // jette sur tout statut >= 400, on est forcément en 200 ici.
      if (res.status === 200) {
        // reset avec les valeurs serveur : efface les drapeaux "dirty".
        reset(toFormValues(res.data));
      }
      // Confirmation éphémère (toast) : disparaît seule, pas d'état
      // local à masquer à la frappe suivante.
      toast.success("Réglages enregistrés");
    } catch (error) {
      applyServerErrors(error, setError, KNOWN_FIELDS);
    }
  });

  // Garde-fou de l'instant de chargement de la query (et rétrécissement
  // TypeScript de undefined).
  if (clinic === undefined) {
    return null;
  }

  // Défensif : si la clinique a déjà un fuseau hors de la liste (posé en
  // base autrement), on l'ajoute aux options pour ne pas afficher un
  // Select vide ni l'écraser silencieusement au premier enregistrement.
  const timezoneOptions = TIMEZONES.includes(clinic.timezone)
    ? TIMEZONES
    : [...TIMEZONES, clinic.timezone];
  const timezoneItems = timezoneOptions.map((tz) => ({
    value: tz,
    label: tz,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ma clinique</CardTitle>
        <CardDescription>
          Coordonnées et fuseau horaire de votre clinique.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* noValidate : validation confiée à zod. */}
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {errors.root?.server && (
              <Alert variant="destructive">
                <AlertTitle>{errors.root.server.message}</AlertTitle>
              </Alert>
            )}

            {/* Nom + téléphone côte à côte sur écran large : même
                pattern que le duo code postal / ville plus bas. */}
            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="clinic-name">
                  Nom de la clinique
                </FieldLabel>
                <Input
                  id="clinic-name"
                  type="text"
                  autoComplete="organization"
                  aria-invalid={!!errors.name}
                  {...register("name")}
                />
                <FieldError errors={[errors.name]} />
              </Field>

              <Field data-invalid={!!errors.phone}>
                <FieldLabel htmlFor="clinic-phone">
                  Téléphone{" "}
                  <span className="font-normal text-muted-foreground">
                    (optionnel)
                  </span>
                </FieldLabel>
                <Input
                  id="clinic-phone"
                  type="tel"
                  autoComplete="tel"
                  aria-invalid={!!errors.phone}
                  {...register("phone")}
                />
                <FieldError errors={[errors.phone]} />
              </Field>
            </div>

            <FieldSet>
              <FieldLegend>Adresse</FieldLegend>
              <FieldDescription>
                Facultative. Si vous la renseignez, l&apos;adresse, le code
                postal et la ville sont requis.
              </FieldDescription>
              <FieldGroup>
                <Field data-invalid={!!errors.address?.line1}>
                  <FieldLabel htmlFor="clinic-address-line1">
                    Adresse (ligne 1)
                  </FieldLabel>
                  <Input
                    id="clinic-address-line1"
                    type="text"
                    autoComplete="address-line1"
                    placeholder="12 rue des Lilas"
                    aria-invalid={!!errors.address?.line1}
                    {...register("address.line1")}
                  />
                  <FieldError errors={[errors.address?.line1]} />
                </Field>

                <Field data-invalid={!!errors.address?.line2}>
                  <FieldLabel htmlFor="clinic-address-line2">
                    Complément{" "}
                    <span className="font-normal text-muted-foreground">
                      (optionnel)
                    </span>
                  </FieldLabel>
                  <Input
                    id="clinic-address-line2"
                    type="text"
                    autoComplete="address-line2"
                    placeholder="Bâtiment B"
                    aria-invalid={!!errors.address?.line2}
                    {...register("address.line2")}
                  />
                  <FieldError errors={[errors.address?.line2]} />
                </Field>

                <div className="grid gap-6 sm:grid-cols-[10rem_1fr]">
                  <Field data-invalid={!!errors.address?.postal_code}>
                    <FieldLabel htmlFor="clinic-address-postal-code">
                      Code postal
                    </FieldLabel>
                    <Input
                      id="clinic-address-postal-code"
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
                    <FieldLabel htmlFor="clinic-address-city">Ville</FieldLabel>
                    <Input
                      id="clinic-address-city"
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

            <Field data-invalid={!!errors.timezone}>
              <FieldLabel>Fuseau horaire</FieldLabel>
              <FieldDescription>
                Tous les horaires de rendez-vous sont interprétés dans ce
                fuseau.
              </FieldDescription>
              {/* Select Base UI = composant contrôlé : Controller relie
                  value/onValueChange à react-hook-form. */}
              <Controller
                control={control}
                name="timezone"
                render={({ field }) => (
                  <Select
                    items={timezoneItems}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value ?? "")}
                  >
                    <SelectTrigger
                      className="w-64"
                      aria-invalid={!!errors.timezone}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timezoneItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.timezone]} />
            </Field>

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
