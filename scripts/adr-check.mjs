#!/usr/bin/env node
/**
 * The open issues the check before an ADR reads (engineering.md,
 * Process; ADR-089), gathered into one file for the chat.
 *
 *     node scripts/adr-check.mjs 089 --areas docs,ops
 *     node scripts/adr-check.mjs 089 --areas docs,ops --issues 348,292
 *
 * Writes tmp/adr-NNN/check.txt in the repository it is run in, making
 * the folder, and prints its path with the counts. The file holds, for
 * each area in the order given, `== area:<a>` and its open issues as
 * `gh issue list` prints them; then each issue named and each open
 * `when-touched` one in those areas, in number order and once each:
 * `== #N <title>`, its text, then `-- <author>:` and the text of each
 * comment. An issue is read as JSON, since `gh issue view --comments`,
 * saved to a file, prints the comments without the issue's text
 * (ADR-084's check).
 *
 * It refuses, writing nothing, an area not in AREAS
 * (scripts/adr-index.mjs), naming them; an ADR number not of three
 * digits; and gh not signed in. A gh failure stops it, naming the area or
 * the issue, and writes nothing either.
 *
 * Its tests, in adr-check.test.mjs, run it in a temporary repository
 * with a stand-in gh first on PATH: `node --test scripts/`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { AREAS } from "./adr-index.mjs";

const USAGE =
  "Usage: node scripts/adr-check.mjs <NNN> --areas <a,b> [--issues <n,m>]";

/** The root of the repository it is run in, as adr-index.mjs finds it. */
const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

/** Says why, and stops before anything is written. */
function refuse(why) {
  console.error(why);
  process.exit(1);
}

/** gh's output; a failure stops the check, naming what it was reading. */
function gh(reading, ...args) {
  try {
    return execFileSync("gh", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    refuse(
      `gh failed reading ${reading}, so nothing was written:\n${error.stderr?.trim() || error.message}`,
    );
  }
}

/** "1 area", "2 areas". */
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

let options;
try {
  options = parseArgs({
    allowPositionals: true,
    options: { areas: { type: "string" }, issues: { type: "string" } },
  });
} catch (error) {
  refuse(`${error.message}\n${USAGE}`);
}
const { positionals, values } = options;
if (positionals.length !== 1 || values.areas === undefined) refuse(USAGE);

const [number] = positionals;
if (!/^\d{3}$/.test(number)) {
  refuse(
    `Not an ADR number of three digits: ${number}. Write ADR-089's as 089.`,
  );
}

const areas = [...new Set(values.areas.split(","))];
const unknown = areas.filter((area) => !AREAS.includes(area));
if (unknown.length > 0) {
  refuse(
    `Not an area: ${unknown.join(", ")}. The areas, from scripts/adr-index.mjs: ${AREAS.join(", ")}.`,
  );
}

const named = values.issues === undefined ? [] : values.issues.split(",");
const notIssues = named.filter((issue) => !/^[1-9]\d*$/.test(issue));
if (notIssues.length > 0) {
  refuse(`Not an issue's number: ${notIssues.join(", ")}. Write #348 as 348.`);
}

try {
  execFileSync("gh", ["auth", "status"], { stdio: "ignore" });
} catch (error) {
  refuse(
    error.code === "ENOENT"
      ? "gh, GitHub's command line, is not installed: install it, run gh auth login, then this again."
      : "gh is not signed in, or cannot reach GitHub, as gh auth status says: run gh auth login, then this again.",
  );
}

const text = [];
const listed = new Set();
const toRead = new Set(named.map(Number));
for (const area of areas) {
  const label = `area:${area}`;
  const list = [
    "issue",
    "list",
    "--state",
    "open",
    "--label",
    label,
    "--limit",
    "100",
  ];
  text.push(`== ${label}\n`, gh(label, ...list));
  const open = JSON.parse(gh(label, ...list, "--json", "number,labels"));
  for (const issue of open) {
    listed.add(issue.number);
    if (issue.labels.some(({ name }) => name === "when-touched")) {
      toRead.add(issue.number);
    }
  }
}

const read = [...toRead].sort((a, b) => a - b);
for (const n of read) {
  const view = [
    "issue",
    "view",
    `${n}`,
    "--json",
    "number,title,body,comments",
  ];
  const issue = JSON.parse(gh(`#${n}`, ...view));
  text.push(`== #${issue.number} ${issue.title}\n${issue.body}\n`);
  for (const comment of issue.comments) {
    text.push(`-- ${comment.author?.login ?? "ghost"}:\n${comment.body}\n`);
  }
}

const file = `tmp/adr-${number}/check.txt`;
mkdirSync(path.join(ROOT, path.dirname(file)), { recursive: true });
writeFileSync(path.join(ROOT, file), text.join(""));
console.log(
  `Wrote ${file}: ${count(areas.length, "area")}, ${count(listed.size, "open issue")}, ${read.length} read whole. Attach it to the chat.`,
);
