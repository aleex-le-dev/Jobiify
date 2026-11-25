import { groupByMetier, matchProfile } from "@/lib/metier-groups.mjs";
import { acceptInZone } from "./zone";
import { filtersFromProfile, getActiveProfile } from "./search-profiles";
import { loadInterimOffers, zoneFromProfile } from "./interim";
import { fetchMeteojobZone, meteojobUrl } from "./meteojob";
import { loadServicePublicDiscoveredOffers } from "./service-public";
import { DEFAULT_FILTERS } from "@/lib/explore";

/**
 * « Où sont les offres » : toutes les offres de la zone du profil actif, tous
 * métiers confondus, regroupées par métier. Sources sans clé uniquement :
 * agences d'intérim, fonction publique et Meteojob. C'est un échantillon du
 * marché local, pas son total (France Travail, aujourd'hui fermé, n'y est pas).
 */
export type MarketMetier = { key: string; label: string; count: number; inProfile: boolean; examples: string[]; sources: Record<string, number> };
export type MarketResult = {
  ville: string;
  minutes: number;
  total: number;
  profile: string | null;
  /** Offres des postes visés du profil actif, pour comparer avec les autres métiers. */
  profileMatch: { count: number; examples: string[] };
  metiers: MarketMetier[];
  sources: Array<{ id: string; label: string; count: number; ok: boolean }>;
};

type Row = { title: string; company: string; location: string; source: string };

export async function loadMarket(): Promise<MarketResult> {
  const profile = getActiveProfile();
  const { zone, ville, minutes, ctx } = await zoneFromProfile();
  const rows: Row[] = [];
  const sources: MarketResult["sources"] = [];
  const track = async (id: string, label: string, load: () => Promise<Row[]>) => {
    try {
      const got = await load();
      rows.push(...got);
      sources.push({ id, label, count: got.length, ok: true });
    } catch {
      sources.push({ id, label, count: 0, ok: false });
    }
  };

  await Promise.all([
    track("interim", "Intérim (agences, Meteojob)", async () => {
      const { offers } = await loadInterimOffers();
      return offers.map((o) => ({ title: o.title, company: o.company || o.agency, location: o.location, source: "interim" }));
    }),
    track("meteojob", "Meteojob (offres récentes)", async () => {
      const jobs = await fetchMeteojobZone(ctx);
      return jobs
        .filter((j) => !zone || acceptInZone({ ville: j.locality, lat: j.lat, lon: j.lon, texte: j.title }, zone))
        .map((j) => ({ title: j.title, company: j.company, location: j.locality, source: "meteojob", url: meteojobUrl(j.id) }));
    }),
    track("service-public", "Fonction publique", async () => {
      // Aucun filtre de poste : tous les métiers de la zone.
      const all = { ...DEFAULT_FILTERS, positive: [], negative: [], allow: [], block: [], blockHard: [], alwaysAllow: [], remoteOnly: false };
      const offers = await loadServicePublicDiscoveredOffers(all, [], zone, ctx);
      return offers.map((o) => ({ title: o.title, company: o.company, location: o.location, source: "service-public" }));
    }),
  ]);

  const f = profile ? filtersFromProfile(profile) : null;
  const metiers = groupByMetier(rows, { profileTerms: f?.positive ?? [], negative: f?.negative ?? [] });
  const order = ["interim", "meteojob", "service-public"];
  sources.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const profileMatch = matchProfile(rows, { profileTerms: f?.positive ?? [], negative: f?.negative ?? [] });
  return { ville, minutes, total: rows.length, profile: profile?.name ?? null, profileMatch, metiers, sources };
}
