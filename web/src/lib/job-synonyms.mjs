// Générateur de synonymes d'intitulés de poste (français) — pur, sans dépendance,
// chargeable par `node --test`. Objectif : à partir des postes visés par un profil,
// produire toutes les variantes sous lesquelles un même emploi est publié
// (synonymes métier, féminin/masculin, sans accents, équivalents anglais courants),
// pour qu'aucune offre du domaine ne passe entre les mailles des filtres.

/**
 * Familles de métiers : chaque groupe liste des intitulés interchangeables.
 * Un poste du profil qui correspond à un intitulé d'un groupe fait entrer
 * tout le groupe dans les synonymes.
 */
export const JOB_FAMILIES = [
  // ── Informatique : support / proximité ──
  ["technicien informatique", "technicien support", "technicien support informatique", "technicien helpdesk", "technicien de proximité", "technicien poste de travail", "technicien micro", "technicien micro-informatique", "technicien de maintenance informatique", "technicien it", "support informatique", "support utilisateurs", "assistance informatique", "helpdesk", "help desk", "service desk", "it support", "desktop support", "support n1", "support n2", "informaticien"],
  // ── Informatique : systèmes / réseaux ──
  ["administrateur systèmes", "administrateur système", "administrateur réseau", "administrateur systèmes et réseaux", "technicien systèmes et réseaux", "technicien réseau", "technicien réseaux", "ingénieur systèmes", "ingénieur réseau", "sysadmin", "system administrator", "network administrator", "technicien infrastructure", "administrateur infrastructure"],
  // ── Développement ──
  ["développeur", "développeur web", "développeur fullstack", "développeur full stack", "développeur front-end", "développeur frontend", "développeur back-end", "développeur backend", "développeur php", "développeur javascript", "développeur react", "développeur python", "développeur java", "intégrateur web", "web developer", "software developer", "software engineer", "fullstack developer", "frontend developer", "backend developer", "programmeur", "concepteur développeur", "ingénieur logiciel", "ingénieur développement"],
  // ── Data ──
  ["data analyst", "analyste de données", "data engineer", "ingénieur data", "data scientist", "business analyst", "analyste bi", "développeur bi"],
  // ── Logistique ──
  ["cariste", "préparateur de commandes", "préparateur commandes", "magasinier", "agent logistique", "opérateur logistique", "manutentionnaire", "agent de quai", "réceptionnaire", "gestionnaire de stock", "employé logistique", "chauffeur cariste"],
  // ── Production / industrie ──
  ["agent de production", "opérateur de production", "opérateur production", "ouvrier de production", "conducteur de ligne", "conducteur de machine", "conducteur de machines", "pilote de ligne", "régleur", "opérateur sur machine", "agent de fabrication", "ouvrier polyvalent", "opérateur de conditionnement", "agent de conditionnement"],
  // ── Maintenance ──
  ["technicien de maintenance", "agent de maintenance", "électromécanicien", "mécanicien de maintenance", "technicien maintenance industrielle", "électricien de maintenance", "automaticien", "technicien électrotechnique"],
  // ── BTP ──
  ["maçon", "coffreur", "coffreur bancheur", "ouvrier du bâtiment", "manœuvre", "manoeuvre", "aide maçon"],
  ["électricien", "électricien du bâtiment", "électricien bâtiment", "électricien industriel", "câbleur"],
  ["plombier", "plombier chauffagiste", "chauffagiste", "technicien cvc", "frigoriste"],
  ["peintre", "peintre en bâtiment", "plaquiste", "plâtrier", "carreleur", "menuisier", "charpentier"],
  // ── Transport ──
  ["chauffeur poids lourd", "chauffeur pl", "chauffeur spl", "conducteur routier", "chauffeur routier", "chauffeur livreur", "livreur", "chauffeur vl", "conducteur de bus", "chauffeur de bus", "conducteur receveur"],
  // ── Commerce / vente ──
  ["vendeur", "vendeuse", "conseiller de vente", "conseillère de vente", "employé de libre-service", "employé libre service", "équipier de vente", "hôte de caisse", "hôtesse de caisse", "caissier", "employé commercial", "employé de rayon", "assistant de magasin"],
  ["commercial", "attaché commercial", "technico-commercial", "chargé d'affaires", "business developer", "chargé de clientèle", "représentant commercial"],
  // ── Relation client ──
  ["conseiller clientèle", "chargé de clientèle", "téléconseiller", "conseiller client", "chargé de relation client", "agent de service client", "service client", "customer service", "hôte d'accueil", "hôtesse d'accueil", "agent d'accueil", "standardiste"],
  // ── Administratif / gestion ──
  ["assistant administratif", "assistante administrative", "secrétaire", "agent administratif", "employé administratif", "assistant de direction", "assistant de gestion", "gestionnaire administratif", "office manager"],
  ["comptable", "aide-comptable", "aide comptable", "assistant comptable", "gestionnaire comptable", "comptable fournisseurs", "comptable clients", "gestionnaire de paie", "gestionnaire paie"],
  ["chargé de recrutement", "assistant rh", "assistant ressources humaines", "gestionnaire rh", "chargé rh", "recruteur"],
  // ── Santé / social ──
  ["aide-soignant", "aide soignant", "agent de service hospitalier", "ash", "auxiliaire de vie", "aide à domicile", "auxiliaire de vie sociale", "accompagnant éducatif et social", "aes", "aide médico-psychologique"],
  ["infirmier", "infirmière", "ide", "infirmier diplômé d'état"],
  // ── Restauration / hôtellerie ──
  ["serveur", "serveuse", "commis de salle", "chef de rang", "employé polyvalent de restauration", "équipier polyvalent", "employé de restauration"],
  ["cuisinier", "commis de cuisine", "chef de partie", "second de cuisine", "plongeur", "agent de restauration"],
  // ── Propreté / sécurité ──
  ["agent d'entretien", "agent de propreté", "agent de nettoyage", "agent de service", "technicien de surface", "femme de ménage", "employé de ménage"],
  ["agent de sécurité", "agent de surveillance", "agent de sûreté", "ssiap", "agent cynophile"],
  // ── Animation / éducation ──
  ["animateur", "animatrice", "animateur périscolaire", "atsem", "auxiliaire de puériculture", "assistant maternel", "éducateur spécialisé"],
];

const fold = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/œ/g, "oe").replace(/[^a-z0-9+#]+/g, " ").trim();

/** Variante féminine/masculine des terminaisons courantes, mot par mot. */
const GENDER_RULES = [
  [/eur$/, "euse"], [/euse$/, "eur"],
  [/teur$/, "trice"], [/trice$/, "teur"],
  [/ien$/, "ienne"], [/ienne$/, "ien"],
  [/ier$/, "ière"], [/ière$/, "ier"],
  [/er$/, "ère"], [/ère$/, "er"],
  [/é$/, "ée"],
];

export function genderVariants(title, { firstWordOnly = false } = {}) {
  const words = String(title).split(/(\s+|-)/);
  const out = new Set();
  // Le genre peut porter sur n'importe quel mot ("technicienne support", "aide-soignante").
  const eligible = (i) => !firstWordOnly || i === 0;
  words.forEach((w, i) => {
    if (w.length < 4 || !eligible(i)) return;
    for (const [re, rep] of GENDER_RULES) {
      if (re.test(w)) {
        const copy = [...words];
        copy[i] = w.replace(re, rep);
        out.add(copy.join(""));
        break;
      }
    }
  });
  // Féminin en -e simple ("soignant" → "soignante", "assistant" → "assistante").
  words.forEach((w, i) => {
    if (!eligible(i) || /ment$/.test(w)) return;
    if (/(ant|ent|and|ais|in|é)$/.test(w) && w.length >= 4) {
      const copy = [...words];
      copy[i] = `${w}e`;
      out.add(copy.join(""));
    } else if (/(ante|ente|ande|aise|ine)$/.test(w) && w.length >= 5) {
      const copy = [...words];
      copy[i] = w.slice(0, -1);
      out.add(copy.join(""));
    }
  });
  out.delete(String(title));
  return [...out];
}

/**
 * Étend une liste de postes en synonymes.
 * @param {string[]} titles - postes saisis pour le profil
 * @param {{max?: number}} [opts]
 * @returns {string[]} synonymes (sans les postes d'origine), dédoublonnés à l'accent près
 */
export function expandTitles(titles, { max = 60 } = {}) {
  const base = (Array.isArray(titles) ? titles : []).map((t) => String(t || "").trim()).filter(Boolean);
  const seen = new Set(base.map(fold));
  const out = [];
  const push = (t) => {
    const k = fold(t);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };

  for (const title of base) {
    // Le poste et ses variantes de genre ("aide-soignante" ↔ "aide-soignant").
    const forms = [fold(title), ...genderVariants(title.toLowerCase()).map(fold)];
    // Correspondance au MOT ENTIER : "ide" ne doit pas matcher "aide soignante".
    const has = (hay, needle) => ` ${hay} `.includes(` ${needle} `);
    for (const family of JOB_FAMILIES) {
      // Le poste appartient à la famille s'il en contient un intitulé (ou l'inverse).
      const hit = family.some((f) => {
        const ff = fold(f);
        return ff.length >= 3 && forms.some((ft) => ft === ff || (ff.length >= 4 && has(ft, ff)) || (ft.length >= 6 && has(ff, ft)));
      });
      if (hit) family.forEach(push);
    }
    genderVariants(title.toLowerCase()).forEach(push);
  }
  // Variantes féminines des synonymes eux-mêmes (offres rédigées au féminin).
  for (const s of [...out]) genderVariants(s, { firstWordOnly: true }).forEach(push);
  return out.slice(0, max);
}
