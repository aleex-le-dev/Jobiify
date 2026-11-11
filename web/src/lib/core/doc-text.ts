import zlib from "node:zlib";

/**
 * Extraction du texte des CV Word / OpenDocument / RTF, en local et sans dépendance.
 * Un .docx ou un .odt est une archive ZIP de XML : on lit le répertoire central de
 * l'archive, on décompresse le seul fichier utile (word/document.xml ou content.xml)
 * et on garde le texte, un paragraphe par ligne. L'outil IA n'a ensuite qu'à
 * structurer ce texte — son outil de lecture ne sait pas ouvrir les fichiers Word.
 */

const MAX_ENTRY_BYTES = 20 * 1024 * 1024;

/** Lit une entrée d'une archive ZIP (méthodes « stocké » et « deflate »). */
export function readZipEntry(zip: Buffer, wanted: string): Buffer | null {
  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la fin.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries && p + 46 <= zip.length; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    // Certains outils Windows écrivent « word\document.xml » : on accepte les deux séparateurs.
    const name = zip.toString("utf8", p + 46, p + 46 + nameLen).replace(/\\/g, "/");
    if (name === wanted) {
      if (size > MAX_ENTRY_BYTES) return null;
      const lnameLen = zip.readUInt16LE(localOffset + 26);
      const lextraLen = zip.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lnameLen + lextraLen;
      const data = zip.subarray(start, start + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** XML Word / OpenDocument → texte : fins de paragraphe et tabulations conservées. */
export function xmlToText(xml: string): string {
  return decode(
    xml
      // Les espaces entre balises ne sont pas du texte (mise en forme du fichier XML).
      .replace(/>\s+</g, "><")
      .replace(/<w:tab\/>|<text:tab\/>/g, "\t")
      .replace(/<w:br[^>]*\/>|<text:line-break\/>/g, "\n")
      .replace(/<\/w:p>|<\/text:p>|<\/text:h>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l, i, arr) => l || (i > 0 && arr[i - 1]))
    .join("\n")
    .trim();
}

/** RTF → texte (suffisant pour un CV : on retire les groupes de contrôle). */
export function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\par[d]? ?/g, "\n")
    .replace(/\\'([0-9a-f]{2})/gi, (_, h: string) => Buffer.from([parseInt(h, 16)]).toString("latin1"))
    .replace(/\\u(-?\d+)\??/g, (_, n: string) => String.fromCharCode((Number(n) + 65536) % 65536))
    .replace(/\{\\\*[^{}]*\}/g, "")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ExtractResult = { text: string } | { error: "unsupported" | "unreadable" };

/** Texte d'un CV selon son extension ; null = format lu directement par l'outil IA (PDF, image). */
export function extractCvText(fileName: string, bytes: Buffer): ExtractResult | null {
  const ext = (fileName.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
  try {
    if (ext === ".docx" || ext === ".docm" || ext === ".dotx") {
      const xml = readZipEntry(bytes, "word/document.xml");
      if (!xml) return { error: "unreadable" };
      const text = xmlToText(xml.toString("utf8"));
      return text ? { text } : { error: "unreadable" };
    }
    if (ext === ".odt") {
      const xml = readZipEntry(bytes, "content.xml");
      if (!xml) return { error: "unreadable" };
      const text = xmlToText(xml.toString("utf8"));
      return text ? { text } : { error: "unreadable" };
    }
    if (ext === ".rtf") {
      const text = rtfToText(bytes.toString("latin1"));
      return text ? { text } : { error: "unreadable" };
    }
    if (ext === ".doc") return { error: "unsupported" }; // ancien format binaire Word 97-2003
  } catch {
    return { error: "unreadable" };
  }
  return null;
}
