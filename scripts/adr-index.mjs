#!/usr/bin/env node
/**
 * The ADRs' index, written from their files (ADR-086).
 *
 *     node scripts/adr-index.mjs            # writes the table in docs/adr/README.md
 *     node scripts/adr-index.mjs --check    # writes nothing; exits 1 if it is stale
 *
 * Reads every docs/adr/NNNN-*.md: its front matter (status, date, amends,
 * amended-by) and its heading, `# ADR-NNN — Title`. Writes one row per
 * file, in number order, between <!-- adr-index:start --> and
 * <!-- adr-index:end --> in docs/adr/README.md: ADR, Title, Status,
 * Date, Amends and Amended by. The title is the heading's after its
 * number, without its "(amends …)" tail, which the Amends column holds.
 * Each ADR named is a reference link, [ADR-071], defined once below the
 * table, so the raw table reads as plain text does.
 *
 * --check exits 1, naming the first line that differs, when the README's
 * table is not what this would write; scripts/check-docs.mjs runs the
 * same check. Neither checks the front matter itself: check-docs.mjs
 * does, with the functions exported here.
 *
 * Its tests, in adr-index.test.mjs, run it in a temporary folder:
 * `node --test scripts/`.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export const ADR_FOLDER = "docs/adr";
export const README = `${ADR_FOLDER}/README.md`;
const START = "<!-- adr-index:start -->";
const END = "<!-- adr-index:end -->";

/** An ADR's name as the text writes it: ADR-071. */
export const adrName = (number) => `ADR-${String(number).padStart(3, "0")}`;

/**
 * A front matter list, `[ADR-046, ADR-054]`, as the numbers it names;
 * null when it is not one.
 */
export function listOf(value) {
  if (!/^\[(?:ADR-\d{3,}(?:, ADR-\d{3,})*)?\]$/.test(value)) return null;
  return [...value.matchAll(/ADR-(\d+)/g)].map((match) => Number(match[1]));
}

/** The numbers an ADR's amends or amended-by names: none if it has no list. */
export const listed = (adr, field) =>
  listOf(adr.frontMatter?.[field]?.value ?? "[]") ?? [];

/**
 * Every docs/adr/NNNN-*.md, in number order: its file, the number its
 * name gives, its front matter's fields, each `{ value, line }` (null
 * when it has none, its unreadable lines in `malformed`), and its
 * heading (null when its first line after the front matter is not
 * `# ADR-NNN — Title`).
 */
export function readAdrs() {
  const folder = path.join(ROOT, ADR_FOLDER);
  if (!existsSync(folder)) return [];

  return readdirSync(folder)
    .filter((name) => /^\d{4}-.+\.md$/.test(name))
    .sort()
    .map((name) => {
      const file = `${ADR_FOLDER}/${name}`;
      const lines = readFileSync(path.join(ROOT, file), "utf8").split("\n");

      let frontMatter = null;
      const malformed = [];
      let at = 0;
      const end = lines.findIndex((line, i) => i > 0 && line === "---");
      if (lines[0] === "---" && end > 0) {
        frontMatter = {};
        for (at = 1; at < end; at++) {
          const field = /^([a-z-]+): (.+)$/.exec(lines[at]);
          if (field) frontMatter[field[1]] = { value: field[2], line: at + 1 };
          else malformed.push({ text: lines[at], line: at + 1 });
        }
        at = end + 1;
      }
      while (at < lines.length && !lines[at].trim()) at++;

      const heading = /^# ADR-(\d+) — (.+)$/.exec(lines[at] ?? "");
      return {
        file,
        number: Number(name.slice(0, 4)),
        frontMatter,
        malformed,
        heading: heading && {
          line: at + 1,
          number: Number(heading[1]),
          title: heading[2].replace(/ \(amends [^()]*\)$/, ""),
        },
      };
    });
}

/** The text between the markers: the table, then its links' definitions. */
function indexOf(adrs) {
  const files = new Map(adrs.map((adr) => [adr.number, adr.file]));
  // An ADR with no file stays plain text; check-docs.mjs reports it.
  const named = (number) =>
    files.has(number) ? `[${adrName(number)}]` : adrName(number);
  const names = (adr, field) => listed(adr, field).map(named).join(", ");
  const cell = (text) => (text ? ` ${text} ` : " ");

  const rows = adrs.map((adr) => {
    const fields = adr.frontMatter ?? {};
    const status = (fields.status?.value ?? "").replace(
      /ADR-(\d+)/g,
      (_, number) => named(Number(number)),
    );
    return `|${[
      `[${adrName(adr.number)}]`,
      adr.heading?.title,
      status,
      fields.date?.value,
      names(adr, "amends"),
      names(adr, "amended-by"),
    ]
      .map(cell)
      .join("|")}|`;
  });
  const definitions = adrs.map(
    (adr) => `[${adrName(adr.number)}]: ${path.posix.basename(adr.file)}`,
  );

  return `

| ADR | Title | Status | Date | Amends | Amended by |
| --- | --- | --- | --- | --- | --- |
${rows.join("\n")}

${definitions.join("\n")}

`;
}

/** The README's text and where its markers are; a failure when it has none. */
function readme() {
  const text = readFileSync(path.join(ROOT, README), "utf8");
  const start = text.indexOf(START);
  const end = text.indexOf(END, start);
  if (start < 0 || end < 0) {
    return {
      failure: `${README}:1: the index — no ${START} and ${END} to write it between; add them under its "By number" heading`,
    };
  }
  return { text, from: start + START.length, to: end };
}

/**
 * Why the README's table is not what the ADRs' files say, as
 * `README.md:line: …`, naming its first line that differs; null when it
 * is current.
 */
export function staleIndex(adrs) {
  const { text, from, to, failure } = readme();
  if (failure) return failure;

  const has = text.slice(from, to).split("\n");
  const wants = indexOf(adrs).split("\n");
  const length = Math.max(has.length, wants.length);
  let at = 0;
  while (at < length && has[at] === wants[at]) at++;
  if (at === length) return null;

  const line = text.slice(0, from).split("\n").length + at;
  const shown = (row) => (row === undefined ? "the index's end" : `"${row}"`);
  return `${README}:${line}: the index — stale: it has ${shown(has[at])} where the ADRs give ${shown(wants[at])}; run node scripts/adr-index.mjs`;
}

if (import.meta.main) {
  const check = process.argv[2] === "--check";
  if (process.argv.length > 3 || (process.argv[2] && !check)) {
    console.error(
      "Usage:\n  node scripts/adr-index.mjs\n  node scripts/adr-index.mjs --check",
    );
    process.exit(1);
  }
  if (!existsSync(path.join(ROOT, README))) {
    console.error(
      `${README}: not found. It holds the index, under "By number", between ${START} and ${END}.`,
    );
    process.exit(1);
  }

  const adrs = readAdrs();
  if (check) {
    const stale = staleIndex(adrs);
    if (stale) {
      console.error(stale);
      process.exit(1);
    }
    console.log(`${README}: the index of ${adrs.length} ADRs is current.`);
  } else {
    const { text, from, to, failure } = readme();
    if (failure) {
      console.error(failure);
      process.exit(1);
    }
    writeFileSync(
      path.join(ROOT, README),
      text.slice(0, from) + indexOf(adrs) + text.slice(to),
    );
    console.log(`${README}: the index of ${adrs.length} ADRs written.`);
  }
}
