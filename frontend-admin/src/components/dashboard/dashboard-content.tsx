/**
 * Contenu de l'écran d'accueil du back-office.
 *
 * Volontairement minimal tant que les endpoints de données n'existent pas :
 * plutôt qu'un tableau de bord factice avec des chiffres inventés, on annonce
 * ce qui arrive. Un écran honnête vaut mieux qu'une maquette.
 *
 * Composition standard de tous les écrans de la console :
 * PageContainer > PageHeader > contenu. La largeur n'est décidée nulle part
 * ici -- PageContainer est le seul à en avoir le droit (voir CLAUDE.md).
 */
"use client";

import { Building2Icon, StethoscopeIcon, UsersIcon } from "lucide-react";

import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCurrentAdmin } from "@/lib/auth/use-current-admin";

/** Les trois populations que la console administre, et leur couleur. */
const SECTIONS = [
  {
    titre: "Cliniques",
    description:
      "Lister, créer, éditer et suspendre les cliniques de la plateforme.",
    icon: Building2Icon,
    // chart-1..3 : la console EMPRUNTE la couleur de chaque produit pour
    // désigner sa population (voir globals.css).
    teinte: "text-chart-1",
  },
  {
    titre: "Propriétaires",
    description: "Consulter et gérer les comptes du portail propriétaires.",
    icon: UsersIcon,
    teinte: "text-chart-2",
  },
  {
    titre: "Personnel",
    description:
      "Le personnel de toutes les cliniques : rôles et accès, vue transverse.",
    icon: StethoscopeIcon,
    teinte: "text-chart-3",
  },
] as const;

export function DashboardContent() {
  const { data: admin } = useCurrentAdmin();

  return (
    <PageContainer>
      <PageHeader
        title="Console d'administration"
        description={
          admin === undefined
            ? "Vue d'ensemble de la plateforme VetoLib."
            : `Bonjour ${admin.first_name}. Vue d'ensemble de la plateforme VetoLib.`
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map((section) => (
          <Card key={section.titre}>
            <CardHeader>
              <section.icon className={`size-5 ${section.teinte}`} aria-hidden />
              <CardTitle>{section.titre}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
