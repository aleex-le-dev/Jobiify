// The cost-honesty taxonomy — a single source for the FREE vs $ boundary that the
// Explorer teaches by repetition. Discovery (finding roles) is structurally free:
// it calls no LLM. Only evaluation (scoring a role against your CV) spends tokens,
// and only when the user chooses it. The framing is always local-first: "your key,
// your AI, your machine."

export type CostClass = "free" | "free-network" | "spend" | "free-gemini";

export const COST_META: Record<CostClass, { label: string; tip: string }> = {
  "free-network": {
    label: "Gratuit",
    tip: "Scanne le réseau d'offres en direct sur le web. Pas d'IA, aucun jeton consommé.",
  },
  free: {
    label: "Gratuit",
    tip: "Aucun jeton consommé. Fichiers locaux uniquement.",
  },
  spend: {
    label: "Jetons IA",
    tip: "Consomme des jetons avec votre CLI d'IA configurée.",
  },
  "free-gemini": {
    label: "Gratuit · Gemini",
    tip: "Évaluation avec le quota gratuit de Gemini.",
  },
};
