#!/usr/bin/env node
/**
 * The fluent review of ADR-054's French and Chinese (MC-1405, step 4).
 *
 *     node scripts/i18n-review.mjs export            # review/fr-CA.xlsx, review/fr-CA.guides.xlsx, ...
 *     node scripts/i18n-review.mjs export --since b933b912
 *                                                    # review/fr-CA.since-b933b912.xlsx, ...
 *     node scripts/i18n-review.mjs export --only guides
 *                                                    # review/fr-CA.guides.xlsx, review/zh-Hans.guides.xlsx
 *     node scripts/i18n-review.mjs import review/fr-CA.xlsx
 *
 * Export writes two workbooks per language, covering everything a person
 * reads. The catalogues' (<language>.xlsx): the screens (client/src/locales)
 * and the server's refusals, emails, notifications and printed documents
 * (server/src/i18n). One row per message: where it is, the English, the
 * translation as it stands, and an empty Correction column for the
 * reviewer. The placeholders a message must keep are listed beside it,
 * since a translation that drops {sku} would print a blank where the SKU
 * belongs. The guides' (<language>.guides.xlsx, #150): Help's guides
 * (client/src/help/guides), one row per section by its {#id}, Id
 * <guide>#<id>, with the guide's title and opening, before its first
 * section, as the row <guide>; each the Markdown as written, its heading
 * line included, and its section id and links listed as what to keep.
 * `--only catalogues` or `--only guides` writes one kind alone.
 *
 * With --since and the commit the last round was exported at, it writes
 * only what that reviewer has not seen: the messages and sections new
 * since, or whose English or translation differs from the files as they
 * were then (git show <commit>:<file>). English that differs only in its
 * apostrophes or quotation marks (' for ’, " for “ ”) counts as unchanged:
 * #184 changed 29 messages that way, none in what a reviewer checks. Not
 * if the change moved a placeholder, though, since ICU reads ' as a quote.
 * The files are named for the commit, so a full export is never
 * overwritten, and their last column, "Since <commit>", says why each row
 * is there.
 *
 * Import reads a returned workbook, of any kind, takes every non-empty
 * Correction, and writes it into the right catalogue, or over its section
 * in the right guide. It refuses the whole file, writing nothing, if any
 * correction belongs to a message or section removed since the export or
 * whose English or translation changed since (its row no longer what the
 * files say, English changed only in its quotes aside, as for --since);
 * clear that row's Correction, and the next round reads it at its new
 * text. A message's correction is refused too if it is not valid ICU or
 * does not keep exactly the English's placeholders; a section's, if its
 * first line is not its heading with the same {#id} (the opening's, the
 * guide's # title), another line is a heading, or it does not link to
 * exactly what the English links to. The problems are listed by row.
 * Afterwards, run `npm run i18n:check` in client/ and server/ for the
 * catalogues, and `npx vitest run src/help/guides.test.ts` in client/ for
 * the guides, which checks their Markdown and bold labels, and look at
 * `git diff`.
 *
 * With no fluent reader, scripts/i18n-decide.mjs stands between the two:
 * it decides one text for each row from the machine reviews of a workbook
 * and writes a workbook import reads (ADR-054's November 2026 amendment).
 *
 * No dependencies of its own: a workbook is a zip of XML, and Node has
 * zlib. It uses the FormatJS CLI and ICU parser each package already has,
 * so run `npm install` in client/ and server/ first.
 *
 * Its tests, in i18n-review.test.mjs, run it on a small catalogue in a
 * temporary folder: `node --test scripts/`.
 *
 * The workbooks are working files, not the source of truth: review/ is
 * git-ignored, and what matters lands as a commit to the catalogues.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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

/** Help's guides (ADR-079): guides/<language>/<guide>.md. */
const GUIDES = "client/src/help/guides";
const GUIDE_AREA = "Guides";

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

// ------------------------------------------------------------------ guides

/** A section's heading, as client/src/help/markdown.ts reads it. */
const SECTION = /^## \S.*? \{#([a-z0-9]+(?:-[a-z0-9]+)*)\}$/;

/** Every guide, by the English files' names. */
const guideNames = () =>
  readdirSync(path.join(ROOT, GUIDES, "en"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.slice(0, -3))
    .sort();

const guideFile = (language, guide) => `${GUIDES}/${language}/${guide}.md`;

/** A guide's text as the review compares it: \n line ends, no trailing blank. */
const asSection = (text) => text.replace(/\r\n?/g, "\n").trimEnd();

/**
 * A guide in parts: its opening (the title and what comes before the first
 * section), id "", then each section from its heading, by its id. Each
 * keeps the lines it spans, start to end, blank lines after it left out.
 */
function sectionsOf(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const starts = [{ id: "", start: 0 }];
  lines.forEach((line, index) => {
    const heading = SECTION.exec(line);
    if (heading) starts.push({ id: heading[1], start: index });
  });
  const parts = starts.map(({ id, start }, i) => {
    let end = starts[i + 1]?.start ?? lines.length;
    while (end > start && lines[end - 1].trim() === "") end -= 1;
    return { id, start, end, text: lines.slice(start, end).join("\n") };
  });
  return { lines, parts };
}

/** A row's Id: <guide> for the opening, <guide>#<id> for a section. */
const sectionRowId = (guide, id) => (id ? `${guide}#${id}` : guide);

/** Where a section links, sorted: what a correction keeps. */
const linksOf = (text) =>
  [...text.matchAll(/\]\((\/[^)\s]*)\)/g)].map((match) => match[1]).sort();

/** What a section's correction must keep: its id, then its links. */
const sectionKeeps = (id, text) =>
  [
    ...(id ? [`{#${id}}`] : []),
    ...linksOf(text).map((link) => `(${link})`),
  ].join(" ");

/** The same English section to a reviewer: equal, or only ' ’ " “ ” changed. */
const sameSection = (then, now) =>
  then === now || plainQuotes(then) === plainQuotes(now);

// ---------------------------------------------------------------- baseline

/** What git prints, run at the repository's root; its errors unsaid. */
const git = (...args) =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  });

/** A commit's short name, refusing a name git cannot find. */
function commitNamed(name) {
  try {
    return git(
      "rev-parse",
      "--verify",
      "--quiet",
      "--short",
      `${name}^{commit}`,
    ).trim();
  } catch {
    console.error(
      `git cannot find a commit ${name}. Name the commit the last round was exported at, as git log shows it.`,
    );
    process.exit(1);
  }
}

/** A file as it was at a commit: null if it did not exist yet. */
function textAt(commit, file) {
  try {
    return git("show", `${commit}:${file}`);
  } catch {
    return null;
  }
}

/** A catalogue as it was at a commit: empty if it did not exist yet. */
function readAt(commit, file) {
  const text = textAt(commit, file);
  return text === null ? {} : JSON.parse(text);
}

const plainQuotes = (message) =>
  message.replace(/’/g, "'").replace(/[“”]/g, '"');

/** The same English to a reviewer: equal, or only ' ’ " “ ” changed (#184). */
function sameEnglish(then, now) {
  if (then === now) return true;
  if (plainQuotes(then) !== plainQuotes(now)) return false;
  // ICU reads ' as a quote, so a changed one can turn {name} into text.
  try {
    return (
      [...placeholders(then)].sort().join(" ") ===
      [...placeholders(now)].sort().join(" ")
    );
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ export

/** Each section of a guide's parts, by its id ("" for the opening). */
const byId = (parts) => new Map(parts.map(({ id, text }) => [id, text]));

/**
 * What each kind of workbook holds: its file name's suffix, what its rows
 * are, how its English is compared with the baseline's, and its rows for
 * a language. A row's `then` is its English and translation at the
 * baseline, null for one new since, and is there only with a baseline.
 */
function catalogueKind(baseline) {
  const sources = AREAS.map((area) => ({
    area,
    english: read(`${area.catalogues}/en.json`),
    englishThen: baseline && readAt(baseline, `${area.catalogues}/en.json`),
    found: messagesOf(area),
  }));

  return {
    suffix: "",
    noun: "messages",
    same: sameEnglish,
    entries: (language) =>
      sources.flatMap(({ area, english, englishThen, found }) => {
        const translated = read(`${area.catalogues}/${language}.json`);
        const translatedThen =
          baseline && readAt(baseline, `${area.catalogues}/${language}.json`);

        return Object.keys(english)
          .sort()
          .map((id) => ({
            area: area.name,
            id,
            where: found[id]?.file ? `${area.package}/${found[id].file}` : "",
            english: english[id],
            translation: translated[id] ?? "",
            keep: [...placeholders(english[id])].join(" "),
            then:
              baseline &&
              (id in englishThen
                ? {
                    english: englishThen[id],
                    translation: translatedThen[id] ?? "",
                  }
                : null),
          }));
      }),
  };
}

function guideKind(baseline) {
  const guides = guideNames();
  const partsOf = (file) =>
    existsSync(path.join(ROOT, file))
      ? sectionsOf(readFileSync(path.join(ROOT, file), "utf8")).parts
      : [];
  const partsAt = (file) => {
    const text = textAt(baseline, file);
    return text === null ? [] : sectionsOf(text).parts;
  };

  return {
    suffix: ".guides",
    noun: "sections",
    same: sameSection,
    entries: (language) =>
      guides.flatMap((guide) => {
        const file = guideFile(language, guide);
        const translated = byId(partsOf(file));
        const englishThen = baseline && byId(partsAt(guideFile("en", guide)));
        const translatedThen = baseline && byId(partsAt(file));

        return partsOf(guideFile("en", guide)).map(({ id, text }) => ({
          area: GUIDE_AREA,
          id: sectionRowId(guide, id),
          where: file,
          english: text,
          translation: translated.get(id) ?? "",
          keep: sectionKeeps(id, text),
          then:
            baseline &&
            (englishThen.has(id)
              ? {
                  english: englishThen.get(id),
                  translation: translatedThen.get(id) ?? "",
                }
              : null),
        }));
      }),
  };
}

function exportWorkbooks({ since, only }) {
  const baseline = since && commitNamed(since);
  const columns = baseline
    ? [...COLUMNS, { title: `Since ${baseline}`, width: 30 }]
    : COLUMNS;

  mkdirSync(path.join(ROOT, "review"), { recursive: true });
  const kinds = [
    only !== "guides" && catalogueKind(baseline),
    only !== "catalogues" && guideKind(baseline),
  ].filter(Boolean);

  for (const kind of kinds) {
    for (const language of LANGUAGES) {
      const rows = [columns.map((column) => column.title)];
      let quotesOnly = 0;

      for (const entry of kind.entries(language)) {
        const row = [
          entry.area,
          entry.id,
          entry.where,
          entry.english,
          entry.translation,
          "",
          "",
          entry.keep,
        ];

        if (baseline) {
          const isNew = entry.then === null;
          const englishChanged =
            !isNew && !kind.same(entry.then.english, entry.english);
          const translationChanged =
            !isNew && entry.then.translation !== entry.translation;

          if (!isNew && !englishChanged && !translationChanged) {
            if (entry.then.english !== entry.english) quotesOnly += 1;
            continue;
          }
          row.push(
            isNew
              ? "New"
              : englishChanged && translationChanged
                ? "English and translation changed"
                : englishChanged
                  ? "English changed"
                  : "Translation changed",
          );
        }
        rows.push(row);
      }

      const file = path.join(
        ROOT,
        "review",
        `${language}${kind.suffix}${baseline ? `.since-${baseline}` : ""}.xlsx`,
      );
      writeFileSync(file, workbook(language, columns, rows));
      console.log(
        baseline
          ? `${path.relative(ROOT, file)}: ${rows.length - 1} ${kind.noun} new or changed since ${baseline}; ` +
              `${quotesOnly} left out, their English changed only in its apostrophes or quotation marks.`
          : `${path.relative(ROOT, file)}: ${rows.length - 1} ${kind.noun} to review.`,
      );
    }
  }
}

// ------------------------------------------------------------------ import

/**
 * Where a workbook's rows go, one per Area: each finds a row's English and
 * translation as they are today (null for one removed since the export),
 * checks a correction, takes it, and writes what it took.
 */
function catalogueTarget(area, language) {
  const english = read(`${area.catalogues}/en.json`);
  const translated = read(`${area.catalogues}/${language}.json`);
  let changed = 0;

  return {
    cell: (text) => text,
    same: sameEnglish,
    find: (id) =>
      Object.hasOwn(english, id)
        ? { english: english[id], translation: translated[id] ?? "" }
        : null,
    check(id, correction) {
      let theirs;
      try {
        theirs = placeholders(correction);
      } catch (error) {
        return `not valid ICU (${error.message})`;
      }
      const ours = placeholders(english[id]);
      const same =
        theirs.size === ours.size &&
        [...ours].every((name) => theirs.has(name));
      return same
        ? null
        : `keeps ${[...theirs].join(" ") || "no placeholders"}; ` +
            `the English has ${[...ours].join(" ") || "none"}`;
    },
    take(id, correction) {
      if (translated[id] === correction) return;
      translated[id] = correction;
      changed += 1;
    },
    write() {
      if (changed === 0) return;
      const sorted = Object.fromEntries(
        Object.entries(translated).sort(([a], [b]) => (a < b ? -1 : 1)),
      );
      writeFileSync(
        path.join(ROOT, area.catalogues, `${language}.json`),
        `${JSON.stringify(sorted, null, 2)}\n`,
      );
      console.log(`${area.catalogues}/${language}.json: ${changed} corrected.`);
    },
  };
}

function guideTarget(language) {
  let guides; // listed at the first Guides row: the catalogues' need none
  const loaded = new Map();
  const load = (guide) => {
    if (!loaded.has(guide)) {
      const text = (file) =>
        existsSync(path.join(ROOT, file))
          ? readFileSync(path.join(ROOT, file), "utf8")
          : "";
      loaded.set(guide, {
        english: byId(sectionsOf(text(guideFile("en", guide))).parts),
        translation: sectionsOf(text(guideFile(language, guide))),
        corrected: new Map(),
      });
    }
    return loaded.get(guide);
  };
  // "home#today" is home's section today; "home", its opening.
  const named = (id) => {
    const at = id.indexOf("#");
    return at < 0 ? [id, ""] : [id.slice(0, at), id.slice(at + 1)];
  };

  return {
    cell: asSection,
    same: sameSection,
    find(id) {
      const [guide, section] = named(id);
      guides ??= new Set(guideNames());
      if (!guides.has(guide)) return null;
      const { english, translation } = load(guide);
      if (!english.has(section)) return null;
      return {
        english: english.get(section),
        translation: byId(translation.parts).get(section) ?? "",
      };
    },
    check(id, correction) {
      const [guide, section] = named(id);
      const { english, translation } = load(guide);
      if (!translation.parts.some((part) => part.id === section)) {
        return `${guideFile(language, guide)} has no ${section ? `#${section}` : "opening"}; give it the English's sections first`;
      }
      const [first, ...rest] = correction.split("\n");
      if (
        section ? SECTION.exec(first)?.[1] !== section : !/^# \S/.test(first)
      ) {
        return section
          ? `its first line is not its heading, ## … {#${section}}`
          : "its first line is not the guide's title, # …";
      }
      if (rest.some((line) => line.startsWith("#"))) {
        return "another of its lines is a heading; a section has one";
      }
      const ours = linksOf(english.get(section)).join(" ");
      const theirs = linksOf(correction).join(" ");
      return ours === theirs
        ? null
        : `links to ${theirs || "nothing"}; the English links to ${ours || "nothing"}`;
    },
    take(id, correction) {
      const [guide, section] = named(id);
      load(guide).corrected.set(section, correction);
    },
    write() {
      for (const [guide, { translation, corrected }] of loaded) {
        const { lines, parts } = translation;
        const written = [];
        let changed = 0;
        parts.forEach((part, i) => {
          const correction = corrected.get(part.id);
          if (correction !== undefined && correction !== part.text) {
            written.push(...correction.split("\n"));
            changed += 1;
          } else {
            written.push(...lines.slice(part.start, part.end));
          }
          // The blank lines after it, and the file's last line break.
          written.push(...lines.slice(part.end, parts[i + 1]?.start));
        });
        if (changed === 0) continue;
        writeFileSync(
          path.join(ROOT, guideFile(language, guide)),
          written.join("\n"),
        );
        console.log(`${guideFile(language, guide)}: ${changed} corrected.`);
      }
    },
  };
}

/**
 * Where a workbook's rows go in a language, by their Area: what import
 * writes through, and what the decide step (i18n-decide.mjs) reads today's
 * text and import's checks from, writing nothing.
 */
export const targetsFor = (language) =>
  new Map([
    ...AREAS.map((area) => [area.name, catalogueTarget(area, language)]),
    [GUIDE_AREA, guideTarget(language)],
  ]);

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
  const titles = ["Area", "Id", "English", "Translation", "Correction"];
  const missing = titles.filter((title) => !header.includes(title));
  if (missing.length > 0) {
    console.error(
      `The first row has no ${missing.join(" or ")} title. ` +
        `Keep the titles export wrote: ${titles.join(", ")}.`,
    );
    process.exit(1);
  }
  const [areaAt, idAt, englishAt, translationAt, correctionAt] = titles.map(
    (title) => header.indexOf(title),
  );

  const targets = targetsFor(language);

  const problems = [];

  rows.slice(1).forEach((row, index) => {
    const at = `row ${index + 2}`;
    const target = targets.get(row[areaAt]);
    const id = row[idAt];
    const cell = row[correctionAt] ?? "";
    const correction = (target ? target.cell(cell) : cell).trim();
    if (!correction) return;

    if (!target) {
      problems.push(`${at}: no message ${id} in ${row[areaAt]}`);
      return;
    }
    const today = target.find(id);
    if (!today) {
      problems.push(
        `${at} ${id}: removed from ${row[areaAt]} since the export, so there is nothing to correct; clear the row's Correction`,
      );
      return;
    }

    // A correction is to the text the reviewer read; on newer text it would
    // undo a change no round has seen (ADR-054's November 2026 amendment).
    const englishChanged = !target.same(
      target.cell(row[englishAt] ?? ""),
      today.english,
    );
    const translationChanged =
      target.cell(row[translationAt] ?? "") !== today.translation;
    if (englishChanged || translationChanged) {
      const what =
        englishChanged && translationChanged
          ? "its English and its translation"
          : englishChanged
            ? "its English"
            : "its translation";
      problems.push(
        `${at} ${id}: ${what} changed since the export, so clear its Correction; the next round reads it`,
      );
      return;
    }

    const problem = target.check(id, correction);
    if (problem) {
      problems.push(`${at} ${id}: ${problem}`);
      return;
    }
    target.take(id, correction);
  });

  if (problems.length > 0) {
    console.error(
      `Nothing written. Fix these in the workbook and import it again:\n  ${problems.join("\n  ")}`,
    );
    process.exit(1);
  }

  for (const target of targets.values()) target.write();

  const areas = new Set(rows.slice(1).map((row) => row[areaAt]));
  const checks = [
    (!areas.has(GUIDE_AREA) || AREAS.some((area) => areas.has(area.name))) &&
      "`npm run i18n:check` in client/ and server/",
    areas.has(GUIDE_AREA) &&
      "`npx vitest run src/help/guides.test.ts` in client/",
  ].filter(Boolean);
  console.log(`Now run ${checks.join(", and ")}, then look at \`git diff\`.`);
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
export function workbook(sheetName, columns, rows) {
  const last = `${letter(columns.length - 1)}${rows.length}`;
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
<cols>${columns.map((column, i) => `<col min="${i + 1}" max="${i + 1}" width="${column.width}" customWidth="1"/>`).join("")}</cols>
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
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sheetName}'!$A$1:$${letter(columns.length - 1)}$${rows.length}</definedName></definedNames></workbook>`,
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
export function readWorkbook(buffer) {
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

/**
 * export's options, `--since <commit>` and `--only catalogues|guides`, each
 * at most once and in any order; null for anything else.
 */
function exportOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const [flag, value] = [args[i], args[i + 1]];
    const name = { "--since": "since", "--only": "only" }[flag];
    if (!name || value === undefined || name in options) return null;
    if (name === "only" && !["catalogues", "guides"].includes(value)) {
      return null;
    }
    options[name] = value;
  }
  return options;
}

// Run, not imported: its tests import the workbook's writer and reader,
// and the decide step the reader and targetsFor.
if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  const options = command === "export" && exportOptions(args);

  if (options) {
    exportWorkbooks(options);
  } else if (command === "import" && args.length === 1) {
    importWorkbook(path.resolve(args[0]));
  } else {
    console.error(
      "Usage:\n  node scripts/i18n-review.mjs export [--since <commit>] [--only catalogues|guides]\n  node scripts/i18n-review.mjs import review/fr-CA.xlsx",
    );
    process.exit(1);
  }
}
