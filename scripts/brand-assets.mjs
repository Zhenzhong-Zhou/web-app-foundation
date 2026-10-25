#!/usr/bin/env node
/**
 * The brand's files, made from the masters in docs/brand/ (ADR-082).
 *
 *     node scripts/brand-assets.mjs
 *
 * Writes every file in client/public/ that shows the mark: the tab's icons,
 * the home screens' and the manifest's, the picture a shared link's card
 * shows, and the mark the product's emails carry. A change to the mark is
 * made to the masters, then this is run and what it writes committed;
 * docs/brand/README.md lists which file comes from which master.
 *
 * Each PNG is drawn at its own size from the SVG, rather than scaled down
 * from a larger one, so the 16 px icon is as sharp as librsvg can make it.
 * The ICO holds its sizes as PNGs, which every browser that still reads an
 * ICO understands, so it needs no package of its own.
 *
 * It uses the server's sharp, the one its image code uses, so run
 * `npm install` in server/ first.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MASTERS = path.join(ROOT, "docs/brand");
const PUBLIC = path.join(ROOT, "client/public");

/** The mark on its navy plate, the master most of the files come from. */
const PLATE = "panivo-plate.svg";

/**
 * Each PNG, its master and its size: the height is the one the master's
 * shape gives at that width, which png() checks. Its test reads them here.
 */
export const PNGS = [
  {
    file: "apple-touch-icon.png",
    master: "panivo-app-icon-dark.svg",
    width: 180,
    height: 180,
  },
  { file: "icon-192.png", master: PLATE, width: 192, height: 192 },
  { file: "icon-512.png", master: PLATE, width: 512, height: 512 },
  {
    file: "icon-maskable-512.png",
    master: "panivo-app-icon-maskable.svg",
    width: 512,
    height: 512,
  },
  {
    file: "og-image.png",
    master: "panivo-link-preview.svg",
    width: 1200,
    height: 630,
  },
  { file: "brand/mail-mark.png", master: PLATE, width: 56, height: 56 },
];

/** The ICO's master and sizes. */
export const ICO = {
  file: "favicon.ico",
  master: PLATE,
  sizes: [16, 32, 48],
};

/**
 * A master drawn as a PNG `width` pixels wide, `height` high if given.
 * librsvg reads a viewBox's units as pixels at 72 dpi, so the density sets
 * the size. The server's sharp, loaded here, so its test can import the
 * lists above without it.
 */
async function png(master, width, height = width) {
  const sharp = createRequire(path.join(ROOT, "server/package.json"))("sharp");
  const svg = readFileSync(path.join(MASTERS, master));
  const { width: drawn } = await sharp(svg).metadata();
  const { data, info } = await sharp(svg, { density: (72 * width) / drawn })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  if (info.width !== width || info.height !== height) {
    throw new Error(
      `${master} came out ${info.width} × ${info.height} px, not ${width} × ${height}`,
    );
  }
  return data;
}

/** An ICO of square PNGs: a header, one entry per image, then the images. */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2); // an icon, not a cursor
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size, entry); // width
    header.writeUInt8(size, entry + 1); // height
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(({ data }) => data)]);
}

function write(file, data) {
  const to = path.join(PUBLIC, file);
  mkdirSync(path.dirname(to), { recursive: true });
  writeFileSync(to, data);
  console.log(`client/public/${file}: ${data.length} bytes`);
}

// Run, not imported: its test imports the lists.
if (import.meta.main) {
  for (const { file, master, width, height } of PNGS) {
    write(file, await png(master, width, height));
  }

  const images = await Promise.all(
    ICO.sizes.map(async (size) => ({
      size,
      data: await png(ICO.master, size),
    })),
  );
  write(ICO.file, ico(images));

  // The SVG icon is the plate's master as it is.
  copyFileSync(path.join(MASTERS, PLATE), path.join(PUBLIC, "favicon.svg"));
  console.log(`client/public/favicon.svg: a copy of docs/brand/${PLATE}`);
}
