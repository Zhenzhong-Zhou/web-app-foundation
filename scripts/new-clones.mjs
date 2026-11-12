#!/usr/bin/env node
/**
 * A branch's new clones, for /code-review (docs/conventions.md,
 * Duplication): the clones in jscpd's report that the branch's changed
 * lines reach, out of the hundreds the whole repository has. Run from the
 * repository's root, after jscpd has written its report there:
 *
 *     npx --yes jscpd@5.4.2 --absolute --reporters json --output tmp/jscpd
 *     node scripts/new-clones.mjs [base]
 *
 * It reads tmp/jscpd/jscpd-report.json, whose paths are absolute
 * (--absolute), and `git diff -U0 <base>...HEAD`, the base origin/main
 * unless one is given. A clone is the branch's when either of its two
 * places overlaps a line the branch added or changed in that file; a
 * clone outside them is pre-existing, and a line only deleted reaches
 * none. One line for each, largest first: its size in lines, then both
 * places as path:first-last, from the root. Then, on stderr, how many of
 * the report's clones that is. No report: exit 1, saying to run jscpd.
 *
 * Its tests, in new-clones.test.mjs: `node --test scripts/`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPORT = "tmp/jscpd/jscpd-report.json";

/**
 * The lines each file gained in a `git diff -U0`, by its path from the
 * root: a list of [first, last] for each hunk that adds any.
 */
export function changedLines(diff) {
  const changed = new Map();
  let file = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const name = line.slice(4);
      file = name === "/dev/null" ? null : name.replace(/^b\//, "");
      continue;
    }
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!file || !hunk) continue;
    const first = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (count === 0) continue;
    if (!changed.has(file)) changed.set(file, []);
    changed.get(file).push([first, first + count - 1]);
  }
  return changed;
}

/** Whether a clone's place, its file named absolutely, meets a changed line. */
function reaches(place, changed, root) {
  const ranges = changed.get(path.relative(root, place.name)) ?? [];
  return ranges.some(
    ([first, last]) => place.start <= last && first <= place.end,
  );
}

/** The report's clones the branch's changed lines reach, largest first. */
export function newClones(report, changed, root) {
  return report.duplicates
    .filter(
      (clone) =>
        reaches(clone.firstFile, changed, root) ||
        reaches(clone.secondFile, changed, root),
    )
    .sort((a, b) => b.lines - a.lines);
}

/** A clone as one line: its size, then both places from the root. */
export function describe(clone, root) {
  const place = ({ name, start, end }) =>
    `${path.relative(root, name)}:${start}-${end}`;
  return `${clone.lines} lines: ${place(clone.firstFile)} and ${place(clone.secondFile)}`;
}

function main() {
  const base = process.argv[2] ?? "origin/main";
  const root = realpathSync(
    execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    }).trim(),
  );
  const reportFile = path.join(root, REPORT);
  if (!existsSync(reportFile)) {
    console.error(
      `No ${REPORT}: run jscpd first, from the root: npx --yes jscpd@5.4.2 --absolute --reporters json --output tmp/jscpd`,
    );
    process.exit(1);
  }
  const report = JSON.parse(readFileSync(reportFile, "utf8"));
  const diff = execFileSync(
    "git",
    ["diff", "-U0", "--no-color", "--no-ext-diff", `${base}...HEAD`],
    { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  const clones = newClones(report, changedLines(diff), root);
  for (const clone of clones) console.log(describe(clone, root));
  console.error(
    `${clones.length} of the report's ${report.duplicates.length} clones in the branch's changed lines.`,
  );
}

if (
  realpathSync(process.argv[1] ?? "") ===
  realpathSync(fileURLToPath(import.meta.url))
) {
  main();
}
