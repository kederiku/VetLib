/**
 * Audit des dépendances du site de documentation.
 *
 * Pourquoi un script plutôt que `npm audit --audit-level=high` directement ?
 * Parce que `npm audit` ne sait pas écarter UNE faille précise. Quand une faille
 * classée « high » n'a aucun correctif publié, il ne reste que deux issues avec la
 * commande nue : bloquer toutes les Pull Requests pour une chose qu'on ne peut pas
 * corriger, ou abaisser le seuil — ce qui masquerait AUSSI toutes les failles à venir.
 *
 * Ce script garde le seuil à « high » et n'écarte que les avis explicitement listés
 * ci-dessous, avec leur motif et leur date. C'est la transposition en npm de ce que le
 * backend fait déjà avec `pip-audit --ignore-vuln GHSA-xxxx`.
 *
 * Utilisé par `npm run audit`, appelé par `make audit` et par le job CI
 * « audit des dependances ».
 */
import { spawnSync } from "node:child_process";

/**
 * Avis volontairement écartés. Chaque entrée doit porter un motif et une date, et
 * disparaître dès qu'un correctif est publié — le script le signale de lui-même.
 */
const AVIS_ECARTES = {
  "GHSA-w3rx-r6r6-pgpr": {
    paquet: "image-size",
    depuis: "2026-08-21",
    motif:
      "Aucune version corrigee : 2.0.2 est la derniere publiee et l'avis couvre <=2.0.2. " +
      "Tire par @docusaurus/mdx-loader, uniquement AU BUILD, pour mesurer les images de " +
      "static/. Le deni de service exige une image malveillante, or ces images sont celles " +
      "du depot.",
  },
  "GHSA-5p2g-fcmc-qvqq": {
    paquet: "image-size",
    depuis: "2026-08-21",
    motif: "Meme paquet et meme raisonnement que GHSA-w3rx-r6r6-pgpr.",
  },
};

const SEVERITES_BLOQUANTES = new Set(["high", "critical"]);

// `npm audit` sort en code 1 des qu'il trouve quelque chose : on ignore le code de
// sortie et on ne lit que le JSON. maxBuffer releve car l'arbre de Docusaurus est vaste.
const resultat = spawnSync("npm", ["audit", "--json"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

if (!resultat.stdout) {
  console.error(
    "npm audit n'a rien renvoye :",
    resultat.stderr || resultat.error,
  );
  process.exit(1);
}

const rapport = JSON.parse(resultat.stdout);
const vulnerabilites = rapport.vulnerabilities ?? {};

/** Identifiant GHSA d'un avis, extrait de son URL (…/advisories/GHSA-xxxx). */
const identifiant = (avis) =>
  String(avis.url ?? "")
    .split("/")
    .pop();

const bloquants = [];
const ecartesVus = new Set();

for (const paquet of Object.values(vulnerabilites)) {
  for (const avis of paquet.via) {
    // Un "via" est soit un avis complet (objet), soit le nom d'un paquet
    // intermediaire (chaine) : seuls les objets portent une severite.
    if (typeof avis !== "object") continue;
    if (!SEVERITES_BLOQUANTES.has(avis.severity)) continue;

    const id = identifiant(avis);
    if (id in AVIS_ECARTES) {
      ecartesVus.add(id);
      continue;
    }
    bloquants.push({ id, paquet: avis.name, titre: avis.title, url: avis.url });
  }
}

for (const [id, entree] of Object.entries(AVIS_ECARTES)) {
  if (!ecartesVus.has(id)) {
    console.log(
      `Avis ${id} (${entree.paquet}) n'est plus signale : retirer son entree de ` +
        "documentation/scripts/audit.mjs.",
    );
  }
}

if (bloquants.length === 0) {
  const n = ecartesVus.size;
  console.log(
    `Aucune faille high ou critical a corriger (${n} avis ecarte${n > 1 ? "s" : ""} explicitement).`,
  );
  process.exit(0);
}

console.error("Failles high ou critical sans exclusion declaree :");
for (const b of new Map(bloquants.map((b) => [b.id, b])).values()) {
  console.error(`  ${b.id}  ${b.paquet} : ${b.titre}`);
  console.error(`      ${b.url}`);
}
console.error(
  "\nDans l'ordre : `npm audit fix`, puis un `overrides` dans documentation/package.json, " +
    "puis en dernier recours une entree datee dans AVIS_ECARTES.",
);
process.exit(1);
