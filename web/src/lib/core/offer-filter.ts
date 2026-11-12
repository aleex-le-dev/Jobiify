import type { ExploreFilters, FitBand } from "@/lib/explore";
import { firstMatch, isBlockedLocation, looksRemote, matchesKeyword, titlePasses } from "@/lib/offer-match.mjs";
import { titleFit } from "@/lib/title-fit.mjs";
import { acceptInZone, type Zone } from "./zone";

/**
 * Filtre unique appliqué par toutes les sources d'offres : postes du profil,
 * mots exclus, lieux refusés, télétravail, zone de trajet. Une source ne décide
 * plus seule de ce qu'elle garde, donc une offre n'est jamais acceptée par l'une
 * et perdue par l'autre.
 */
export interface OfferCandidate {
  title: string;
  location: string;
  lat?: number | null;
  lon?: number | null;
  codeInsee?: string | null;
  /** La source indique explicitement du télétravail complet. */
  remote?: boolean;
}

export function passesFilters(
  c: OfferCandidate,
  filters: ExploreFilters,
  zone?: Zone,
  { skipPositive = false }: { skipPositive?: boolean } = {},
): boolean {
  if (!c.title) return false;
  if (!titlePasses(c.title, skipPositive ? { negative: filters.negative } : filters)) return false;
  if (isBlockedLocation(c.location, filters.blockHard) || isBlockedLocation(c.location, filters.block)) return false;

  const remote = c.remote === true || looksRemote(c.location, c.title);
  if (filters.remoteOnly) return remote;

  if (zone) {
    // Télétravail complet annoncé par la source : accessible depuis n'importe où.
    if (c.remote === true) return true;
    // Zone de trajet active : elle seule décide (la liste « allow » ne peut pas la contourner).
    return acceptInZone(
      { lat: c.lat, lon: c.lon, codeInsee: c.codeInsee, ville: c.location, texte: c.title, teletravail: c.remote ?? null },
      zone,
    );
  }
  const allow = filters.allow || [];
  if (allow.length > 0 && !allow.some((a) => a && matchesKeyword(c.location, a))) return false;
  return true;
}

/** Indice gratuit « proche du profil » affiché sur la carte (jamais un filtre). */
export function fitField(title: string, targets: string[]): { fit: { band: FitBand; score: number } } | Record<string, never> {
  const f = titleFit(title, targets);
  return f ? { fit: { band: f.band as FitBand, score: f.score } } : {};
}

/** Poste du profil reconnu dans le titre (transparence sur la carte). */
export function matchedField(title: string, filters: ExploreFilters): string | undefined {
  return firstMatch(title, filters.positive);
}

/** Pause courte entre deux requêtes vers une même source. */
export const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
