/**
 * What check-docs.mjs's tests share, in check-docs.test.mjs (the links),
 * check-docs-adrs.test.mjs (the ADRs) and check-docs-rules.test.mjs
 * (ADR-087's checks): split so node --test, which runs a file's tests in
 * turn but the files at once, runs them side by side. Not a test file,
 * so node --test runs nothing here.
 *
 * Each test runs the script in a temporary repository of a few Markdown
 * files, since it checks the repository it is run in. git init is
 * enough: the files are listed as git would track them, committed or not.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export function write(root, file, text) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

/** A temporary repository: a .gitignore of tmp/, and the files. */
export function fixture(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), "check-docs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  execFileSync("git", ["init", "--quiet"], { cwd: root });
  write(root, ".gitignore", "tmp/\n");
  for (const [file, text] of Object.entries(files)) write(root, file, text);
  return root;
}

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

/** The README the ADRs need, its index not written yet. */
export const INDEX =
  "# Architecture Decisions\n\n## By number\n\n<!-- adr-index:start -->\n<!-- adr-index:end -->\n\n## By area\n\n<!-- adr-areas:start -->\n<!-- adr-areas:end -->\n";

/** The index script, run in the fixture as a person runs it. */
export const writeIndex = (root) =>
  execFileSync(process.execPath, [path.join(ROOT, "scripts/adr-index.mjs")], {
    cwd: root,
  });
