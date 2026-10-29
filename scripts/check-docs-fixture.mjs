/**
 * What check-docs.mjs's tests share, in check-docs.test.mjs (the links),
 * check-docs-adrs.test.mjs (the ADRs) and check-docs-rules.test.mjs
 * (ADR-087's checks): split so node --test, which runs a file's tests in
 * turn but the files at once, runs them side by side. Not a test file,
 * so node --test runs nothing here. adr-index.test.mjs takes its ADRs and
 * README from here too.
 *
 * Each test runs the script in a temporary repository of a few Markdown
 * files, since it checks the repository it is run in. git init is
 * enough: the files are listed as git would track them, committed or not.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { repository } from "./git-fixture.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A temporary repository: a .gitignore of tmp/, and the files. */
export const fixture = (t, files) =>
  repository(t, "check-docs", { ".gitignore": "tmp/\n", ...files });

/** The script, run in the fixture as verify.sh runs it in the repository. */
export const check = (root) =>
  spawnSync(process.execPath, [path.join(ROOT, "scripts/check-docs.mjs")], {
    cwd: root,
    encoding: "utf8",
  });

/** A run that failed, and the failures it printed, each on its line. */
export function failures(run) {
  assert.equal(run.status, 1, run.stdout);
  return run.stderr.trimEnd().split("\n").slice(0, -1);
}

export const GUIDE = "# Guide\n\n## Setup\n\nThe steps.\n";

/** An ADR's file: its front matter, a blank line, its heading and text. */
export const adr = (frontMatter, heading) =>
  `---\n${frontMatter}---\n\n# ${heading}\n\nThe decision.\n`;

/**
 * The README the ADRs need, its index not written yet, among text the
 * script leaves as it is.
 */
export const INDEX = `# Architecture Decisions

The preamble.

## By number

Written by the script.

<!-- adr-index:start -->
<!-- adr-index:end -->

## By area

<!-- adr-areas:start -->
<!-- adr-areas:end -->

## Resolved

The table.
`;

/** The index script, run in the fixture as a person runs it. */
export const writeIndex = (root) =>
  execFileSync(process.execPath, [path.join(ROOT, "scripts/adr-index.mjs")], {
    cwd: root,
  });
