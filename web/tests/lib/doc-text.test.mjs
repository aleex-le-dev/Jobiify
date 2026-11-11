import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";

import "../helpers/web-ts-alias-loader.mjs";

const { extractCvText, readZipEntry, xmlToText, rtfToText } = await import("../../src/lib/core/doc-text.ts");

/** Construit une archive ZIP minimale (une entrée), comme le ferait Word. */
function makeZip(name, content, { deflate = true } = {}) {
  const raw = Buffer.from(content, "utf8");
  const data = deflate ? zlib.deflateRawSync(raw) : raw;
  const nameBuf = Buffer.from(name, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(deflate ? 8 : 0, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(deflate ? 8 : 0, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42);
  const cdOffset = local.length + nameBuf.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + nameBuf.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]);
}

const DOC = `<w:document><w:body>
<w:p><w:r><w:t>Marie Exemple</w:t></w:r></w:p>
<w:p><w:r><w:t>Cariste</w:t></w:r><w:r><w:tab/><w:t>2019-2025</w:t></w:r></w:p>
<w:p><w:r><w:t>CACES 1 &amp; 3</w:t></w:r></w:p>
</w:body></w:document>`;

test("un .docx (compressé) donne le texte, un paragraphe par ligne", () => {
  const out = extractCvText("cv.docx", makeZip("word/document.xml", DOC));
  assert.deepEqual(out, { text: "Marie Exemple\nCariste 2019-2025\nCACES 1 & 3" });
});

test("une archive non compressée et des séparateurs Windows sont acceptés", () => {
  const zip = makeZip("word\\document.xml", DOC, { deflate: false });
  assert.ok(readZipEntry(zip, "word/document.xml"));
  assert.equal(extractCvText("cv.docx", zip).text.split("\n")[0], "Marie Exemple");
});

test("un .odt, un .rtf et un ancien .doc", () => {
  const odt = makeZip("content.xml", "<office:text><text:p>Jean Test</text:p><text:p>Technicien</text:p></office:text>");
  assert.deepEqual(extractCvText("cv.odt", odt), { text: "Jean Test\nTechnicien" });
  assert.equal(rtfToText("{\\rtf1\\ansi Jean\\par Technicien}"), "Jean\nTechnicien");
  assert.deepEqual(extractCvText("cv.doc", Buffer.from("x")), { error: "unsupported" });
});

test("un fichier corrompu est signalé illisible, un PDF reste lu par l'IA", () => {
  assert.deepEqual(extractCvText("cv.docx", Buffer.from("pas une archive")), { error: "unreadable" });
  assert.equal(extractCvText("cv.pdf", Buffer.from("%PDF-1.7")), null);
  assert.equal(xmlToText("<w:p><w:t>&#233;t&#xE9;</w:t></w:p>"), "été");
});
