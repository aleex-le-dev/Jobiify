import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fontsSource = readFileSync(new URL("../../src/lib/fonts.ts", import.meta.url), "utf8");
const assets = [
  "../../src/assets/fonts/hanken-grotesk/hanken-grotesk-latin-wght-normal.woff2",
  "../../src/assets/fonts/bricolage-grotesque/bricolage-grotesque-latin-wght-normal.woff2",
  "../../src/assets/fonts/jetbrains-mono/jetbrains-mono-latin-wght-normal.woff2",
];

test("web fonts are local and never use the Google build-time loader", () => {
  assert.match(fontsSource, /next\/font\/local/);
  assert.doesNotMatch(fontsSource, /next\/font\/google/);
});

test("every configured WOFF2 asset is vendored", () => {
  for (const relativePath of assets) {
    const bytes = readFileSync(new URL(relativePath, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "wOF2", `${relativePath} is not a WOFF2 file`);
    const configuredPath = relativePath.replace("../../src/", "../");
    const escapedPath = configuredPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(fontsSource, new RegExp(`path:\\s*["']${escapedPath}["']`));
  }
});

test("every vendored font family includes its OFL license", () => {
  for (const relativePath of [
    "../../src/assets/fonts/hanken-grotesk/OFL.txt",
    "../../src/assets/fonts/bricolage-grotesque/OFL.txt",
    "../../src/assets/fonts/jetbrains-mono/OFL.txt",
  ]) {
    assert.match(readFileSync(new URL(relativePath, import.meta.url), "utf8"), /SIL OPEN FONT LICENSE Version 1\.1/);
  }
});
