/**
 * Tests for adr-index.mjs, on Node's own runner: scripts/ sits outside
 * both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * Each test copies the script into a temporary repository with a few
 * ADRs and a README, and runs it there, since it reads the docs/adr/
 * beside it, as git lists it.
 * check-docs.test.mjs tests the front matter's own checks.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function write(root, file, text) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

/** An ADR's file: its front matter, a blank line, its heading and text. */
const adr = (frontMatter, heading) =>
  `---\n${frontMatter}---\n\n# ${heading}\n\nThe decision.\n`;

const README = `# Architecture Decisions

The preamble.

## By number

Written by the script.

<!-- adr-index:start -->
<!-- adr-index:end -->

## Resolved

The table.
`;

/** A temporary repository: the script, three ADRs, a file that is not one, the README. */
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "adr-index-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  execFileSync("git", ["init", "--quiet"], { cwd: root });
  mkdirSync(path.join(root, "scripts"));
  copyFileSync(
    path.join(ROOT, "scripts/adr-index.mjs"),
    path.join(root, "scripts/adr-index.mjs"),
  );
  write(
    root,
    "docs/adr/0001-the-first.md",
    adr(
      "status: superseded by ADR-003\ndate: 2026-08-24\namended-by: [ADR-002]\n",
      "ADR-001 — The first",
    ),
  );
  write(
    root,
    "docs/adr/0002-calendar-days-are-date.md",
    adr(
      "status: accepted\ndate: 2026-08-25\namends: [ADR-001]\n",
      "ADR-002 — Calendar days are `date`, sent as YYYY-MM-DD (amends ADR-001)",
    ),
  );
  write(
    root,
    "docs/adr/0003-the-third.md",
    adr(
      "status: deferred\ndate: 2026-08-26\n",
      "ADR-003 — The third (deferred)",
    ),
  );
  write(root, "docs/adr/open-decisions.md", "# Open decisions\n");
  write(root, "docs/adr/README.md", README);
  return root;
}

const run = (root, ...args) =>
  spawnSync(
    process.execPath,
    [path.join(root, "scripts/adr-index.mjs"), ...args],
    { encoding: "utf8" },
  );

const readme = (root) =>
  readFileSync(path.join(root, "docs/adr/README.md"), "utf8");

test("writes the table between the markers, and --check then finds it current", (t) => {
  const root = fixture(t);

  const written = run(root);
  assert.equal(written.status, 0, written.stderr);
  assert.equal(
    written.stdout,
    "docs/adr/README.md: the index of 3 ADRs written.\n",
  );
  assert.equal(
    readme(root),
    `# Architecture Decisions

The preamble.

## By number

Written by the script.

<!-- adr-index:start -->

| ADR | Title | Status | Date | Amends | Amended by |
| --- | --- | --- | --- | --- | --- |
| [ADR-001] | The first | superseded by [ADR-003] | 2026-08-24 | | [ADR-002] |
| [ADR-002] | Calendar days are \`date\`, sent as YYYY-MM-DD | accepted | 2026-08-25 | [ADR-001] | |
| [ADR-003] | The third (deferred) | deferred | 2026-08-26 | | |

[ADR-001]: 0001-the-first.md
[ADR-002]: 0002-calendar-days-are-date.md
[ADR-003]: 0003-the-third.md

<!-- adr-index:end -->

## Resolved

The table.
`,
  );

  const checked = run(root, "--check");
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(
    checked.stdout,
    "ADRs in docs/adr/: 3, each with its front matter and heading, and its amendments recorded both ways; the index in README.md current.\n",
  );
});

test("an ADR that fails its checks stops both modes, and nothing is written", (t) => {
  const root = fixture(t);
  write(
    root,
    "docs/adr/0003-the-third.md",
    adr("status: acepted\ndate: 2026-08-26\n", "ADR-003 — The third"),
  );
  const failure =
    "docs/adr/0003-the-third.md:2: status: acepted — not accepted, deferred or superseded by ADR-NNN";

  const written = run(root);
  assert.equal(written.status, 1, written.stdout);
  assert.equal(
    written.stderr,
    `${failure}\nNothing written: the index is written only from ADRs that pass.\n`,
  );
  assert.equal(readme(root), README);

  const checked = run(root, "--check");
  assert.equal(checked.status, 1, checked.stdout);
  assert.equal(checked.stderr, `${failure}\n`);
});

test("a changed title is found stale, by its line, and --check writes nothing", (t) => {
  const root = fixture(t);
  run(root);
  write(
    root,
    "docs/adr/0002-calendar-days-are-date.md",
    adr(
      "status: accepted\ndate: 2026-08-25\namends: [ADR-001]\n",
      "ADR-002 — Calendar days, sent as YYYY-MM-DD (amends ADR-001)",
    ),
  );
  const before = readme(root);

  const checked = run(root, "--check");
  assert.equal(checked.status, 1, checked.stdout);
  assert.equal(
    checked.stderr,
    'docs/adr/README.md:14: the index — stale: it has "| [ADR-002] | Calendar days are `date`, sent as YYYY-MM-DD | accepted | 2026-08-25 | [ADR-001] | |" where the ADRs give "| [ADR-002] | Calendar days, sent as YYYY-MM-DD | accepted | 2026-08-25 | [ADR-001] | |"; run node scripts/adr-index.mjs\n',
  );
  assert.equal(readme(root), before);
});
