#!/usr/bin/env node
/**
 * The ADRs' index, written from their files, and the rules those files
 * keep (ADR-086).
 *
 *     node scripts/adr-index.mjs            # writes the table in docs/adr/README.md
 *     node scripts/adr-index.mjs --check    # writes nothing; exits 1 if it is stale or an ADR fails
 *
 * It reads the repository it is run in, from any folder of it.
 *
 * Every ADR, docs/adr/NNNN-<slug>.md (four digits, then lower-case words
 * and numbers joined by hyphens), has a number no other file has, and
 * front matter with its status (accepted, deferred or superseded by an
 * ADR that exists), its date (YYYY-MM-DD) and its areas (one or more of
 * AREAS, in that list's order), in any order, and no field but those,
 * amends and amended-by. Its heading, `# ADR-NNN — Title`, has its
 * file's number. Each ADR its `amends` names exists and lists it in its
 * `amended-by`, and each one its `amended-by` names lists it in its
 * `amends`; both lists are in ascending order. An amendment headed with
 * another ADR's number, `## Amendment … (ADR-072)`, is in its file's
 * `amended-by`. Once there is an ADR, docs/adr/README.md holds their
 * index, and open-decisions.md and template.md are the folder's only
 * other files.
 *
 * The index is two sections of the README. By number, between
 * <!-- adr-index:start --> and <!-- adr-index:end -->: one row per file,
 * in number order, with ADR, Title, Status, Date, Amends and Amended by.
 * The title is the heading's after its number, without its "(amends …)"
 * tail, which the Amends column holds. Each ADR named is a reference
 * link, [ADR-071], defined once below the table, so the raw table reads
 * as plain text does. By area, between <!-- adr-areas:start --> and
 * <!-- adr-areas:end -->: one line per area in AREAS' order, its ADRs in
 * number order by the same links; an area no ADR names has no line.
 *
 * Both modes check the ADRs first and stop on a failure, printed as
 * `file:line: target — reason`, so an index is written only from ADRs
 * that pass. --check then exits 1, naming the first line that differs,
 * when the README's index is not what this would write.
 * scripts/check-docs.mjs runs the same checks, --check's included, with
 * checkAdrs().
 *
 * Its tests, in adr-index.test.mjs, run it in a temporary repository:
 * `node --test scripts/`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** The root of the repository it is run in. */
const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

/** The repository's listing, once inRepository() has made it. */
let listing = null;

/**
 * Every file git tracks or would track, relative to ROOT, so not tmp/ or
 * the .DS_Store a Mac leaves; every folder holding one, "" the root's; and
 * the files git would track but does not yet, for check-docs.mjs's notice;
 * each in the letter case git has it. Listed once a run, for the ADRs'
 * checks here and check-docs.mjs's alike.
 */
export function inRepository() {
  if (listing) return listing;
  // -t tags each file: ? for one git does not track yet.
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "-t", "--cached", "--others", "--exclude-standard"],
    { cwd: ROOT, encoding: "utf8" },
  );
  const files = new Set();
  const untracked = new Set();
  for (const entry of output.split("\0")) {
    const file = entry.slice(2);
    if (!file || !existsSync(path.join(ROOT, file))) continue;
    files.add(file);
    if (entry[0] === "?") untracked.add(file);
  }
  const folders = new Set([""]);
  for (const file of files) {
    for (let at = file.indexOf("/"); at > 0; at = file.indexOf("/", at + 1)) {
      folders.add(file.slice(0, at));
    }
  }
  listing = { files, folders, untracked };
  return listing;
}

/** The files in a folder of the repository, by their paths from it. */
function filesIn(folder) {
  return [...inRepository().files]
    .filter((file) => file.startsWith(`${folder}/`))
    .map((file) => file.slice(folder.length + 1));
}

const ADR_FOLDER = "docs/adr";
const README = `${ADR_FOLDER}/README.md`;

/** An ADR's file name; the slug is its title's words, as ADR-086 makes it. */
export const ADR_FILE = /^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/** The folder's files that are not ADRs. */
const OTHERS = ["README.md", "open-decisions.md", "template.md"];

const STATUS = /^(?:accepted|deferred|superseded by ADR-(\d{3,}))$/;

/** An ADR's front matter fields, in any order. */
const FIELDS = ["status", "date", "areas", "amends", "amended-by"];

/** The folders whose every folder is an area of the same name. */
const AREA_FOLDERS = [
  "server/src/modules",
  "server/src/core",
  "server/src/shared",
];

/**
 * The areas named for what they hold rather than after a folder: the API
 * contract and errors; the schema and migrations; the docs and the
 * working agreements; the Help guides; the languages; CI, deployment,
 * backups and monitoring; the theme, layout and shared components.
 */
export const ACROSS = ["api", "database", "docs", "help", "i18n", "ops", "ui"];

/**
 * The areas an ADR's `areas` names, in this order, which docs/rules/ and
 * .claude/rules/ name their files by (ADR-087): each folder of
 * server/src/modules/, then of server/src/core/, then of
 * server/src/shared/, each folder's names in order, read from the tree,
 * so a new folder is an area as soon as it holds a file; then ACROSS.
 */
export const AREAS = [
  ...AREA_FOLDERS.flatMap((parent) =>
    [
      ...new Set(
        filesIn(parent)
          .filter((file) => file.includes("/"))
          .map((file) => file.split("/")[0]),
      ),
    ].sort(),
  ),
  ...ACROSS,
];

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
 * A front matter list, `[a, b]`, as its items, each matching `item`; null
 * when it is not one.
 */
function listOf(value, item) {
  const items = `${item.source}(?:, ${item.source})*`;
  if (!new RegExp(`^\\[(?:${items})?\\]$`).test(value)) return null;
  return value.slice(1, -1).split(", ").filter(Boolean);
}

/**
 * An amends or amended-by list, `[ADR-046, ADR-054]`, as the numbers it
 * names; null when it is not one.
 */
const numbersOf = (value) =>
  listOf(value, /ADR-\d{3,}/)?.map((name) => Number(name.slice(4)));

/** The numbers an ADR's amends or amended-by names: none if it has no list. */
function listed(adr, field) {
  const value = adr.frontMatter?.[field]?.value;
  return (value && numbersOf(value)) || [];
}

/** The areas an ADR's areas names, `[invoices, api]`: none if it has no list. */
function areasOf(adr) {
  const value = adr.frontMatter?.areas?.value;
  return (value && listOf(value, /[a-z0-9-]+/)) || [];
}

/**
 * A list's items, each once, sorted by `compare`; null when the list is
 * that already.
 */
function inOrder(items, compare) {
  const sorted = [...new Set(items)].sort(compare);
  return sorted.join() === items.join() ? null : sorted;
}

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
 * Every docs/adr/NNNN-<slug>.md, in number order: its file, the number its
 * name gives, its front matter's fields, each `{ value, line }` (null
 * when it has none, its unreadable lines in `malformed`), and its
 * heading (null when its first line after the front matter is not
 * `# ADR-NNN — Title`).
 */
function readAdrs() {
  return filesIn(ADR_FOLDER)
    .filter((name) => ADR_FILE.test(name))
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
      const amendments = lines.flatMap((text, i) =>
        /^## Amendment\b/.test(text)
          ? [
              {
                text,
                line: i + 1,
                numbers: [...text.matchAll(/ADR-(\d+)/g)].map((match) =>
                  Number(match[1]),
                ),
              },
            ]
          : [],
      );
      return {
        file,
        number: Number(name.slice(0, 4)),
        frontMatter,
        malformed,
        amendments,
        heading: heading && {
          line: at + 1,
          number: Number(heading[1]),
          title: heading[2].replace(/ \(amends [^()]*\)$/, ""),
        },
      };
    });
}

/** By number, between its markers: the table, then its links' definitions. */
function byNumber(adrs) {
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
 * By area, between its markers: a line per area, its ADRs in number
 * order, by the links By number defines.
 */
function byArea(adrs) {
  const areas = new Map(adrs.map((adr) => [adr, areasOf(adr)]));
  const lines = AREAS.flatMap((area) => {
    const named = adrs.filter((adr) => areas.get(adr).includes(area));
    if (named.length === 0) return [];
    return [
      `- \`${area}\`: ${named.map((adr) => `[${adrName(adr.number)}]`).join(", ")}`,
    ];
  });

  return `

${lines.join("\n")}

`;
}

/**
 * The README's sections that the script writes, each between its markers;
 * check-docs-fixture.mjs builds its README from them.
 */
export const SECTIONS = [
  {
    heading: "By number",
    start: "<!-- adr-index:start -->",
    end: "<!-- adr-index:end -->",
    write: byNumber,
  },
  {
    heading: "By area",
    start: "<!-- adr-areas:start -->",
    end: "<!-- adr-areas:end -->",
    write: byArea,
  },
];

/**
 * The README's text; a failure when there is no README, or it lacks a
 * section's markers.
 */
function readme() {
  if (!existsSync(path.join(ROOT, README))) {
    const sections = SECTIONS.map(
      ({ heading, start, end }) =>
        `a "${heading}" heading with ${start} and ${end} under it`,
    );
    return {
      failure: `${README}: the index — no such file: write it with ${sections.join(", and ")}, then run node scripts/adr-index.mjs`,
    };
  }
  const text = readFileSync(path.join(ROOT, README), "utf8");
  for (const { heading, start, end } of SECTIONS) {
    const at = text.indexOf(start);
    if (at < 0 || text.indexOf(end, at) < 0) {
      return {
        failure: `${README}:1: the index — no ${start} and ${end} to write it between; add them under its "${heading}" heading`,
      };
    }
  }
  return { text };
}

/** The README's text with each section written from the ADRs. */
function written(text, adrs) {
  return SECTIONS.reduce((text, { start, end, write }) => {
    const from = text.indexOf(start) + start.length;
    return (
      text.slice(0, from) + write(adrs) + text.slice(text.indexOf(end, from))
    );
  }, text);
}

/**
 * Why the README's index is not what the ADRs' files say, as
 * `README.md:line: …`, naming its first line that differs; null when it
 * is current.
 */
function staleIndex(adrs, { text }) {
  const has = text.split("\n");
  const wants = written(text, adrs).split("\n");
  const length = Math.max(has.length, wants.length);
  let at = 0;
  while (at < length && has[at] === wants[at]) at++;
  if (at === length) return null;

  const shown = (row) => (row === undefined ? "the README's end" : `"${row}"`);
  return `${README}:${at + 1}: the index — stale: it has ${shown(has[at])} where the ADRs give ${shown(wants[at])}; run node scripts/adr-index.mjs`;
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

  for (const name of filesIn(ADR_FOLDER)) {
    if (!ADR_FILE.test(name) && !OTHERS.includes(name)) {
      failures.push(
        `${ADR_FOLDER}/${name}:1: ${name} — not a name for a file here: an ADR is NNNN-<slug>.md, four digits and its title's words in lower case, and the only others are ${new Intl.ListFormat("en-GB").format(OTHERS)}`,
      );
    }
  }

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
    if (adr.frontMatter && !fields.areas) {
      fail(
        1,
        "areas",
        "missing from the front matter: one or more of AREAS in scripts/adr-index.mjs, as [invoices, api]",
      );
    } else if (fields.areas) {
      const { value, line } = fields.areas;
      const areas = areasOf(adr);
      if (areas.length === 0) {
        fail(
          line,
          `areas: ${value}`,
          "not a list of one or more areas, as [invoices, api]",
        );
      } else {
        const unknown = areas.filter((area) => !AREAS.includes(area));
        for (const area of unknown) {
          fail(line, `areas: ${area}`, `not an area: ${AREAS.join(", ")}`);
        }
        const ordered =
          unknown.length === 0 &&
          inOrder(areas, (a, b) => AREAS.indexOf(a) - AREAS.indexOf(b));
        if (ordered) {
          fail(
            line,
            `areas: ${value}`,
            `not in the order AREAS lists them, each area once: write it as [${ordered.join(", ")}]`,
          );
        }
      }
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
      const numbers = numbersOf(value);
      if (!numbers) {
        fail(line, `${field}: ${value}`, "not a list as [ADR-046, ADR-054]");
        continue;
      }
      const ascending = inOrder(numbers, (a, b) => a - b);
      if (ascending) {
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

  // An amendment headed with another ADR's number, as "## Amendment
  // (October 2026) — its title (ADR-072)", is that ADR's: in amended-by.
  for (const adr of found) {
    const amendedBy = listed(adr, "amended-by");
    for (const { text, line, numbers } of adr.amendments) {
      for (const number of new Set(numbers)) {
        if (number === adr.number || amendedBy.includes(number)) continue;
        failures.push(
          `${adr.file}:${line}: ${text} — names ${adrName(number)}, which amended-by does not list: add it there, and ${adrName(adr.number)} to its amends`,
        );
      }
    }
  }

  // Writing needs the README, even before the first ADR.
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
    writeFileSync(path.join(ROOT, README), written(readme().text, adrs));
    console.log(`${README}: the index of ${adrs.length} ADRs written.`);
  }
}
