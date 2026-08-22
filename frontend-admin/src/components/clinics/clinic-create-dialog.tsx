/**
 * Dialogue de création d'une clinique, avec son premier gérant en option.
 *
 * Le mot de passe du gérant n'est PAS un champ du formulaire : le backend le
 * génère et le renvoie une seule fois. Le dialogue bascule alors sur un écran
 * de remise, avec un bouton « copier » et un avertissement — c'est le SEUL
 * moment où ce secret est lisible, aucune route ne permet de le relire.
 *
 * La case « créer aussi un gérant » est cochée par défaut : c'est le cas
 * courant. Mais elle est décochable, parce que « je crée la clinique
 * aujourd'hui, j'ajoute les gérants demain » est un flux réel que le backend
 * accepte.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { AddressFields } from "@/components/shared/address-fields";
import { TemporaryPasswordPanel } from "@/components/staff/temporary-password-panel";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { type ApiError, getApiError } from "@/lib/api/errors";
import { useCreateAdminClinic } from "@/lib/api/generated/admin-clinics/admin-clinics";
import type { AdminStaffCreatedResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { applyServerErrors } from "@/lib/auth/server-errors";
import { useInvaliderCliniques } from "@/lib/clinics/mutations";
import {
  clinicCreateSchema,
  type ClinicCreateValues,
} from "@/lib/clinics/schemas";

const CHAMPS_CONNUS = [
  "name",
  "email",
  "phone",
  "timezone",
  "manager_email",
  "manager_first_name",
  "manager_last_name",
] as const;

export function ClinicCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (ouvert: boolean) => void;
}) {
  const router = useRouter();
  const invalider = useInvaliderCliniques();
  const mutation = useCreateAdminClinic<ApiError>();
  // Écran de remise du mot de passe : tant qu'il est affiché, le dialogue ne
  // se ferme pas tout seul. Fermer avant que l'administrateur ait copié le
  // secret le perdrait définitivement.
  const [remise, setRemise] = useState<{
    clinicId: string;
    gerant: AdminStaffCreatedResponse;
  } | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ClinicCreateValues>({
    resolver: zodResolver(clinicCreateSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      timezone: "Europe/Paris",
      address: { line1: "", line2: "", postal_code: "", city: "" },
      avecGerant: true,
      manager_email: "",
      manager_first_name: "",
      manager_last_name: "",
    },
  });

  // useWatch et non watch() : `watch` renvoie une fonction que le compilateur
  // React ne peut pas memoiser, ce qui lui fait renoncer a optimiser tout le
  // composant. useWatch s'abonne au seul champ utile et rend une valeur.
  const avecGerant = useWatch({ control, name: "avecGerant" });

  const soumettre = handleSubmit(async (valeurs) => {
    try {
      const reponse = await mutation.mutateAsync({
        data: {
          name: valeurs.name,
          email: valeurs.email,
          phone: valeurs.phone === "" ? null : (valeurs.phone ?? null),
          timezone: valeurs.timezone,
          address:
            valeurs.address.line1 === "" || valeurs.address.line1 === undefined
              ? null
              : {
                  line1: valeurs.address.line1,
                  line2:
                    valeurs.address.line2 === "" ? null : valeurs.address.line2,
                  postal_code: valeurs.address.postal_code ?? "",
                  city: valeurs.address.city ?? "",
                  country: "FR",
                },
          manager: valeurs.avecGerant
            ? {
                email: valeurs.manager_email ?? "",
                first_name: valeurs.manager_first_name ?? "",
                last_name: valeurs.manager_last_name ?? "",
              }
            : null,
        },
      });
      await invalider();
      // L'union generee inclut la variante 422 ; a l'execution le mutator a
      // deja jete sur tout statut >= 400, on est donc forcement en 201 ici --
      // le narrowing est pour TypeScript, pas pour le runtime.
      if (reponse.status !== 201) return;
      const creee = reponse.data;
      if (creee.manager !== null && creee.manager !== undefined) {
        setRemise({ clinicId: creee.clinic.id, gerant: creee.manager });
      } else {
        toast.success("Clinique créée");
        onOpenChange(false);
        router.push(`/cliniques/${creee.clinic.id}`);
      }
    } catch (erreur) {
      // Le backend verifie la disponibilite des DEUX adresses (celle de la
      // clinique, puis celle du gerant) et remonte le meme code metier pour
      // les deux. La table de `applyServerErrors` poserait donc toujours le
      // message sous « Email de contact » -- y compris quand c'est l'adresse
      // du gerant qui est prise, laissant l'utilisateur corriger le mauvais
      // champ. Le `detail` cite l'adresse fautive : on s'en sert pour viser
      // juste, et on retombe sur le traitement generique s'il ne dit rien.
      const api = getApiError(erreur);
      const emailGerant = (valeurs.manager_email ?? "").trim();
      if (
        api?.code === "identity.email_already_exists" &&
        emailGerant !== "" &&
        api.detail.includes(emailGerant)
      ) {
        setError("manager_email", {
          message: "Cette adresse email est déjà utilisée.",
        });
        return;
      }
      applyServerErrors(erreur, setError, CHAMPS_CONNUS);
    }
  });

  const terminer = () => {
    const destination = remise?.clinicId;
    setRemise(null);
    onOpenChange(false);
    if (destination !== undefined) router.push(`/cliniques/${destination}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(ouvert) => {
        // Tant que le mot de passe n'a pas été remis, on ne ferme que par le
        // bouton dédié : un clic à côté ferait perdre le secret.
        if (remise !== null) return;
        onOpenChange(ouvert);
      }}
    >
      {/* max-h + overflow : ce formulaire dépasse 1 000 px de haut, alors
          qu'un portable a souvent moins de 800 px de fenêtre. Le
          DialogContent du preset n'a AUCUNE contrainte de hauteur : sans
          ces classes, le dialogue est centré et déborde en haut comme en
          bas, rendant le titre et le bouton « Créer » inatteignables. */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {remise !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>Clinique créée</DialogTitle>
              <DialogDescription>
                Transmettez ces identifiants au gérant par un canal sûr.
              </DialogDescription>
            </DialogHeader>

            <TemporaryPasswordPanel compte={remise.gerant} prefixeId="creer" />

            <DialogFooter>
              <Button onClick={terminer}>J&apos;ai noté le mot de passe</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Nouvelle clinique</DialogTitle>
              <DialogDescription>
                La clinique et, si vous le souhaitez, son premier gérant.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={soumettre} noValidate>
              <FieldGroup>
                {errors.root?.server && (
                  <Alert variant="destructive">
                    <AlertTitle>{errors.root.server.message}</AlertTitle>
                  </Alert>
                )}

                <Field data-invalid={!!errors.name}>
                  <FieldLabel htmlFor="creer-name">
                    Nom de la clinique
                  </FieldLabel>
                  <Input
                    id="creer-name"
                    aria-invalid={!!errors.name}
                    {...register("name")}
                  />
                  <FieldError errors={[errors.name]} />
                </Field>

                <Field data-invalid={!!errors.email}>
                  <FieldLabel htmlFor="creer-email">
                    Email de contact
                  </FieldLabel>
                  <Input
                    id="creer-email"
                    type="email"
                    aria-invalid={!!errors.email}
                    {...register("email")}
                  />
                  <FieldDescription>
                    Adresse de la clinique, distincte de celle du gérant. Elle
                    ne pourra plus être modifiée.
                  </FieldDescription>
                  <FieldError errors={[errors.email]} />
                </Field>

                <Field data-invalid={!!errors.phone}>
                  <FieldLabel htmlFor="creer-phone">Téléphone</FieldLabel>
                  <Input
                    id="creer-phone"
                    autoComplete="tel"
                    aria-invalid={!!errors.phone}
                    {...register("phone")}
                  />
                  <FieldError errors={[errors.phone]} />
                </Field>

                <AddressFields
                  register={register}
                  errors={errors}
                  prefixeId="creer"
                />

                <FieldSeparator />

                <Field orientation="horizontal">
                  <FieldLabel htmlFor="creer-avec-gerant">
                    Créer aussi le premier gérant
                  </FieldLabel>
                  {/* Controller : le Switch de Base UI est un composant
                      CONTRÔLÉ, register() ne suffirait pas. */}
                  <Controller
                    control={control}
                    name="avecGerant"
                    render={({ field }) => (
                      <Switch
                        id="creer-avec-gerant"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                </Field>

                {avecGerant && (
                  <>
                    <Field data-invalid={!!errors.manager_email}>
                      <FieldLabel htmlFor="creer-gerant-email">
                        Email du gérant
                      </FieldLabel>
                      <Input
                        id="creer-gerant-email"
                        type="email"
                        aria-invalid={!!errors.manager_email}
                        {...register("manager_email")}
                      />
                      <FieldDescription>
                        Son identifiant de connexion. Le mot de passe est généré
                        et affiché une seule fois.
                      </FieldDescription>
                      <FieldError errors={[errors.manager_email]} />
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field data-invalid={!!errors.manager_first_name}>
                        <FieldLabel htmlFor="creer-gerant-prenom">
                          Prénom
                        </FieldLabel>
                        <Input
                          id="creer-gerant-prenom"
                          aria-invalid={!!errors.manager_first_name}
                          {...register("manager_first_name")}
                        />
                        <FieldError errors={[errors.manager_first_name]} />
                      </Field>
                      <Field data-invalid={!!errors.manager_last_name}>
                        <FieldLabel htmlFor="creer-gerant-nom">Nom</FieldLabel>
                        <Input
                          id="creer-gerant-nom"
                          aria-invalid={!!errors.manager_last_name}
                          {...register("manager_last_name")}
                        />
                        <FieldError errors={[errors.manager_last_name]} />
                      </Field>
                    </div>
                  </>
                )}

                <DialogFooter>
                  <DialogClose
                    render={<Button variant="outline" type="button" />}
                  >
                    Annuler
                  </DialogClose>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Spinner data-icon="inline-start" />}
                    Créer la clinique
                  </Button>
                </DialogFooter>
              </FieldGroup>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
