import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import type { DiscoveredOffer, ExploreFilters, FitBand } from "@/lib/explore";
import { formatLocationCity, normalizeDateToIso, toTitleCase } from "@/lib/format";
import { titleFit } from "@/lib/title-fit.mjs";
import { inZone, type Zone } from "./zone";

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

async function isUrlActive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (res.status === 404 || res.status === 410) return false;
    if (res.url.includes("/offre-depubliee")) return false;
    const text = await res.text();
    if (/offre[- ]d[eé]publi[eé]e|cette offre n'est plus|offre expir[eé]e/i.test(text)) return false;
    return true;
  } catch {
    return false;
  }
}

const NON_IT_REGEX =
  /\b(automobile|véhicule|vehicule|espaces?\s+verts?|ferme|cantine|voirie|enfance|puériculture|social|scolaire|médical|soignant|gestion administrative|entretien de locaux|repas|restauration|vrd|assainissement|bâtiments?|patrimoine|juridique|finances?)\b/i;

export async function fetchAndCacheServicePublicJobs(): Promise<RawSpJob[]> {
  const cacheDir = path.join(careerOpsRoot(), "data", "cache");
  const cacheFile = path.join(cacheDir, "service-public-62.json");
  const localCsv = path.join(cacheDir, "offres-sp.csv");

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

    const lines = csvText.split("\n");
    const candidates: RawSpJob[] = [];

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
          if (NON_IT_REGEX.test(title)) continue;

          const employer = cleanText(cols[19] || cols[0]);
          const location = cleanText(cols[8]);
          const lieu = cleanText(cols[9]);
          const lieuSansGeo = cleanText(cols[25]);
          const date = cleanText(cols[13] || cols[15]);
          const dateFin = cleanText(cols[14]);

          if (ref && title) {
            candidates.push({ ref, title, employer, location, lieu, lieuSansGeo, date, dateFin });
          }
        }
      }
    }

    // Valider les candidats : retenir ceux avec date de fin active ou URL vérifiée
    const jobs: RawSpJob[] = [];
    const BATCH_SIZE = 10;
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (cand) => {
          // Si la date limite est clairement dépassée, vérifier si elle a été retirée
          if (cand.dateFin && !isDateFutureOrToday(cand.dateFin)) {
            const url = normalizeUrl(cand.ref);
            const live = await isUrlActive(url);
            return { cand, live };
          }
          // Si date de fin active, l'offre est officiellement ouverte
          return { cand, live: true };
        }),
      );
      for (const res of batchResults) {
        if (res.live) jobs.push(res.cand);
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

function firstMatch(title: string, positives?: string[]): string | undefined {
  if (!positives || !Array.isArray(positives)) return undefined;
  const lower = title.toLowerCase();
  for (const k of positives) if (k && lower.includes(k.toLowerCase())) return k;
  return undefined;
}

function fitField(title: string, targets: string[]): { fit: { band: FitBand; score: number } } | Record<string, never> {
  const f = titleFit(title, targets);
  return f ? { fit: { band: f.band as FitBand, score: f.score } } : {};
}

function matchesKeyword(text: string, kw: string): boolean {
  const cleanKw = kw.toLowerCase().replace(/\s+/g, " ").trim();
  if (!cleanKw) return false;
  const cleanText = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (cleanKw.length <= 3) {
    const escaped = cleanKw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(`(^|[^a-z0-9à-ÿ])${escaped}([^a-z0-9à-ÿ]|$)`, "i");
    return rx.test(cleanText);
  }
  return cleanText.includes(cleanKw);
}

function isBlockedLocation(location: string, blockList?: string[]): boolean {
  if (!blockList || blockList.length === 0) return false;
  const locWithoutDept = location.toLowerCase().replace(/\bpas[- ]de[- ]calais\b/g, "").trim();
  return blockList.some((b) => {
    if (!b) return false;
    const cleanB = b.toLowerCase().trim();
    if (cleanB === "calais") {
      return /\bcalais\b/i.test(locWithoutDept);
    }
    return matchesKeyword(locWithoutDept, b);
  });
}

function matchesFilters(
  title: string,
  location: string,
  filters?: ExploreFilters,
  zone?: Zone,
): boolean {
  if (NON_IT_REGEX.test(title)) return false;
  const negative = filters?.negative || [];
  if (negative.some((n) => n && matchesKeyword(title, n))) return false;
  const positive = filters?.positive || [];
  if (positive.length > 0 && !positive.some((p) => p && matchesKeyword(title, p))) return false;

  const fullLoc = location.toLowerCase();
  const blockHard = filters?.blockHard || [];
  if (isBlockedLocation(fullLoc, blockHard)) return false;
  const block = filters?.block || [];
  if (isBlockedLocation(fullLoc, block)) return false;

  if (filters?.remoteOnly) {
    const isRemote = fullLoc.includes("100% télétravail") || fullLoc.includes("remote");
    if (!isRemote) return false;
    return true;
  }

  if (zone) {
    const verdict = inZone({ ville: location }, zone);
    if (verdict === "oui") return true;
    if (verdict === "non") {
      const allow = filters?.allow || [];
      if (allow.some((a) => a && matchesKeyword(fullLoc, a))) return true;
      return false;
    }
    if (filters?.allow && filters.allow.length > 0) {
      return filters.allow.some((a) => a && matchesKeyword(fullLoc, a));
    }
    return true;
  }

  const allow = filters?.allow || [];
  if (allow.length > 0 && !allow.some((a) => a && matchesKeyword(fullLoc, a))) return false;

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

  // Fallback: check lieuSansGeo only if cityOverride is not set and cleanCity is empty or generic
  if (!cityOverride && (!cleanCity || /pas-de-calais/i.test(cleanCity)) && lieuSansGeo) {
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
  zone?: Zone,
): Promise<DiscoveredOffer[]> {
  const rawJobs = await fetchAndCacheServicePublicJobs();
  const offers: DiscoveredOffer[] = [];

  for (const job of rawJobs) {
    if (NON_IT_REGEX.test(job.title)) continue;

    const initialCity = formatLocationCity(job.lieu || job.lieuSansGeo || job.location) || job.location;
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

    const fullLoc = `${finalCity} — ${job.lieu ? job.lieu + " — " : ""}${job.lieuSansGeo ? job.lieuSansGeo + " — " : ""}${job.location}`;
    if (!matchesFilters(cleanTitle, fullLoc, filters, zone)) continue;

    const fitData = fitField(cleanTitle, roleTargets);

    let isoDate = normalizeDateToIso(job.date) || "";
    if (job.dateFin && isDateFutureOrToday(job.dateFin)) {
      const parsed = Date.parse(isoDate);
      if (isNaN(parsed) || Date.now() - parsed > 30 * 86_400_000) {
        isoDate = new Date().toISOString().slice(0, 10);
      }
    } else if (!isoDate || Date.now() - Date.parse(isoDate) > 30 * 86_400_000) {
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
      matchedKeyword: firstMatch(cleanTitle, filters?.positive),
      ...fitData,
    });
  }

  return offers;
}
