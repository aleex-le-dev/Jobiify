import { getPortalLiveRaw } from "./portal-live";
import { fetchFranceTravailInterim } from "./france-travail";
import { fetchAndCacheJoobleJobs } from "./jooble";
import { fetchAndCacheAdzunaJobs } from "./adzuna";
import { fetchAndCacheCareerjetJobs } from "./careerjet";
import { getEnvVar } from "./local-area";
import { acceptInZone, loadZone, type Zone } from "./zone";
import { getActiveProfile } from "./search-profiles";
import { formatLocationCity } from "@/lib/format";
import type { DiscoveredOffer, ExploreFilters } from "@/lib/explore";
import { titleFit } from "@/lib/title-fit.mjs";

/**
 * Missions d'intérim autour de chez soi, TOUS métiers — indépendamment des postes
 * du profil (un profil « Technicien informatique » ne doit pas masquer l'intérim).
 *
 * Sources, de la plus directe à la plus large :
 *  1. agences lues en direct (portals.yml, category: interim) : Randstad, Synergie, Manpower ;
 *  2. France Travail, contrats d'intérim uniquement (typeContrat=MIS) : toutes les agences ;
 *  3. Jooble / Adzuna / Careerjet sur le mot « intérim ».
 * Chaque source est facultative : une source sans clé est signalée, jamais bloquante.
 */

export interface InterimOffer {
  url: string;
  title: string;
  agency: string;
  company: string;
  location: string;
  postedAt: string;
  source: string;
}

export interface InterimSource {
  id: string;
  label: string;
  status: "ok" | "needs-key" | "error";
  count: number;
}

const AGENCIES = [
  "adecco", "manpower", "randstad", "synergie", "proman", "crit", "partnaire", "start people", "samsic",
  "supplay", "temporis", "actual", "domino", "triangle", "interaction", "leader", "adequat", "adéquat",
  "ergalis", "expectra", "gojob", "iziwork", "side", "qapa", "staffme", "abalone", "menway", "atoll",
  "proxiteam", "derichebourg interim", "fed", "page interim", "hays", "ranstad", "work&you", "agence",
];

/** Nom d'agence lisible à partir d'un nom d'entreprise / partenaire. */
function agencyName(...candidates: Array<string | undefined>): string {
  for (const c of candidates) {
    const v = (c || "").trim();
    if (!v) continue;
    const low = v.toLowerCase();
    const hit = AGENCIES.find((a) => low.includes(a));
    if (hit && hit !== "agence") return hit === "ranstad" ? "Randstad" : hit.replace(/\b\w/g, (m) => m.toUpperCase());
  }
  return (candidates.find((c) => c && c.trim()) || "Agence d'intérim").trim();
}

const looksInterim = (...texts: Array<string | undefined>) =>
  texts.some((t) => /int[ée]rim|mission|\btravail temporaire\b|\bett\b/i.test(t || ""));

async function zoneFromProfile(): Promise<{ zone?: Zone; ville: string; minutes: number }> {
  const p = getActiveProfile();
  const ville = p?.originCity || "Lières";
  const minutes = p?.commuteMinutes || 30;
  try {
    return { zone: await loadZone(minutes, ville, p?.originInsee), ville, minutes };
  } catch {
    return { ville, minutes };
  }
}

export async function loadInterimOffers({ fresh = false } = {}): Promise<{
  offers: InterimOffer[];
  sources: InterimSource[];
  ville: string;
  minutes: number;
}> {
  const { zone, ville, minutes } = await zoneFromProfile();
  const keep = (o: InterimOffer, lat?: number, lon?: number) =>
    !zone || acceptInZone({ ville: o.location, lat, lon, texte: o.title }, zone);
  const sources: InterimSource[] = [];
  const offers: InterimOffer[] = [];
  const seen = new Set<string>();
  const add = (o: InterimOffer, lat?: number, lon?: number) => {
    if (!o.url || !o.title || seen.has(o.url) || !keep(o, lat, lon)) return false;
    seen.add(o.url);
    offers.push(o);
    return true;
  };

  await Promise.all([
    // 1. Agences lues en direct
    (async () => {
      try {
        const live = await getPortalLiveRaw({ fresh });
        let n = 0;
        for (const o of live.offers) {
          if (o.category !== "interim") continue;
          if (add({ url: o.url, title: o.title, agency: agencyName(o.portal, o.company), company: o.company, location: formatLocationCity(o.location) || o.location, postedAt: o.postedAt, source: "agences" })) n++;
        }
        sources.push({ id: "agences", label: "Randstad, Synergie, Manpower (direct)", status: "ok", count: n });
      } catch {
        sources.push({ id: "agences", label: "Randstad, Synergie, Manpower (direct)", status: "error", count: 0 });
      }
    })(),
    // 2. France Travail — contrats d'intérim
    (async () => {
      try {
        const jobs = await fetchFranceTravailInterim();
        if (jobs === null) {
          sources.push({ id: "france-travail", label: "France Travail (toutes agences)", status: "needs-key", count: 0 });
          return;
        }
        let n = 0;
        for (const j of jobs) {
          const partner = j.origineOffre?.partenaires?.[0];
          const url = partner?.url || j.origineOffre?.urlOrigine || `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(j.id)}`;
          const loc = j.lieuTravail?.libelle || "";
          if (add({ url, title: j.intitule, agency: agencyName(j.entreprise?.nom, partner?.nom), company: j.entreprise?.nom || "", location: formatLocationCity(loc) || loc, postedAt: j.dateActualisation || j.dateCreation || "", source: "france-travail" }, j.lieuTravail?.latitude, j.lieuTravail?.longitude)) n++;
        }
        sources.push({ id: "france-travail", label: "France Travail (toutes agences)", status: "ok", count: n });
      } catch {
        sources.push({ id: "france-travail", label: "France Travail (toutes agences)", status: "error", count: 0 });
      }
    })(),
    // 3. Agrégateurs sur le mot « intérim »
    (async () => {
      if (!getEnvVar("JOOBLE_API_KEY")) return void sources.push({ id: "jooble", label: "Jooble", status: "needs-key", count: 0 });
      try {
        let n = 0;
        for (const j of await fetchAndCacheJoobleJobs(["interim"])) {
          if (!looksInterim(j.title, j.type, j.snippet, j.company)) continue;
          if (add({ url: j.link, title: j.title.replace(/<[^>]+>/g, ""), agency: agencyName(j.company, j.source), company: j.company || "", location: j.location || "", postedAt: j.updated || "", source: "jooble" })) n++;
        }
        sources.push({ id: "jooble", label: "Jooble", status: "ok", count: n });
      } catch {
        sources.push({ id: "jooble", label: "Jooble", status: "error", count: 0 });
      }
    })(),
    (async () => {
      if (!getEnvVar("ADZUNA_APP_ID")) return void sources.push({ id: "adzuna", label: "Adzuna", status: "needs-key", count: 0 });
      try {
        let n = 0;
        for (const j of await fetchAndCacheAdzunaJobs(["interim"])) {
          const company = j.company?.display_name || "";
          if (add({ url: j.redirect_url, title: j.title.replace(/<[^>]+>/g, ""), agency: agencyName(company), company, location: j.location?.display_name || "", postedAt: j.created || "", source: "adzuna" }, j.latitude, j.longitude)) n++;
        }
        sources.push({ id: "adzuna", label: "Adzuna", status: "ok", count: n });
      } catch {
        sources.push({ id: "adzuna", label: "Adzuna", status: "error", count: 0 });
      }
    })(),
    (async () => {
      if (!getEnvVar("CAREERJET_AFFID")) return void sources.push({ id: "careerjet", label: "Careerjet", status: "needs-key", count: 0 });
      try {
        let n = 0;
        for (const j of await fetchAndCacheCareerjetJobs(["interim"])) {
          if (add({ url: j.url, title: j.title.replace(/<[^>]+>/g, ""), agency: agencyName(j.company, j.site), company: j.company || "", location: j.locations || "", postedAt: j.date || "", source: "careerjet" })) n++;
        }
        sources.push({ id: "careerjet", label: "Careerjet", status: "ok", count: n });
      } catch {
        sources.push({ id: "careerjet", label: "Careerjet", status: "error", count: 0 });
      }
    })(),
  ]);

  // Les plus récentes d'abord ; sans date, à la fin dans leur ordre d'arrivée.
  offers.sort((a, b) => (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0));
  const order = ["agences", "france-travail", "jooble", "adzuna", "careerjet"];
  sources.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return { offers, sources, ville, minutes };
}

const foldText = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
function hasKeyword(text: string, kw: string): boolean {
  const k = foldText(kw);
  if (!k) return false;
  const t = foldText(text);
  if (k.length <= 3) return new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(t);
  return t.includes(k);
}

/**
 * Missions d'intérim pour la recherche par PROFIL : mêmes sources que la page
 * « Missions d'intérim » (agences en direct, France Travail en contrat d'intérim,
 * agrégateurs sur « intérim »), filtrées par les postes + synonymes et les mots
 * exclus du profil. La zone de trajet est déjà appliquée par loadInterimOffers.
 */
export async function loadInterimForProfile(filters: ExploreFilters, roleTargets: string[]): Promise<DiscoveredOffer[]> {
  const { offers } = await loadInterimOffers();
  const out: DiscoveredOffer[] = [];
  for (const o of offers) {
    if (filters.negative.some((n) => n && hasKeyword(o.title, n))) continue;
    const matched = filters.positive.find((p) => p && hasKeyword(o.title, p));
    if (filters.positive.length > 0 && !matched) continue;
    const fit = titleFit(o.title, roleTargets);
    out.push({
      url: o.url,
      company: o.company || o.agency,
      title: o.title,
      location: o.location,
      postedAt: o.postedAt,
      ats: "portals",
      source: `interim-${o.source}`,
      matchedKeyword: matched,
      note: `Intérim via ${o.agency}`,
      ...(fit ? { fit: { band: fit.band as "strong" | "related" | "weak", score: fit.score } } : {}),
    });
  }
  return out;
}
