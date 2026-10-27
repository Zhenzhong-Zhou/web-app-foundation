#!/usr/bin/env node
/**
 * The ADRs' index, written from their files, and the rules those files
 * keep (ADR-086).
 *
 *     node scripts/adr-index.mjs            # writes the table in docs/adr/README.md
 *     node scripts/adr-index.mjs --check    # writes nothing; exits 1 if it is stale
 *
 * Every ADR, docs/adr/NNNN-*.md, has a number no other file has, and
 * front matter with its status (accepted, deferred or superseded by an
 * ADR that exists) and its date (YYYY-MM-DD), in any order, and no
 * field but those, amends and amended-by. Its heading, `# ADR-NNN —
 * Title`, has its file's number. Each ADR its `amends` names exists and
 * lists it in its `amended-by`, and each one its `amended-by` names lists
 * it in its `amends`; both lists are in ascending order. Once there is an
 * ADR, docs/adr/README.md holds their index.
 *
 * The index is one row per file, in number order, between
 * <!-- adr-index:start --> and <!-- adr-index:end --> in the README: ADR,
 * Title, Status, Date, Amends and Amended by. The title is the heading's
 * after its number, without its "(amends …)" tail, which the Amends
 * column holds. Each ADR named is a reference link, [ADR-071], defined
 * once below the table, so the raw table reads as plain text does.
 *
 * Both modes check the ADRs first and stop on a failure, printed as
 * `file:line: target — reason`, so an index is written only from ADRs
 * that pass. --check then exits 1, naming the first line that differs,
 * when the README's table is not what this would write.
 * scripts/check-docs.mjs runs the same checks, --check's included, with
 * checkAdrs().
 *
 * Its tests, in adr-index.test.mjs, run it in a temporary folder:
 * `node --test scripts/`.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const ADR_FOLDER = "docs/adr";
const README = `${ADR_FOLDER}/README.md`;
const START = "<!-- adr-index:start -->";
const END = "<!-- adr-index:end -->";

const STATUS = /^(?:accepted|deferred|superseded by ADR-(\d{3,}))$/;

/** An ADR's front matter fields, in any order. */
const FIELDS = ["status", "date", "amends", "amended-by"];

/** An ADR's name as the text writes it: ADR-071. */
const adrName = (number) => `ADR-${String(number).padStart(3, "0")}`;

/**
 * A YYYY-MM-DD that is a day of the calendar. A month past 12 or a day
 * past 31 makes no Date at all; 2026-02-30 makes 2 March.
 */
function isDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(value);
}

/**
 * A front matter list, `[ADR-046, ADR-054]`, as the numbers it names;
 * null when it is not one.
 */
function listOf(value) {
  if (!/^\[(?:ADR-\d{3,}(?:, ADR-\d{3,})*)?\]$/.test(value)) return null;
  return [...value.matchAll(/ADR-(\d+)/g)].map((match) => Number(match[1]));
}

/** The numbers an ADR's amends or amended-by names: none if it has no list. */
const listed = (adr, field) =>
  listOf(adr.frontMatter?.[field]?.value ?? "[]") ?? [];

/**
 * Where a Markdown file's front matter ends: the index of the --- line
 * that closes it, when its first line is a --- that opens it; -1 when it
 * has none.
 */
export function frontMatterEnd(lines) {
  if (!/^---\s*$/.test(lines[0])) return -1;
  return lines.findIndex((line, i) => i > 0 && /^---\s*$/.test(line));
}

/**
 * Every docs/adr/NNNN-*.md, in number order: its file, the number its
 * name gives, its front matter's fields, each `{ value, line }` (null
 * when it has none, its unreadable lines in `malformed`), and its
 * heading (null when its first line after the front matter is not
 * `# ADR-NNN — Title`).
 */
function readAdrs() {
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
      const end = frontMatterEnd(lines);
      if (end > 0) {
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
  // An ADR with no file stays plain text; checkAdrs() reports it.
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

/**
 * The README's text and where its markers are; a failure when it has
 * none, or there is no README.
 */
function readme() {
  if (!existsSync(path.join(ROOT, README))) {
    return {
      failure: `${README}: the index — no such file: write it with a "By number" heading, ${START} and ${END} under it, then run node scripts/adr-index.mjs`,
    };
  }
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
function staleIndex(adrs, { text, from, to }) {
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

/**
 * The ADRs in docs/adr/ against the rules above, and the README that
 * holds their index, which must be current unless it is about to be
 * written. A stale index is reported only once the ADRs pass, since it
 * is written from them.
 */
export function checkAdrs({ writing = false } = {}) {
  const found = readAdrs();
  const byNumber = new Map(found.map((adr) => [adr.number, adr]));
  const failures = [];

  for (const adr of found) {
    const name = adrName(adr.number);
    const fail = (line, what, reason) =>
      failures.push(`${adr.file}:${line}: ${what} — ${reason}`);
    const fields = adr.frontMatter ?? {};

    const sharing = found.filter(
      (other) => other !== adr && other.number === adr.number,
    );
    if (sharing.length > 0) {
      fail(
        1,
        name,
        `also the number of ${sharing.map((other) => other.file).join(", ")}; each ADR has its own`,
      );
    }

    if (!adr.frontMatter) {
      fail(
        1,
        "front matter",
        "none: an ADR opens with its status and date between --- lines",
      );
    }
    for (const { text, line } of adr.malformed) {
      fail(
        line,
        text,
        "not a field: each line is a name, a colon and its value",
      );
    }
    for (const [field, { value, line }] of Object.entries(fields)) {
      if (!FIELDS.includes(field)) {
        fail(
          line,
          `${field}: ${value}`,
          `not a field an ADR has: ${FIELDS.join(", ")}`,
        );
      }
    }
    if (adr.frontMatter && !fields.status) {
      fail(1, "status", "missing from the front matter");
    } else if (fields.status) {
      const status = STATUS.exec(fields.status.value);
      if (!status) {
        fail(
          fields.status.line,
          `status: ${fields.status.value}`,
          "not accepted, deferred or superseded by ADR-NNN",
        );
      } else if (status[1] && !byNumber.has(Number(status[1]))) {
        fail(
          fields.status.line,
          `status: ${fields.status.value}`,
          `no such ADR in ${ADR_FOLDER}/`,
        );
      }
    }
    if (adr.frontMatter && !fields.date) {
      fail(1, "date", "missing from the front matter");
    } else if (fields.date && !isDay(fields.date.value)) {
      fail(
        fields.date.line,
        `date: ${fields.date.value}`,
        "not a day as YYYY-MM-DD",
      );
    }

    if (!adr.heading) {
      fail(
        1,
        "heading",
        `none: the first line after the front matter is # ${name} — its title`,
      );
    } else if (adr.heading.number !== adr.number) {
      fail(
        adr.heading.line,
        adrName(adr.heading.number),
        `the heading's number is not the file's, ${name}`,
      );
    }

    for (const [field, other, fix] of [
      ["amends", "amended-by", "add it there"],
      ["amended-by", "amends", "add it there, or take it out of this list"],
    ]) {
      if (!fields[field]) continue;
      const { value, line } = fields[field];
      const numbers = listOf(value);
      if (!numbers) {
        fail(line, `${field}: ${value}`, "not a list as [ADR-046, ADR-054]");
        continue;
      }
      if (numbers.some((number, i) => i > 0 && number <= numbers[i - 1])) {
        const ascending = [...new Set(numbers)].sort((a, b) => a - b);
        fail(
          line,
          `${field}: ${value}`,
          `not in ascending order, each ADR once: write it as [${ascending.map(adrName).join(", ")}]`,
        );
      }
      for (const number of numbers) {
        const named = byNumber.get(number);
        if (!named) {
          fail(
            line,
            `${field}: ${adrName(number)}`,
            `no such ADR in ${ADR_FOLDER}/`,
          );
        } else if (!listed(named, other).includes(adr.number)) {
          fail(
            line,
            `${field}: ${adrName(number)}`,
            `${adrName(number)}'s ${other} does not list ${name}; ${fix}`,
          );
        }
      }
    }
  }

  // Writing needs the README even before the first ADR.
  if (found.length > 0 || writing) {
    const index = readme();
    if (index.failure) {
      failures.push(index.failure);
    } else if (!writing && failures.length === 0) {
      const stale = staleIndex(found, index);
      if (stale) failures.push(stale);
    }
  }
  const checked = `ADRs in ${ADR_FOLDER}/: ${found.length}, each with its front matter and heading, and its amendments recorded both ways`;
  return {
    failures,
    summary:
      found.length > 0 && !writing
        ? `${checked}; the index in README.md current.`
        : `${checked}.`,
  };
}

if (import.meta.main) {
  const check = process.argv[2] === "--check";
  if (process.argv.length > 3 || (process.argv[2] && !check)) {
    console.error(
      "Usage:\n  node scripts/adr-index.mjs\n  node scripts/adr-index.mjs --check",
    );
    process.exit(1);
  }

  const { failures, summary } = checkAdrs({ writing: !check });
  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    if (!check)
      console.error(
        "Nothing written: the index is written only from ADRs that pass.",
      );
    process.exit(1);
  }
  if (check) {
    console.log(summary);
  } else {
    const adrs = readAdrs();
    const { text, from, to } = readme();
    writeFileSync(
      path.join(ROOT, README),
      text.slice(0, from) + indexOf(adrs) + text.slice(to),
    );
    console.log(`${README}: the index of ${adrs.length} ADRs written.`);
  }
}
