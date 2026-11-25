import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { applyMark, normalizeMarks, type Mark } from "@/lib/offer-marks.mjs";
import { atomicWrite } from "./safe-write";

/** data/offer-marks.json : couche utilisateur, jamais versionnée. */
const file = () => path.join(careerOpsRoot(), "data", "offer-marks.json");

export type MarkStore = Record<string, { mark: Mark; at: string; k?: string }>;
export type MarkableOffer = { url?: string; title?: string; company?: string; location?: string };

export function readMarks(): MarkStore {
  try {
    return normalizeMarks(JSON.parse(fs.readFileSync(file(), "utf8")));
  } catch {
    return {};
  }
}

/** Écrit un magasin déjà calculé (ex. après avoir masqué une entreprise). */
export function writeMarksRaw(store: MarkStore): void {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  atomicWrite(file(), `${JSON.stringify({ version: 1, marks: store })}\n`);
}

export function writeMarks(offers: MarkableOffer[], mark: Mark | null): MarkStore {
  const next = applyMark(readMarks(), offers, mark);
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  atomicWrite(file(), `${JSON.stringify({ version: 1, marks: next })}\n`);
  return next;
}
