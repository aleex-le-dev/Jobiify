// Traduction à l'affichage des textes « système » produits en anglais par des
// modules partagés ou par les scripts cœur (sorties JSON, libellés de groupes).
// Ces sources restent en anglais (contrats testés, scripts CLI) ; l'interface,
// elle, est entièrement en français.

const EXACT: Record<string, string> = {
  // Groupes « En attente de votre décision » (lib/home/awaiting.mjs)
  Recommended: "Recommandées",
  "Check the posting first": "Annonce à vérifier d'abord",
  "Below the apply line": "Sous le seuil de candidature",
  "Not scored yet": "Pas encore évaluées",
  // Sources indisponibles (lib/home/hero-state.mjs)
  "Follow-ups": "les relances",
  "New matches": "les nouvelles offres",
  "Follow-ups and new matches": "les relances et les nouvelles offres",
  // Relances sans réponse (rejection-latency.mjs)
  "Elapsed-time observation only — not legal advice or a claim that the employer did anything wrong.":
    "Simple mesure du temps écoulé — ni un avis juridique, ni l'affirmation que l'employeur a mal agi.",
  // Assistant de candidature (lib/apply/url-guard.mjs)
  "A valid application URL (https://…) is required": "Une adresse de candidature valide (https://…) est requise.",
  "This application URL is not allowed": "Cette adresse de candidature n'est pas autorisée.",
  "could not open the form": "Impossible d'ouvrir le formulaire.",
  "bad json": "Requête invalide.",
};

/** Texte système traduit en français s'il est connu, sinon renvoyé tel quel. */
export function fr(text: string | null | undefined): string {
  if (!text) return "";
  return EXACT[text] ?? text;
}
