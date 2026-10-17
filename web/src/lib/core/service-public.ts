import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import type { DiscoveredOffer, ExploreFilters, FitBand } from "@/lib/explore";
import { formatLocationCity, normalizeDateToIso, toTitleCase } from "@/lib/format";
import { titleFit } from "@/lib/title-fit.mjs";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures

interface RawSpJob {
  ref: string;
  title: string;
  employer: string;
  location: string;
  lieu: string;
  lieuSansGeo?: string;
  date: string;
}

function cleanText(s: string): string {
  return (s || "").trim().replace(/^["']|["']$/g, "");
}

function normalizeUrl(ref: string): string {
  return `https://choisirleservicepublic.gouv.fr/offre-emploi/${encodeURIComponent(ref)}/`;
}

export async function fetchAndCacheServicePublicJobs(): Promise<RawSpJob[]> {
  const cacheDir = path.join(careerOpsRoot(), "data", "cache");
  const cacheFile = path.join(cacheDir, "service-public-62.json");

  try {
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
        const raw = fs.readFileSync(cacheFile, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as RawSpJob[];
        }
      }
    }
  } catch {
    /* fallback to fetch */
  }

  try {
    // 1. Récupérer l'URL de la dernière ressource CSV Choisir le Service Public
    const dsRes = await fetch("https://www.data.gouv.fr/api/1/datasets/6322e99e12175f7eb26ff465/");
    if (!dsRes.ok) return [];
    const dsData = (await dsRes.json()) as { resources?: Array<{ format?: string; url?: string; title?: string }> };
    const csvResource = dsData.resources?.find(
      (r) => r.format?.toLowerCase() === "csv" && r.title?.includes("offres-datagouv-"),
    );
    const csvUrl = csvResource?.url;
    if (!csvUrl) return [];

    // 2. Télécharger le CSV
    const csvRes = await fetch(csvUrl);
    if (!csvRes.ok) return [];
    const csvText = await csvRes.text();
    const lines = csvText.split("\n");

    const jobs: RawSpJob[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      // Filtrer sur le Pas-de-Calais
      if (
        line.includes("62") &&
        (line.includes("Pas de Calais") ||
          line.includes("Pas-de-Calais") ||
          line.includes("Béthune") ||
          line.includes("Lillers") ||
          line.includes("Arras") ||
          line.includes("Lens") ||
          line.includes("Bruay") ||
          line.includes("Saint-Omer") ||
          line.includes("Auchel") ||
          line.includes("Liévin"))
      ) {
        const lower = line.toLowerCase();
        // Filtrer sur les métiers de l'informatique, systèmes, réseaux, web, technique
        if (
          lower.includes("informatique") ||
          lower.includes("technicien") ||
          lower.includes("développeur") ||
          lower.includes("developpeur") ||
          lower.includes("réseau") ||
          lower.includes("reseau") ||
          lower.includes("numérique") ||
          lower.includes("numerique") ||
          lower.includes("système") ||
          lower.includes("systeme") ||
          lower.includes("web") ||
          lower.includes("support") ||
          lower.includes("parc") ||
          lower.includes("sécurité") ||
          lower.includes("cyber") ||
          lower.includes("données") ||
          lower.includes("data")
        ) {
          const cols = line.split(";");
          const ref = cleanText(cols[1]);
          const title = cleanText(cols[7]);
          const employer = cleanText(cols[19] || cols[0]);
          const location = cleanText(cols[8]);
          const lieu = cleanText(cols[9]);
          const lieuSansGeo = cleanText(cols[25]);
          const date = cleanText(cols[13] || cols[15]);

          if (ref && title) {
            jobs.push({ ref, title, employer, location, lieu, lieuSansGeo, date });
          }
        }
      }
    }

    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(cacheFile, JSON.stringify(jobs, null, 2), "utf8");
    return jobs;
  } catch (err) {
    console.error("Service public fetch failed:", err);
    return [];
  }
}

function firstMatch(title: string, positives: string[]): string | undefined {
  const lower = title.toLowerCase();
  for (const k of positives) if (k && lower.includes(k.toLowerCase())) return k;
  return undefined;
}

function fitField(title: string, targets: string[]): { fit: { band: FitBand; score: number } } | Record<string, never> {
  const f = titleFit(title, targets);
  return f ? { fit: { band: f.band as FitBand, score: f.score } } : {};
}

function matchesKeyword(text: string, kw: string): boolean {
  return text.toLowerCase().includes(kw.toLowerCase().trim());
}

const NON_IT_REGEX = /\b(automobile|véhicule|vehicule|espaces?\s+verts?|ferme|cantine|voirie|enfance|puériculture|social|scolaire|médical|soignant)\b/i;

function matchesFilters(
  title: string,
  location: string,
  filters: ExploreFilters,
): boolean {
  if (NON_IT_REGEX.test(title)) return false;
  if (filters.negative.some((n) => n && matchesKeyword(title, n))) return false;
  if (filters.positive.length > 0 && !filters.positive.some((p) => p && matchesKeyword(title, p))) return false;

  const fullLoc = location.toLowerCase();
  if (filters.blockHard.some((b) => b && matchesKeyword(fullLoc, b))) return false;
  if (filters.block.some((b) => b && matchesKeyword(fullLoc, b))) return false;
  if (filters.allow.length > 0 && !filters.allow.some((a) => a && matchesKeyword(fullLoc, a))) return false;

  return true;
}

function cleanSpTitleAndEmployer(
  rawTitle: string,
  rawEmployer: string,
  cleanCity: string,
  lieuSansGeo?: string,
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
      cityOverride = `${town} (62)`;
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
    employer = "Intercommunalité (62)";
  } else if (/^conseils? d[ée]partementaux.*$/i.test(employer)) {
    employer = "Conseil Départemental du Pas-de-Calais";
  }

  // Fallback: check lieuSansGeo if cityOverride is not set
  if (!cityOverride && lieuSansGeo) {
    const candidate = formatLocationCity(lieuSansGeo);
    if (candidate && !/^pas-de-calais/i.test(candidate) && !/^dipn/i.test(candidate)) {
      cityOverride = candidate;
    }
  }

  return { title, employer: employer || "Service Public (62)", cityOverride };
}

export async function loadServicePublicDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
): Promise<DiscoveredOffer[]> {
  const rawJobs = await fetchAndCacheServicePublicJobs();
  const offers: DiscoveredOffer[] = [];

  for (const job of rawJobs) {
    if (NON_IT_REGEX.test(job.title)) continue;

    const fullLoc = `${job.lieu ? job.lieu + " — " : ""}${job.lieuSansGeo ? job.lieuSansGeo + " — " : ""}${job.location}`;
    if (!matchesFilters(job.title, fullLoc, filters)) continue;

    const fitData = fitField(job.title, roleTargets);
    // Exclude jobs that are classified as weak fit (e.g. non-matching roles)
    if (fitData.fit && fitData.fit.band === "weak") continue;

    const initialCity = formatLocationCity(job.lieu || job.lieuSansGeo || job.location) || job.location;
    const isoDate = normalizeDateToIso(job.date) || job.date || new Date().toISOString().slice(0, 10);
    const { title: cleanTitle, employer: cleanEmployer, cityOverride } = cleanSpTitleAndEmployer(
      job.title,
      job.employer,
      initialCity,
      job.lieuSansGeo,
    );

    let finalCity = cityOverride || (initialCity && !/^dipn/i.test(initialCity) ? initialCity : "Pas-de-Calais (62)");
    if (finalCity && !finalCity.includes("(") && !/pas-de-calais/i.test(finalCity)) {
      finalCity = `${finalCity} (62)`;
    }

    offers.push({
      company: cleanEmployer,
      title: cleanTitle,
      location: finalCity,
      postedAt: isoDate,
      ats: "portals",
      source: "service-public-62",
      url: normalizeUrl(job.ref),
      matchedKeyword: firstMatch(job.title, filters.positive),
      ...fitData,
    });
  }

  return offers;
}
