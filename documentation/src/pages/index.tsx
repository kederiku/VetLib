/**
 * Page d'accueil du site de documentation.
 *
 * Règle de style : on n'utilise QUE les classes du système Infima livré avec Docusaurus
 * (hero, button, card, container/row/col) et les composants @theme/*. Le CSS local se
 * limite à une poignée de règles de mise en page dans index.module.css. C'est la
 * transposition, pour ce site, de la règle du dépôt « utiliser les composants existants,
 * pas de CSS maison » : ici, le système de composants s'appelle Infima, pas shadcn/ui.
 */
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import CodeBlock from "@theme/CodeBlock";
import Heading from "@theme/Heading";
import Layout from "@theme/Layout";
import clsx from "clsx";
import type { ReactNode } from "react";

import styles from "./index.module.css";

/** Les quatre partis pris techniques les plus structurants, mis en avant dès l'accueil. */
const POINTS_SAILLANTS = [
  {
    titre: "Multi-tenant par RLS",
    texte:
      "Une base unique pour toutes les cliniques, mais l'isolation est garantie par " +
      "PostgreSQL lui-même : un WHERE oublié ne peut pas provoquer de fuite.",
    lien: "/docs/architecture/multi-tenant-et-rls",
  },
  {
    titre: "Hexagonal et DDD",
    texte:
      "Quatre couches, un domaine sans le moindre import de framework, et une " +
      "organisation par contexte métier plutôt que par couche technique.",
    lien: "/docs/architecture/architecture-hexagonale",
  },
  {
    titre: "Pattern Outbox",
    texte:
      "Aucun effet de bord n'est publié hors de la transaction qui l'a produit : " +
      "l'événement s'écrit en base, un relais le publie ensuite.",
    lien: "/docs/architecture/evenements-et-outbox",
  },
  {
    titre: "Une CI verrouillée",
    texte:
      "Douze contrôles convergent vers un job unique, seul check exigé par la branche " +
      "protégée. Aucun contournement silencieux.",
    lien: "/docs/exploitation/pipeline-ci",
  },
];

/** Les briques du monorepo, telles qu'elles apparaissent à la racine du dépôt. */
const BRIQUES = [
  {
    chemin: "backend/",
    role: "API FastAPI, hexagonale et DDD, 4 bounded contexts",
    lien: "/docs/backend/organisation-du-code",
  },
  {
    chemin: "frontend-b2c/",
    role: "Portail des propriétaires d'animaux (Next.js, :3000)",
    lien: "/docs/frontends/les-applications-next",
  },
  {
    chemin: "frontend-b2b/",
    role: "Portail des cliniques (Next.js, :3001)",
    lien: "/docs/frontends/les-applications-next",
  },
  {
    chemin: "frontend-admin/",
    role: "Back-office de la plateforme (Next.js, :3003)",
    lien: "/docs/frontends/back-office-plateforme",
  },
  {
    chemin: "docker/",
    role: "Dockerfiles et scripts d'initialisation",
    lien: "/docs/exploitation/stack-docker",
  },
  {
    chemin: "documentation/",
    role: "Ce site",
    lien: "/docs/contribuer/rediger-la-documentation",
  },
];

function Banniere(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx("hero hero--primary", styles.banniere)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.boutons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/demarrer/installation"
          >
            Démarrer en 10 minutes
          </Link>
          <Link
            className="button button--outline button--secondary button--lg"
            to="/docs/architecture/vue-d-ensemble"
          >
            Comprendre l&apos;architecture
          </Link>
        </div>
      </div>
    </header>
  );
}

function PointsSaillants(): ReactNode {
  return (
    <section className={styles.section}>
      <div className="container">
        <div className="row">
          {POINTS_SAILLANTS.map((point) => (
            <div key={point.titre} className="col col--3">
              <div className={clsx("card", styles.carte)}>
                <div className="card__header">
                  <Heading as="h3">{point.titre}</Heading>
                </div>
                <div className="card__body">
                  <p>{point.texte}</p>
                </div>
                <div className="card__footer">
                  <Link className="button button--link" to={point.lien}>
                    En savoir plus
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Demarrage(): ReactNode {
  return (
    <section className={clsx(styles.section, styles.sectionAlternee)}>
      <div className="container">
        <div className="row">
          <div className="col col--6">
            <Heading as="h2">Démarrer en trois commandes</Heading>
            <p>
              Le Makefile racine est le point d&apos;entrée unique de toutes les
              commandes du projet. Il délègue au Makefile du backend et pilote
              les trois applications Next.
            </p>
            <Link
              className="button button--primary"
              to="/docs/demarrer/commandes-make"
            >
              Toutes les commandes
            </Link>
          </div>
          <div className="col col--6">
            <CodeBlock language="bash">
              {[
                "make env      # copie les deux fichiers d'environnement",
                "make up       # postgres, redis, minio, api, worker",
                "make migrate  # applique les migrations Alembic",
              ].join("\n")}
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}

function Monorepo(): ReactNode {
  return (
    <section className={styles.section}>
      <div className="container">
        <Heading as="h2">Le monorepo en un coup d&apos;oeil</Heading>
        <table>
          <thead>
            <tr>
              <th>Dossier</th>
              <th>Rôle</th>
            </tr>
          </thead>
          <tbody>
            {BRIQUES.map((brique) => (
              <tr key={brique.chemin}>
                <td>
                  <code>{brique.chemin}</code>
                </td>
                <td>
                  <Link to={brique.lien}>{brique.role}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Accueil(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Documentation" description={siteConfig.tagline}>
      <Banniere />
      <main>
        <PointsSaillants />
        <Demarrage />
        <Monorepo />
      </main>
    </Layout>
  );
}
