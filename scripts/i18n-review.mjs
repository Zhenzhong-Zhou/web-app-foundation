#!/usr/bin/env node
/**
 * The fluent review of ADR-054's French and Chinese (MC-1405, step 4).
 *
 *     node scripts/i18n-review.mjs export            # review/fr-CA.xlsx, review/zh-Hans.xlsx
 *     node scripts/i18n-review.mjs import review/fr-CA.xlsx
 *
 * Export writes one workbook per language, covering everything a person
 * reads: the screens and printed documents (client/src/locales) and the
 * server's refusals, emails and notifications (server/src/i18n). One row
 * per message: where it is, the English, the translation as it stands, and
 * an empty Correction column for the reviewer. The placeholders a message
 * must keep are listed beside it, since a translation that drops {sku}
 * would print a blank where the SKU belongs.
 *
 * Import reads a returned workbook, takes every non-empty Correction, and
 * writes it into the right catalogue. It refuses the whole file, writing
 * nothing, if any correction is not valid ICU or does not keep exactly the
 * English's placeholders; the problems are listed by row. Afterwards, run
 * `npm run i18n:check` in client/ and server/ and look at `git diff`.
 *
 * No dependencies of its own: a workbook is a zip of XML, and Node has
 * zlib. It uses the FormatJS CLI and ICU parser each package already has,
 * so run `npm install` in client/ and server/ first.
 *
 * The workbooks are working files, not the source of truth: review/ is
 * git-ignored, and what matters lands as a commit to the catalogues.
 */
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, inflateRawSync } from "node:zlib";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LANGUAGES = ["fr-CA", "zh-Hans"];

/** The two packages and where each keeps its catalogues. */
const AREAS = [
  {
    name: "Screens",
    package: "client",
    catalogues: "client/src/locales",
    extract: [
      "src/**/*.{ts,tsx}",
      "--ignore",
      "src/**/*.test.{ts,tsx}",
      "--ignore",
      "src/test/**",
    ],
  },
  {
    name: "Server",
    package: "server",
    catalogues: "server/src/i18n",
    extract: [
      "src/**/*.ts",
      "--ignore",
      "src/**/*.spec.ts",
      "--ignore",
      "src/i18n/translate.ts",
      "--additional-function-names",
      "t",
    ],
  },
];

const COLUMNS = [
  { title: "Area", width: 10 },
  { title: "Id", width: 34 },
  { title: "Where", width: 34 },
  { title: "English", width: 60 },
  { title: "Translation", width: 60 },
  { title: "Correction", width: 60 },
  { title: "Note", width: 30 },
  { title: "Placeholders to keep", width: 22 },
];

const require = createRequire(path.join(ROOT, "client/package.json"));
const { parse, TYPE } = require("@formatjs/icu-messageformat-parser");

const read = (file) => JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));

// ---------------------------------------------------------------- messages

/** Every message in an area, with the file it is defined in. */
function messagesOf(area) {
  const scratch = mkdtempSync(path.join(tmpdir(), "review-"));
  const out = path.join(scratch, "messages.json");
  const cwd = path.join(ROOT, area.package);

  try {
    execFileSync(
      path.join(cwd, "node_modules/.bin/formatjs"),
      [
        "extract",
        ...area.extract,
        "--extract-source-location",
        "--out-file",
        out,
      ],
      { cwd, stdio: ["ignore", "ignore", "inherit"] },
    );
    return JSON.parse(readFileSync(out, "utf8"));
  } catch {
    console.error(
      `Could not read ${area.package}'s messages. Is ${area.package}/node_modules installed?`,
    );
    process.exit(1);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** The placeholder and tag names a message uses, select and plural included. */
function placeholders(message) {
  const names = new Set();
  const walk = (elements) => {
    for (const element of elements) {
      if (
        element.type === TYPE.argument ||
        element.type === TYPE.number ||
        element.type === TYPE.date ||
        element.type === TYPE.time ||
        element.type === TYPE.select ||
        element.type === TYPE.plural
      ) {
        names.add(`{${element.value}}`);
      }
      if (element.type === TYPE.tag) {
        names.add(`<${element.value}>`);
        walk(element.children);
      }
      if (element.type === TYPE.select || element.type === TYPE.plural) {
        for (const option of Object.values(element.options)) walk(option.value);
      }
    }
  };
  walk(parse(message));
  return names;
}

// ------------------------------------------------------------------ export

function exportWorkbooks() {
  mkdirSync(path.join(ROOT, "review"), { recursive: true });
  const sources = AREAS.map((area) => ({
    area,
    english: read(`${area.catalogues}/en.json`),
    found: messagesOf(area),
  }));

  for (const language of LANGUAGES) {
    const rows = [COLUMNS.map((column) => column.title)];

    for (const { area, english, found } of sources) {
      const translated = read(`${area.catalogues}/${language}.json`);

      for (const id of Object.keys(english).sort()) {
        const where = found[id]?.file
          ? `${area.package}/${found[id].file}`
          : "";
        rows.push([
          area.name,
          id,
          where,
          english[id],
          translated[id] ?? "",
          "",
          "",
          [...placeholders(english[id])].join(" "),
        ]);
      }
    }

    const file = path.join(ROOT, "review", `${language}.xlsx`);
    writeFileSync(file, workbook(language, rows));
    console.log(
      `${path.relative(ROOT, file)}: ${rows.length - 1} messages to review.`,
    );
  }
}

// ------------------------------------------------------------------ import

function importWorkbook(file) {
  const { sheetName, rows } = readWorkbook(readFileSync(file));
  const language = sheetName;

  if (!LANGUAGES.includes(language)) {
    console.error(
      `The sheet is named "${sheetName}", not one of ${LANGUAGES.join(", ")}. ` +
        "Import the workbook export wrote, renamed or not, but keep its sheet name.",
    );
    process.exit(1);
  }

  const header = rows[0] ?? [];
  const column = (title) => header.indexOf(title);
  const [areaAt, idAt, correctionAt] = ["Area", "Id", "Correction"].map(column);
  if ([areaAt, idAt, correctionAt].includes(-1)) {
    console.error(
      "The first row must keep the Area, Id and Correction titles.",
    );
    process.exit(1);
  }

  const catalogues = Object.fromEntries(
    AREAS.map((area) => [
      area.name,
      {
        area,
        english: read(`${area.catalogues}/en.json`),
        translated: read(`${area.catalogues}/${language}.json`),
        changed: 0,
      },
    ]),
  );

  const problems = [];

  rows.slice(1).forEach((row, index) => {
    const correction = (row[correctionAt] ?? "").trim();
    if (!correction) return;

    const at = `row ${index + 2}`;
    const target = catalogues[row[areaAt]];
    const id = row[idAt];

    if (!target || !(id in target.english)) {
      problems.push(`${at}: no message ${id} in ${row[areaAt]}`);
      return;
    }

    let theirs;
    try {
      theirs = placeholders(correction);
    } catch (error) {
      problems.push(`${at} ${id}: not valid ICU (${error.message})`);
      return;
    }

    const ours = placeholders(target.english[id]);
    const same =
      theirs.size === ours.size && [...ours].every((name) => theirs.has(name));
    if (!same) {
      problems.push(
        `${at} ${id}: keeps ${[...theirs].join(" ") || "no placeholders"}; ` +
          `the English has ${[...ours].join(" ") || "none"}`,
      );
      return;
    }

    if (target.translated[id] !== correction) {
      target.translated[id] = correction;
      target.changed += 1;
    }
  });

  if (problems.length > 0) {
    console.error(
      `Nothing written. Fix these in the workbook and import it again:\n  ${problems.join("\n  ")}`,
    );
    process.exit(1);
  }

  for (const { area, translated, changed } of Object.values(catalogues)) {
    if (changed === 0) continue;
    const sorted = Object.fromEntries(
      Object.entries(translated).sort(([a], [b]) => (a < b ? -1 : 1)),
    );
    writeFileSync(
      path.join(ROOT, area.catalogues, `${language}.json`),
      `${JSON.stringify(sorted, null, 2)}\n`,
    );
    console.log(`${area.catalogues}/${language}.json: ${changed} corrected.`);
  }

  console.log(
    "Now run `npm run i18n:check` in client/ and server/, then look at `git diff`.",
  );
}

// ---------------------------------------------------------------- workbook

const escapeXml = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // XML 1.0 has no place for most control characters.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const letter = (index) =>
  index < 26
    ? String.fromCharCode(65 + index)
    : letter(Math.floor(index / 26) - 1) + letter(index % 26);

/** A one-sheet .xlsx: bold header, frozen top row, filter, wrapped text. */
function workbook(sheetName, rows) {
  const last = `${letter(COLUMNS.length - 1)}${rows.length}`;
  const cells = rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row
          .map(
            (value, c) =>
              `<c r="${letter(c)}${r + 1}" t="inlineStr" s="${r === 0 ? 1 : c === 5 ? 3 : 2}"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`,
          )
          .join("")}</row>`,
    )
    .join("");

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${COLUMNS.map((column, i) => `<col min="${i + 1}" max="${i + 1}" width="${column.width}" customWidth="1"/>`).join("")}</cols>
<sheetData>${cells}</sheetData>
<autoFilter ref="A1:${last}"/>
</worksheet>`;

  // 0 default, 1 header (bold, grey), 2 wrapped, 3 the Correction column
  // (wrapped, pale yellow: the one the reviewer fills in).
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF7CC"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="4"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf fillId="3" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  return zip([
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sheetName}'!$A$1:$${letter(COLUMNS.length - 1)}$${rows.length}</definedName></definedNames></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ["xl/worksheets/sheet1.xml", sheet],
    ["xl/styles.xml", styles],
  ]);
}

/** The sheet name and every row's cell text, from a workbook Excel or Sheets saved. */
function readWorkbook(buffer) {
  const files = unzip(buffer);
  const text = (name) => files.get(name)?.toString("utf8");

  const unescapeXml = (value) =>
    value
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
        String.fromCodePoint(parseInt(code, 16)),
      )
      .replace(/&amp;/g, "&");
  // A cell's text, rich text runs joined.
  const runs = (xml) =>
    [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((match) => unescapeXml(match[1]))
      .join("");

  const shared = [
    ...(text("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g),
  ].map((match) => runs(match[1]));

  const workbookXml = text("xl/workbook.xml") ?? "";
  const sheetName = unescapeXml(
    /<sheet\s[^>]*name="([^"]*)"/.exec(workbookXml)?.[1] ?? "",
  );

  // The first sheet, wherever the relationships put it.
  const relationId = /<sheet\s[^>]*r:id="([^"]*)"/.exec(workbookXml)?.[1];
  const target = new RegExp(
    `<Relationship[^>]*Id="${relationId}"[^>]*Target="([^"]*)"`,
  ).exec(text("xl/_rels/workbook.xml.rels") ?? "")?.[1];
  const sheetPath = target
    ? path.posix.join("xl", target.replace(/^\/?xl\//, ""))
    : "xl/worksheets/sheet1.xml";
  const sheet = text(sheetPath) ?? "";

  const columnIndex = (reference) =>
    [...reference.replace(/\d+$/, "")].reduce(
      (total, char) => total * 26 + (char.charCodeAt(0) - 64),
      0,
    ) - 1;

  const rows = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cell of rowMatch[1].matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const attributes = cell[1];
      const body = cell[2] ?? "";
      const reference = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1];
      const type = /\bt="([^"]*)"/.exec(attributes)?.[1];
      const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];

      const content =
        type === "s"
          ? (shared[Number(value)] ?? "")
          : type === "inlineStr"
            ? runs(body)
            : value !== undefined
              ? unescapeXml(value)
              : "";
      row[reference ? columnIndex(reference) : row.length] = content;
    }
    rows.push(Array.from(row, (value) => value ?? ""));
  }

  return { sheetName, rows };
}

// --------------------------------------------------------------------- zip

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const data = Buffer.from(content, "utf8");
    const packed = deflateRawSync(data);
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + packed.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, end]);
}

function unzip(buffer) {
  const files = new Map();
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("Not a workbook: no zip directory found");

  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);

  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(at + 10);
    const packedSize = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localAt = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);

    const dataAt =
      localAt +
      30 +
      buffer.readUInt16LE(localAt + 26) +
      buffer.readUInt16LE(localAt + 28);
    const packed = buffer.subarray(dataAt, dataAt + packedSize);
    files.set(name, method === 8 ? inflateRawSync(packed) : packed);

    at += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

// ------------------------------------------------------------------- main

const [command, file] = process.argv.slice(2);

if (command === "export") {
  exportWorkbooks();
} else if (command === "import" && file) {
  importWorkbook(path.resolve(file));
} else {
  console.error(
    "Usage:\n  node scripts/i18n-review.mjs export\n  node scripts/i18n-review.mjs import review/fr-CA.xlsx",
  );
  process.exit(1);
}
