// Types partagés client/serveur pour les profils de recherche (aucun import node).
import type { AtsSource } from "@/lib/explore";

export interface SearchProfile {
  id: string;
  /** Nom affiché (ex. « Technicien informatique — CV 2026 ») */
  name: string;
  /** Postes recherchés, saisis ou extraits du CV */
  titles: string[];
  /** Variantes générées (synonymes, féminin/masculin…), modifiables */
  synonyms: string[];
  /** Mots qui excluent une offre (stage, alternance…) */
  negative: string[];
  /** Ville de départ pour la zone de trajet */
  originCity: string;
  /** Temps de trajet maximum, en minutes */
  commuteMinutes: number;
  remoteOnly: boolean;
  /** Ancienneté maximale des offres, en jours (0 = toutes) */
  sinceDays: number;
  /** Sources interrogées (par défaut : toutes) */
  sources: AtsSource[];
  createdAt: string;
  updatedAt: string;
}

/** Résumé du CV d'un profil, calculé côté serveur pour l'affichage des cartes. */
export interface CvSummary {
  hasCv: boolean;
  /** Nom de la personne (titre du CV) */
  person: string;
  /** Poste le plus récent du CV */
  headline: string;
  location: string;
  experiences: number;
  words: number;
}
