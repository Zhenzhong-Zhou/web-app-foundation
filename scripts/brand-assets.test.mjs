/**
 * Tests for brand-assets.mjs's files, on Node's own runner: scripts/ sits
 * outside both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * They read what the script wrote to client/public/, as committed: each
 * file there at the size docs/brand/README.md gives it, and the ICO's
 * three sizes each a PNG where its entry says. They cannot say the files
 * match the masters, since librsvg's pixels may differ by a shade from one
 * machine to the next; after changing a master, run the script.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ICO, PNGS } from "./brand-assets.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "client/public");

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** A PNG's width and height, from its header chunk. */
function sizeOf(png) {
  assert.deepEqual(png.subarray(0, 8), PNG_SIGNATURE, "not a PNG");
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

const read = (file) => readFileSync(path.join(PUBLIC, file));

test("each PNG is at its size", () => {
  for (const { file, width, height } of PNGS) {
    assert.deepEqual(sizeOf(read(file)), [width, height], file);
  }
});

test("the ICO holds 16, 32 and 48 px, each a PNG", () => {
  const ico = read(ICO.file);
  assert.equal(ico.readUInt16LE(2), 1, "an icon");
  const count = ico.readUInt16LE(4);
  const entries = Array.from({ length: count }, (_, i) => {
    const at = 6 + 16 * i;
    const length = ico.readUInt32LE(at + 8);
    const offset = ico.readUInt32LE(at + 12);
    const png = ico.subarray(offset, offset + length);
    return { declared: ico.readUInt8(at), size: sizeOf(png) };
  });
  assert.deepEqual(
    entries,
    ICO.sizes.map((size) => ({ declared: size, size: [size, size] })),
  );
});

test("the SVG icon is the plate's master, as it is", () => {
  assert.equal(
    read("favicon.svg").toString(),
    readFileSync(path.join(ROOT, "docs/brand", ICO.master), "utf8"),
  );
});
