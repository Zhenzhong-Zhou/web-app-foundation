#!/usr/bin/env node
/**
 * The repository's Markdown, checked for what markdownlint cannot see
 * (ADR-086).
 *
 *     node scripts/check-docs.mjs
 *
 * Every link in every Markdown file git tracks or would track (so not
 * tmp/) must lead somewhere: each inline link or image, and each
 * reference definition, outside front matter, fenced code and inline
 * code. Its path, resolved from the file's folder, must name a file or
 * folder in the repository, letter case included; a #fragment on a .md
 * file, or on the file itself, must be a heading's anchor there, made as
 * GitHub makes it, or an <a id> or <a name>. markdownlint's MD051 checks
 * fragments within one file only, so a dead link between files went
 * unseen.
 *
 * Skipped: links to other sites (a scheme, or //), paths from / (the Help
 * guides link the app's routes, as /inventory), and a fragment on any
 * other kind of file (#L10). Only ATX headings (## Heading) have anchors
 * here; a link to a setext one fails.
 *
 * Every ADR, docs/adr/NNNN-*.md, has front matter with its status
 * (accepted, deferred or superseded by ADR-NNN) and its date
 * (YYYY-MM-DD), and a heading whose number is its file's. Each ADR its
 * `amends` names exists and lists it in its `amended-by`, and each one
 * its `amended-by` names lists it in its `amends`. When
 * docs/adr/README.md exists, its index is what scripts/adr-index.mjs
 * would write.
 *
 * Prints each failure as `file:line: target — reason` and exits 1, or
 * what it checked and exits 0. scripts/verify.sh and the Docs workflow run
 * it. Its tests, in check-docs.test.mjs, run it in a temporary repository:
 * `node --test scripts/`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADR_FOLDER,
  README,
  adrName,
  listOf,
  listed,
  readAdrs,
  staleIndex,
} from "./adr-index.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every Markdown file git tracks or would track, relative to ROOT. */
function markdownFiles() {
  const listed = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "*.md"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return [...new Set(listed.split("\0"))].filter(
    (file) => file && existsSync(path.join(ROOT, file)),
  );
}

/**
 * The text with its front matter and fenced code blanked, every line
 * kept in its place: neither holds headings or links.
 */
function withoutBlocks(text) {
  const lines = text.split("\n");
  let at = 0;
  if (/^---\s*$/.test(lines[0])) {
    const end = lines.findIndex((line, i) => i > 0 && /^---\s*$/.test(line));
    if (end > 0) for (; at <= end; at++) lines[at] = "";
  }

  let fence = null;
  for (; at < lines.length; at++) {
    const marks = /^\s*(`{3,}|~{3,})(.*)$/.exec(lines[at]);
    if (fence) {
      if (
        marks &&
        marks[1][0] === fence[0] &&
        marks[1].length >= fence.length &&
        !marks[2].trim()
      ) {
        fence = null;
      }
      lines[at] = "";
    } else if (marks && !(marks[1][0] === "`" && marks[2].includes("`"))) {
      fence = marks[1];
      lines[at] = "";
    }
  }
  return lines.join("\n");
}

/**
 * Each code span, from a run of backticks to the next run as long, within
 * one paragraph. CommonMark lets one wrap across lines, as prose wrapped
 * by hand often does.
 */
const CODE_SPAN = /(?<!`)(`+)(?!`)((?:(?!\n[ \t]*\n)[\s\S])*?)(?<!`)\1(?!`)/g;

/** The text with its code spans blanked, newlines kept. */
const withoutCode = (text) =>
  text.replace(CODE_SPAN, (span) => span.replace(/[^\n]/g, " "));

/** An inline link or image; group 1 is its destination. */
const INLINE_LINK =
  /!?\[(?:[^[\]\\]|\\.|\[(?:[^[\]\\]|\\.)*\])*\]\(\s*(<[^<>\n]*>|[^\s()<>]*(?:\([^\s()<>]*\)[^\s()<>]*)*)(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\s*\)/dg;

/** A reference definition, not a footnote's; group 1 is its destination. */
const DEFINITION =
  /^[ \t]*\[(?!\^)(?:[^[\]\\]|\\.)+\]:[ \t]*\n?[ \t]*(<[^<>\n]*>|\S+)/dgm;

/** Every link's destination in a file, with the line it is on. */
function linksIn(file) {
  const text = withoutCode(
    withoutBlocks(readFileSync(path.join(ROOT, file), "utf8")),
  );
  const found = [
    ...text.matchAll(INLINE_LINK),
    ...text.matchAll(DEFINITION),
  ].sort((a, b) => a.indices[1][0] - b.indices[1][0]);

  const links = [];
  let line = 1;
  let counted = 0;
  for (const match of found) {
    for (; counted < match.indices[1][0]; counted++) {
      if (text[counted] === "\n") line++;
    }
    links.push({ line, target: match[1].replace(/^<(.*)>$/, "$1") });
  }
  return links;
}

/**
 * A heading's text as GitHub shows it: code kept as written, links and
 * images as their text, tags and `_` emphasis gone. `*` and `~` need no
 * care, since the anchor drops them anyway.
 */
function headingText(markdown) {
  const code = [];
  return markdown
    .replace(CODE_SPAN, (_, ticks, content) => {
      code.push(/^ .*[^ ].* $/.test(content) ? content.slice(1, -1) : content);
      return `\uE000${code.length - 1}\uE001`;
    })
    .replace(/!?\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/g, "$1")
    .replace(/<\/?[A-Za-z][^<>]*>/g, "")
    .replace(
      /(?<![\p{L}\p{N}_])(_+)(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}_])/gu,
      "$2",
    )
    .replace(/\uE000(\d+)\uE001/g, (_, index) => code[index]);
}

/**
 * GitHub's anchor for a heading, as markdownlint's MD051 makes it too:
 * lower case, every character dropped but letters, marks, numbers, `_`,
 * `-` and spaces, then each space a hyphen.
 */
const anchorOf = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");

const anchorCache = new Map();

/**
 * Every anchor in a Markdown file: each heading's, a repeated one's with
 * -1, -2 after it as GitHub numbers them, and each <a id> or <a name>.
 */
function anchorsIn(absolute) {
  if (anchorCache.has(absolute)) return anchorCache.get(absolute);

  const text = withoutBlocks(readFileSync(absolute, "utf8"));
  const anchors = new Set();
  const repeats = new Map();
  for (const line of text.split("\n")) {
    const heading = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (!heading) continue;
    const anchor = anchorOf(headingText(heading[1]));
    let unique = anchor;
    while (anchors.has(unique)) {
      repeats.set(anchor, (repeats.get(anchor) ?? 0) + 1);
      unique = `${anchor}-${repeats.get(anchor)}`;
    }
    anchors.add(unique);
  }
  for (const match of withoutCode(text).matchAll(
    /<a\s[^>]*?\b(?:id|name)\s*=\s*["']([^"']+)["']/gi,
  )) {
    anchors.add(match[1]);
  }

  anchorCache.set(absolute, anchors);
  return anchors;
}

const listings = new Map();

/**
 * Whether a path inside the repository exists, each name in the case
 * written. macOS finds `Docs/` for `docs/`; GitHub and CI's Linux do not.
 */
function existsAsWritten(relative) {
  let folder = ROOT;
  for (const name of relative.split(path.sep).filter(Boolean)) {
    if (!listings.has(folder)) {
      listings.set(
        folder,
        statSync(folder).isDirectory() ? readdirSync(folder) : [],
      );
    }
    if (!listings.get(folder).includes(name)) return false;
    folder = path.join(folder, name);
  }
  return true;
}

/**
 * Why a link from a file leads nowhere, or null when it leads somewhere;
 * "skipped" when it is not this check's to follow.
 */
function brokenBecause(file, target) {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) || target.startsWith("/")) {
    return "skipped";
  }

  const hash = target.indexOf("#");
  let linked = (hash < 0 ? target : target.slice(0, hash)).replace(/\?.*$/, "");
  let fragment = hash < 0 ? "" : target.slice(hash + 1);
  try {
    linked = decodeURIComponent(linked);
    fragment = decodeURIComponent(fragment);
  } catch {
    return "not a valid link: its %-escapes do not decode";
  }
  if (!linked && !fragment) return "skipped";

  const absolute = linked
    ? path.resolve(path.dirname(path.join(ROOT, file)), linked)
    : path.join(ROOT, file);
  const relative = path.relative(ROOT, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) {
    return "outside the repository";
  }
  if (!existsAsWritten(relative)) {
    return existsSync(absolute)
      ? "no such file or folder: names are case-sensitive on GitHub"
      : "no such file or folder";
  }

  if (
    fragment &&
    (!linked || absolute.endsWith(".md")) &&
    statSync(absolute).isFile() &&
    !anchorsIn(absolute).has(fragment)
  ) {
    return "no such heading or anchor there";
  }
  return null;
}

/** Every relative link leads to a file or folder, and a fragment to a heading. */
function links(files) {
  const failures = [];
  let toPaths = 0;
  let withinFile = 0;
  for (const file of files) {
    for (const { line, target } of linksIn(file)) {
      const reason = brokenBecause(file, target);
      if (reason === "skipped") continue;
      if (target.startsWith("#")) withinFile++;
      else toPaths++;
      if (reason) failures.push(`${file}:${line}: ${target} — ${reason}`);
    }
  }
  return {
    failures,
    summary: `Links in ${files.length} Markdown files: ${toPaths} to files and folders, ${withinFile} to headings in their own file; none broken.`,
  };
}

const STATUS = /^(?:accepted|deferred|superseded by ADR-\d{3,})$/;

/** A YYYY-MM-DD that is a day of the calendar. */
const isDay = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/**
 * Every ADR in docs/adr/ has its status, date and heading, each
 * amendment is in the front matter of both ADRs, and the index is
 * current.
 */
function adrs() {
  const found = readAdrs();
  const byNumber = new Map(found.map((adr) => [adr.number, adr]));
  const failures = [];

  for (const adr of found) {
    const name = adrName(adr.number);
    const fail = (line, what, reason) =>
      failures.push(`${adr.file}:${line}: ${what} — ${reason}`);
    const fields = adr.frontMatter ?? {};

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
    if (adr.frontMatter && !fields.status) {
      fail(1, "status", "missing from the front matter");
    } else if (fields.status && !STATUS.test(fields.status.value)) {
      fail(
        fields.status.line,
        `status: ${fields.status.value}`,
        "not accepted, deferred or superseded by ADR-NNN",
      );
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

  const indexed = existsSync(path.join(ROOT, README));
  const stale = indexed && staleIndex(found);
  if (stale) failures.push(stale);
  return {
    failures,
    summary: `ADRs in ${ADR_FOLDER}/: ${found.length}, each with its front matter and heading, and its amendments recorded both ways; ${indexed ? "the index in README.md current" : "no README.md, so no index to check"}.`,
  };
}

const files = markdownFiles();
const results = [links(files), adrs()];
const failures = results.flatMap((result) => result.failures);

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error(
    `${failures.length} ${failures.length === 1 ? "failure" : "failures"}.`,
  );
  process.exit(1);
}
for (const result of results) console.log(result.summary);
