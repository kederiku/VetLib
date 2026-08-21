/**
 * Champ mot de passe avec bouton "afficher/masquer" (icône œil).
 *
 * Construit sur le composant ui/input-group : le champ et le bouton
 * partagent la même bordure et le même anneau de focus, comme un seul
 * contrôle. Le toggle bascule l'attribut type entre password et text ;
 * c'est purement visuel, la valeur du champ ne change pas.
 *
 * Le composant accepte toutes les props d'un <input> natif et les
 * transmet telles quelles (spread) : il fonctionne donc directement avec
 * {...register("password")} de react-hook-form. En React 19, ref est une
 * prop comme les autres (plus besoin de forwardRef) : la ref posée par
 * register() traverse le spread jusqu'à l'input.
 */
"use client";

import { Eye, EyeOff } from "lucide-react";
import * as React from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

export function PasswordInput({
  className,
  ...props
}: // type est exclu : c'est précisément la prop que ce composant pilote.
Omit<React.ComponentProps<"input">, "type">) {
  // visible = true : le mot de passe s'affiche en clair (type="text").
  const [visible, setVisible] = React.useState(false);

  return (
    <InputGroup className={className}>
      <InputGroupInput type={visible ? "text" : "password"} {...props} />
      <InputGroupAddon align="inline-end">
        {/* tabIndex={-1} : le bouton est sorti de l'ordre de tabulation.
            Au clavier, Tab passe du mot de passe au champ suivant sans
            s'arrêter sur l'œil (un utilisateur de lecteur d'écran n'a
            pas besoin de "voir" le mot de passe) ; l'aria-label décrit
            néanmoins l'action pour qui atteint le bouton autrement. */}
        <InputGroupButton
          size="icon-sm"
          tabIndex={-1}
          aria-label={
            visible ? "Masquer le mot de passe" : "Afficher le mot de passe"
          }
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
