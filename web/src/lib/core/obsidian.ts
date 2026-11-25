import fs from "node:fs";
import path from "node:path";
import { readApplications, readInbox, readReport } from "@/lib/career-ops";
import { atomicWrite } from "./safe-write";
import { getEnvVar } from "./local-area";
import { listProfiles } from "./search-profiles";
import { applicationNote, applicationNoteName, companyNote, indexNote, mergeNote, profileNote, safeName } from "@/lib/obsidian-notes.mjs";

/**
 * Synchronise le suivi de Jobiify vers un dossier d'un coffre Obsidian
 * (JOBIIFY_OBSIDIAN_DIR). Jobiify ne lit jamais le coffre : il y écrit des notes,
 * en ne remplaçant que le bloc qu'il gère dans chacune.
 */
export type ObsidianStatus = { configured: boolean; dir: string; vaultFound: boolean };
export type ObsidianResult = { dir: string; applications: number; companies: number; profiles: number; pending: number; files: number };

export function obsidianDir(): string {
  return (getEnvVar("JOBIIFY_OBSIDIAN_DIR") || "").trim();
}

export function obsidianStatus(): ObsidianStatus {
  const dir = obsidianDir();
  // Le dossier cible doit se trouver dans un coffre (dossier .obsidian au-dessus).
  let vaultFound = false;
  for (let d = dir; d && path.dirname(d) !== d; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, ".obsidian"))) {
      vaultFound = true;
      break;
    }
  }
  return { configured: Boolean(dir), dir, vaultFound };
}

function readIfExists(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Écrit une note en conservant le contenu existant ; ne touche pas un fichier inchangé. */
function writeNote(file: string, note: { props: Record<string, unknown>; block: string }): boolean {
  const existing = readIfExists(file);
  const next = mergeNote(existing, note.props, note.block);
  if (existing === next) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWrite(file, next);
  return true;
}

export function syncObsidian(): ObsidianResult {
  const dir = obsidianDir();
  if (!dir) throw new Error("Aucun dossier Obsidian configuré.");
  if (!path.isAbsolute(dir)) throw new Error("Le dossier Obsidian doit être un chemin absolu.");
  const status = obsidianStatus();
  if (!status.vaultFound) throw new Error("Ce dossier n'est pas dans un coffre Obsidian (aucun dossier .obsidian trouvé au-dessus).");

  const apps = readApplications().filter((a) => /^\d+$/.test(a.n));
  const inside = (p: string) => path.resolve(p).startsWith(path.resolve(dir) + path.sep);
  let files = 0;
  const put = (rel: string[], note: { props: Record<string, unknown>; block: string }) => {
    const file = path.join(dir, ...rel);
    if (!inside(file)) return;
    if (writeNote(file, note)) files++;
  };

  // Candidatures : un fichier par numéro, renommé si l'entreprise ou le poste change.
  const appDir = path.join(dir, "Candidatures");
  const existingByNumber = new Map<string, string>();
  try {
    for (const f of fs.readdirSync(appDir)) {
      const n = f.match(/^(\d+) - .*\.md$/)?.[1];
      if (n) existingByNumber.set(String(Number(n)), f.slice(0, -3));
    }
  } catch {
    /* premier export */
  }
  for (const app of apps) {
    const name = existingByNumber.get(String(Number(app.n))) ?? applicationNoteName(app);
    const report = readReport(app.n)?.content ?? null;
    put(["Candidatures", `${name}.md`], applicationNote(app, report));
  }

  // Entreprises : toutes les candidatures d'une même entreprise sur une seule note.
  const byCompany = new Map<string, typeof apps>();
  for (const a of apps) {
    const key = safeName(a.company);
    byCompany.set(key, [...(byCompany.get(key) ?? []), a]);
  }
  for (const [name, list] of byCompany) put(["Entreprises", `${name}.md`], companyNote(list[0].company, list));

  const { profiles: profileList, active } = listProfiles();
  for (const p of profileList) put(["Profils", `${safeName(p.name)}.md`], profileNote(p, p.id === active));

  const pending = readInbox().filter((j) => !j.done);
  put(["Jobiify.md"], indexNote({ apps, profiles: profileList, pending, generatedAt: new Date().toISOString().slice(0, 16).replace("T", " ") }));

  return { dir, applications: apps.length, companies: byCompany.size, profiles: profileList.length, pending: pending.length, files };
}
