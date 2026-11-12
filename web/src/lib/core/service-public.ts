import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import type { DiscoveredOffer, ExploreFilters } from "@/lib/explore";
import { formatLocationCity, normalizeDateToIso, toTitleCase } from "@/lib/format";
import type { Zone } from "./zone";
import { fitField, matchedField, passesFilters } from "./offer-filter";
import type { SearchContext } from "./search-context";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures

interface RawSpJob {
  ref: string;
  title: string;
  employer: string;
  location: string;
  lieu: string;
  lieuSansGeo?: string;
  date: string;
  dateFin?: string;
  /** Département du poste (ex. « 62 »). */
  dep: string;
}

function cleanText(s: string): string {
  return (s || "").trim().replace(/^["']|["']$/g, "");
}

function normalizeUrl(ref: string): string {
  return `https://choisirleservicepublic.gouv.fr/offre-emploi/${encodeURIComponent(ref)}/`;
}

function isDateFutureOrToday(dateStr: string): boolean {
  if (!dateStr) return false;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return false;
  const day = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const year = Number(parts[2]);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return false;
  const end = new Date(year, month, day, 23, 59, 59);
  return end.getTime() >= Date.now();
}

/**
 * Offres de la fonction publique (État, territoriale, hospitalière) des
 * départements de la zone du profil, TOUS métiers : le flux open data « Choisir
 * le service public » est téléchargé une fois par jour, puis filtré par profil.
 * Seules les offres dont la date de fin de publication n'est pas dépassée sont gardées.
 */
export async function fetchAndCacheServicePublicJobs(departements: string[] = ["62"]): Promise<RawSpJob[]> {
  const deps = [...new Set(departements)].filter((d) => /^(\d{2,3}|2[AB])$/.test(d)).sort();
  if (deps.length === 0) return [];
  const cacheDir = path.join(careerOpsRoot(), "data", "cache");
  const cacheFile = path.join(cacheDir, `service-public-${deps.join("-")}.json`);
  const localCsv = path.join(cacheDir, "offres-sp.csv");

  try {
    if (fs.existsSync(cacheFile) && Date.now() - fs.statSync(cacheFile).mtimeMs < CACHE_TTL_MS) {
      const parsed = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      // Les caches écrits avant la prise en charge de tous les métiers n'ont pas de champ « dep ».
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0]?.dep === "string") return parsed as RawSpJob[];
    }
  } catch {
    /* fallback to fetch */
  }

  try {
    let csvText = "";
    if (fs.existsSync(localCsv) && Date.now() - fs.statSync(localCsv).mtimeMs < CACHE_TTL_MS) {
      csvText = fs.readFileSync(localCsv, "utf8");
    } else {
      // 1. Récupérer l'URL de la dernière ressource CSV Choisir le Service Public triée par fraîcheur
      const dsRes = await fetch("https://www.data.gouv.fr/api/1/datasets/6322e99e12175f7eb26ff465/");
      if (!dsRes.ok) return [];
      const dsData = (await dsRes.json()) as {
        resources?: Array<{ format?: string; url?: string; title?: string; last_modified?: string }>;
      };
      const csvResources = (dsData.resources || [])
        .filter((r) => r.format?.toLowerCase() === "csv" && r.title?.includes("offres-datagouv-"))
        .sort((a, b) => (b.last_modified || "").localeCompare(a.last_modified || ""));
      const csvUrl = csvResources[0]?.url;
      if (!csvUrl) return [];

      // 2. Télécharger le CSV
      const csvRes = await fetch(csvUrl);
      if (!csvRes.ok) return [];
      csvText = await csvRes.text();
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      try {
        fs.writeFileSync(localCsv, csvText, "utf8");
      } catch {
        /* ignore local csv write error */
      }
    }

    // « Pas de Calais (62) », « Nord (59) » : le département est entre parenthèses.
    const depMarkers = deps.map((d) => ({ d, marker: `(${d})` }));
    const jobs: RawSpJob[] = [];
    const seen = new Set<string>();
    const lines = csvText.split("\n");
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      // Test rapide sur la ligne brute avant de la découper (400 000 lignes).
      if (!depMarkers.some((m) => line.includes(m.marker))) continue;
      const cols = line.split(";");
      const location = cleanText(cols[8]);
      const dep = depMarkers.find((m) => location.includes(m.marker))?.d;
      if (!dep) continue;
      const ref = cleanText(cols[1]);
      const title = cleanText(cols[7]);
      if (!ref || !title || seen.has(ref)) continue;
      const dateFin = cleanText(cols[14]);
      // Offre close : la date de fin de publication est dépassée.
      if (dateFin && !isDateFutureOrToday(dateFin)) continue;
      seen.add(ref);
      jobs.push({
        ref,
        title,
        employer: cleanText(cols[19] || cols[0]),
        location,
        lieu: cleanText(cols[9]),
        lieuSansGeo: cleanText(cols[25]),
        date: cleanText(cols[13] || cols[15]),
        dateFin,
        dep,
      });
    }

    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    if (jobs.length) fs.writeFileSync(cacheFile, JSON.stringify(jobs), "utf8");
    return jobs;
  } catch (err) {
    console.error("Service public fetch failed:", err);
    return [];
  }
}

function cleanSpTitleAndEmployer(
  rawTitle: string,
  rawEmployer: string,
  cleanCity: string,
  lieuSansGeo?: string,
  dep = "62",
  depName = "Pas-de-Calais",
): { title: string; employer: string; cityOverride?: string } {
  let title = rawTitle.trim();
  let employer = (rawEmployer || "").trim();
  let cityOverride: string | undefined = undefined;

  // Pattern 1: Title ends with " - MAIRIE DE ..." or " - CONSEIL DEPARTEMENTAL..."
  const dashMatch = title.match(
    /^(.+?)\s+-\s+(MAIRIE\s+DE\s+.+|CONSEIL\s+DEPARTEMENTAL\s+.+|COMMUNAUTE\s+D['’]AGGLOMERATION\s+.+|SDIS\s+.+|CENTRE\s+DE\s+GESTION\s+.+|PREFECTURE\s+.+|CTE\s+DE\s+CMES\s+.+|SYNDICAT\s+.+)$/i,
  );
  if (dashMatch) {
    title = dashMatch[1].trim();
    employer = toTitleCase(dashMatch[2].trim());
  }

  // Pattern 2: Police Nationale titles: "CPN Béthune - Technicien..." or "DIPN ARRAS - Technicien..." or "DIPN - Antenne Coquelles..."
  const policeMatch = title.match(
    /^(?:CPN|DIPN)(?:\s*-\s*|\s+)(?:Antenne\s+)?([A-Za-zÀ-ÖØ-öø-ÿ\s-]+?)\s*-\s*(.+)$/i,
  );
  if (policeMatch) {
    const rawTown = policeMatch[1].trim();
    const town = toTitleCase(rawTown);
    title = policeMatch[2].trim();
    if (town && !/^(?:nord|police|nationale|pole|littoral|artois)$/i.test(town)) {
      cityOverride = `${town} (${dep})`;
    }
  }

  // Remove trailing gender markers from title: H/F, (H/F), F/H, (F/H)
  title = title.replace(/\s*\(?[HF]\s*\/\s*[HF]\)?\s*$/i, "").trim();

  // If employer is still generic "Communes"
  if (/^communes?$/i.test(employer)) {
    const effectiveCity = cityOverride || cleanCity;
    const pureCity = effectiveCity.replace(/\s*\(\d+\)/, "").trim();
    employer = pureCity ? `Mairie de ${toTitleCase(pureCity)}` : "Mairie";
  } else if (/^structures? de coop[ée]ration.*$/i.test(employer)) {
    employer = `Intercommunalité (${dep})`;
  } else if (/^conseils? d[ée]partementaux.*$/i.test(employer)) {
    employer = `Conseil départemental (${depName})`;
  }

  // Fallback: check lieuSansGeo only if cityOverride is not set and cleanCity is empty or generic
  if (!cityOverride && (!cleanCity || /pas-de-calais/i.test(cleanCity)) && lieuSansGeo) {
    const candidate = formatLocationCity(lieuSansGeo);
    if (candidate && !/^pas-de-calais/i.test(candidate) && !/^dipn/i.test(candidate)) {
      cityOverride = candidate;
    }
  }

  return { title, employer: employer || `Service public (${dep})`, cityOverride };
}
export async function loadServicePublicDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
  zone: Zone | undefined,
  ctx: SearchContext,
): Promise<DiscoveredOffer[]> {
  const rawJobs = await fetchAndCacheServicePublicJobs(ctx.departements);
  const offers: DiscoveredOffer[] = [];

  for (const job of rawJobs) {
    const dep = job.dep || "62";
    const depName = job.location.replace(/\s*\(.*$/, "").trim() || dep;
    const initialCity = formatLocationCity(job.lieu || job.lieuSansGeo || job.location) || job.location;
    const { title: cleanTitle, employer: cleanEmployer, cityOverride } = cleanSpTitleAndEmployer(
      job.title,
      job.employer,
      initialCity,
      job.lieuSansGeo,
      dep,
      depName,
    );

    let finalCity = cityOverride || (initialCity && !/^dipn/i.test(initialCity) ? initialCity : `${depName} (${dep})`);
    if (finalCity && !finalCity.includes("(")) finalCity = `${finalCity} (${dep})`;

    const fullLoc = `${finalCity} — ${job.lieu ? job.lieu + " — " : ""}${job.lieuSansGeo ? job.lieuSansGeo + " — " : ""}${job.location}`;
    if (!passesFilters({ title: cleanTitle, location: fullLoc }, filters, zone)) continue;

    let isoDate = normalizeDateToIso(job.date) || "";
    if (!isoDate || Date.now() - Date.parse(isoDate) > 30 * 86_400_000) {
      // Offre toujours ouverte mais publiée il y a longtemps : elle reste visible.
      isoDate = new Date().toISOString().slice(0, 10);
    }

    offers.push({
      company: cleanEmployer,
      title: cleanTitle,
      location: finalCity,
      postedAt: isoDate,
      ats: "portals",
      source: "service-public-62",
      url: normalizeUrl(job.ref),
      matchedKeyword: matchedField(cleanTitle, filters),
      ...fitField(cleanTitle, roleTargets),
    });
  }

  return offers;
}
