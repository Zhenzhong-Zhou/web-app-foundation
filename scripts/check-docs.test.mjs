/**
 * Tests for check-docs.mjs, on Node's own runner: scripts/ sits outside
 * both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
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
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function write(root, file, text) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

/** A temporary repository: a .gitignore of tmp/, and the files. */
function fixture(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), "check-docs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  execFileSync("git", ["init", "--quiet"], { cwd: root });
  write(root, ".gitignore", "tmp/\n");
  for (const [file, text] of Object.entries(files)) write(root, file, text);
  return root;
}

/** The script, run in the fixture as verify.sh runs it in the repository. */
const check = (root) =>
  spawnSync(process.execPath, [path.join(ROOT, "scripts/check-docs.mjs")], {
    cwd: root,
    encoding: "utf8",
  });

/** A run that failed, and the failures it printed, each on its line. */
function failures(run) {
  assert.equal(run.status, 1, run.stdout);
  return run.stderr.trimEnd().split("\n").slice(0, -1);
}

const GUIDE = "# Guide\n\n## Setup\n\nThe steps.\n";

test("a link to a file, to a heading there, and within a file passes", (t) => {
  const root = fixture(t, {
    "README.md": `# Readme

See [the guide](docs/guide.md), [its setup](docs/guide.md#setup),
[the folder](docs/) and [the end](#the-end).

## The end
`,
    "docs/guide.md": GUIDE,
  });

  const run = check(root);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /: 3 to files and folders, 1 to headings/);
  // Run from a folder inside it, it checks the same repository.
  assert.equal(check(path.join(root, "docs")).stdout, run.stdout);
});

test("a missing file is reported by file and line", (t) => {
  const root = fixture(t, {
    "README.md": "# Readme\n\nSee\n[the guide](docs/gone.md).\n",
  });

  assert.deepEqual(failures(check(root)), [
    "README.md:4: docs/gone.md — no such file or folder",
  ]);
});

test("a missing heading is reported, in another file or the same one", (t) => {
  const root = fixture(t, {
    "README.md":
      "# Readme\n\n[Teardown](docs/guide.md#teardown), [here](#nope).\n",
    "docs/guide.md": GUIDE,
  });

  assert.deepEqual(failures(check(root)), [
    "README.md:3: docs/guide.md#teardown — no such heading or anchor there",
    "README.md:3: #nope — no such heading or anchor there",
  ]);
});

test("a repeated heading's anchor takes -1, and a heading in a fence none", (t) => {
  const root = fixture(t, {
    "README.md": `# Readme

## Notes

\`\`\`sh
## Notes
\`\`\`

## Notes

[First](#notes), [second](#notes-1), [third](#notes-2).
`,
  });

  assert.deepEqual(failures(check(root)), [
    "README.md:11: #notes-2 — no such heading or anchor there",
  ]);
});

test("anchors are GitHub's: an em dash, apostrophes, backticks, Chinese", (t) => {
  const root = fixture(t, {
    "docs/adr.md": `# ADRs

## ADR-082 — The product's brand

## Words you’ll meet

## Verify (\`scripts/verify.sh\`'s own header)

## 品牌
`,
    "README.md": `# Readme

[The brand](docs/adr.md#adr-082--the-products-brand),
[words](docs/adr.md#words-youll-meet),
[verify](docs/adr.md#verify-scriptsverifyshs-own-header),
[品牌](docs/adr.md#品牌), and escaped, [品牌](docs/adr.md#%E5%93%81%E7%89%8C).
`,
  });

  const run = check(root);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /: 5 to files and folders, 0 /);
});

test("app routes, other sites, front matter, fences, inline code and tmp/ are skipped", (t) => {
  const root = fixture(t, {
    "README.md": `---
description: Data, not text, so not [a link](gone.md).
---

# Readme

[Stock](/inventory), [a role](/members#role), [a site](https://example.com/gone.md),
[mail](mailto:a@example.com) and [no scheme](//example.com/gone.md).

1. In a list:

   ~~~md
   [In a fence](gone.md)
   ~~~

Not a link: \`[inline](gone.md)\`, nor this, wrapped: \`[inline
code](gone.md)\`.
`,
    "tmp/brief.md": "# Brief\n\n[Scratch](gone.md)\n",
  });

  const run = check(root);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /: 0 to files and folders, 0 to headings/);
});

test("a reference definition is checked as an inline link is", (t) => {
  const root = fixture(t, {
    "README.md": `# Readme

See [the guide][guide] and [what was there][gone].

[guide]: docs/guide.md#setup
[gone]: docs/gone.md
`,
    "docs/guide.md": GUIDE,
  });

  assert.deepEqual(failures(check(root)), [
    "README.md:6: docs/gone.md — no such file or folder",
  ]);
});

test("a path must be one git tracks, in the case GitHub's names are", (t) => {
  const root = fixture(t, {
    "README.md":
      "# Readme\n\n[Guide](Docs/guide.md), [above](../README.md),\n[notes](tmp/notes.md).\n",
    "docs/guide.md": GUIDE,
    // On this disk, but ignored, so not in a fresh checkout.
    "tmp/notes.md": "# Notes\n",
  });

  assert.deepEqual(failures(check(root)), [
    "README.md:3: Docs/guide.md — no such file or folder: names are case-sensitive on GitHub",
    "README.md:3: ../README.md — outside the repository",
    "README.md:4: tmp/notes.md — not in the repository: git ignores it, so a fresh checkout, as CI's, has none",
  ]);
});

/** An ADR's file: its front matter, a blank line, its heading and text. */
const adr = (frontMatter, heading) =>
  `---\n${frontMatter}---\n\n# ${heading}\n\nThe decision.\n`;

/** The README the ADRs need, its index not written yet. */
const INDEX =
  "# Architecture Decisions\n\n## By number\n\n<!-- adr-index:start -->\n<!-- adr-index:end -->\n";

/** The index script, run in the fixture as a person runs it. */
const writeIndex = (root) =>
  execFileSync(process.execPath, [path.join(ROOT, "scripts/adr-index.mjs")], {
    cwd: root,
  });

test("ADRs with front matter, amendments both ways and a current index pass, and a stale index fails", (t) => {
  const root = fixture(t, {
    "docs/adr/0001-one.md": adr(
      "status: accepted\ndate: 2026-08-24\namended-by: [ADR-002]\n",
      "ADR-001 — One",
    ),
    "docs/adr/0002-two.md": adr(
      "status: deferred\ndate: 2026-08-25\namends: [ADR-001]\n",
      "ADR-002 — Two (amends ADR-001)",
    ),
    "docs/adr/README.md": INDEX,
  });
  writeIndex(root);

  const run = check(root);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^ADRs in docs\/adr\/: 2, .*the index .*current/m);

  write(
    root,
    "docs/adr/0001-one.md",
    adr(
      "status: accepted\ndate: 2026-08-24\namended-by: [ADR-002]\n",
      "ADR-001 — One, renamed",
    ),
  );
  const [stale, ...rest] = failures(check(root));
  assert.match(stale, /^docs\/adr\/README\.md:9: .*stale/);
  assert.deepEqual(rest, []);
});

test("an ADR needs the README that holds the index", (t) => {
  const root = fixture(t, {
    "docs/adr/0001-one.md": adr(
      "status: accepted\ndate: 2026-08-24\n",
      "ADR-001 — One",
    ),
  });

  assert.deepEqual(failures(check(root)), [
    'docs/adr/README.md: the index — no such file: write it with a "By number" heading, <!-- adr-index:start --> and <!-- adr-index:end --> under it, then run node scripts/adr-index.mjs',
  ]);
});

test("front matter's --- lines may end in spaces, for the ADRs as for the links", (t) => {
  const root = fixture(t, {
    "docs/adr/0001-one.md":
      "--- \nstatus: accepted\ndate: 2026-08-24\n---  \n\n# ADR-001 — One\n\nThe decision.\n",
    "docs/adr/README.md": INDEX,
  });
  writeIndex(root);

  const run = check(root);
  assert.equal(run.status, 0, run.stderr);
});

test("docs/adr/ holds ADRs named NNNN-<slug>.md, the README and open-decisions.md, and nothing else git sees", (t) => {
  const root = fixture(t, {
    "docs/adr/0001-one.md": adr(
      "status: accepted\ndate: 2026-08-24\n",
      "ADR-001 — One",
    ),
    "docs/adr/002-two.md": adr(
      "status: accepted\ndate: 2026-08-25\n",
      "ADR-002 — Two",
    ),
    "docs/adr/0003_three.md": "# ADR-003 — Three\n",
    "docs/adr/0004-Four.md": "# ADR-004 — Four\n",
    "docs/adr/open-decisions.md": "# Open decisions\n",
    "docs/adr/README.md": INDEX,
    // Ignored, as a Mac's .DS_Store is, so not in a checkout.
    "docs/adr/tmp/notes.md": "# Notes\n",
  });

  const why =
    "not a name for a file here: an ADR is NNNN-<slug>.md, four digits and its title's words in lower case, and the only others are README.md and open-decisions.md";
  assert.deepEqual(failures(check(root)), [
    `docs/adr/0003_three.md:1: 0003_three.md — ${why}`,
    `docs/adr/0004-Four.md:1: 0004-Four.md — ${why}`,
    `docs/adr/002-two.md:1: 002-two.md — ${why}`,
  ]);
});

test("an ADR's front matter: none, an unknown status, a date that is not a day, a line that is not a field", (t) => {
  const root = fixture(t, {
    "docs/adr/0001-one.md": "# ADR-001 — One\n\nThe decision.\n",
    "docs/adr/0002-two.md": adr(
      "status: approved\ndate: 2026-02-30\n",
      "ADR-002 — Two",
    ),
    "docs/adr/0003-three.md": adr(
      "status: accepted\ndate 2026-08-24\n",
      "ADR-003 — Three",
    ),
    // Months and days past any calendar's, which no Date can hold.
    "docs/adr/0004-four.md": adr(
      "status: accepted\ndate: 2026-13-01\n",
      "ADR-004 — Four",
    ),
    "docs/adr/0005-five.md": adr(
      "status: accepted\ndate: 2026-10-32\n",
      "ADR-005 — Five",
    ),
    "docs/adr/README.md": INDEX,
  });

  assert.deepEqual(failures(check(root)), [
    "docs/adr/0001-one.md:1: front matter — none: an ADR opens with its status and date between --- lines",
    "docs/adr/0002-two.md:2: status: approved — not accepted, deferred or superseded by ADR-NNN",
    "docs/adr/0002-two.md:3: date: 2026-02-30 — not a day as YYYY-MM-DD",
    "docs/adr/0003-three.md:3: date 2026-08-24 — not a field: each line is a name, a colon and its value",
    "docs/adr/0003-three.md:1: date — missing from the front matter",
    "docs/adr/0004-four.md:3: date: 2026-13-01 — not a day as YYYY-MM-DD",
    "docs/adr/0005-five.md:3: date: 2026-10-32 — not a day as YYYY-MM-DD",
  ]);
});

test("an ADR's heading has its file's number", (t) => {
  const root = fixture(t, {
    "docs/adr/0012-twelve.md": adr(
      "status: accepted\ndate: 2026-08-24\n",
      "ADR-013 — Twelve",
    ),
    "docs/adr/0013-thirteen.md":
      "---\nstatus: accepted\ndate: 2026-08-24\n---\n\nThe decision, with no heading.\n",
    "docs/adr/README.md": INDEX,
  });

  assert.deepEqual(failures(check(root)), [
    "docs/adr/0012-twelve.md:6: ADR-013 — the heading's number is not the file's, ADR-012",
    "docs/adr/0013-thirteen.md:1: heading — none: the first line after the front matter is # ADR-013 — its title",
  ]);
});

test("an amendment is in both ADRs' front matter", (t) => {
  const root = fixture(t, {
    // Amended by ADR-003, whose amends does not say so.
    "docs/adr/0001-one.md": adr(
      "status: accepted\ndate: 2026-08-24\namended-by: [ADR-003]\n",
      "ADR-001 — One",
    ),
    // Amends ADR-001, whose amended-by does not say so, and ADR-009,
    // which does not exist.
    "docs/adr/0002-two.md": adr(
      "status: accepted\ndate: 2026-08-25\namends: [ADR-001, ADR-009]\n",
      "ADR-002 — Two",
    ),
    "docs/adr/0003-three.md": adr(
      "status: accepted\ndate: 2026-08-26\namends: ADR-001\n",
      "ADR-003 — Three",
    ),
    "docs/adr/README.md": INDEX,
  });

  assert.deepEqual(failures(check(root)), [
    "docs/adr/0001-one.md:4: amended-by: ADR-003 — ADR-003's amends does not list ADR-001; add it there, or take it out of this list",
    "docs/adr/0002-two.md:4: amends: ADR-001 — ADR-001's amended-by does not list ADR-002; add it there",
    "docs/adr/0002-two.md:4: amends: ADR-009 — no such ADR in docs/adr/",
    "docs/adr/0003-three.md:4: amends: ADR-001 — not a list as [ADR-046, ADR-054]",
  ]);
});

test("two ADRs with one number fail, each naming the other", (t) => {
  const root = fixture(t, {
    "docs/adr/0012-one.md": adr(
      "status: accepted\ndate: 2026-08-24\n",
      "ADR-012 — One",
    ),
    "docs/adr/0012-two.md": adr(
      "status: accepted\ndate: 2026-08-25\n",
      "ADR-012 — Two",
    ),
    "docs/adr/README.md": INDEX,
  });

  assert.deepEqual(failures(check(root)), [
    "docs/adr/0012-one.md:1: ADR-012 — also the number of docs/adr/0012-two.md; each ADR has its own",
    "docs/adr/0012-two.md:1: ADR-012 — also the number of docs/adr/0012-one.md; each ADR has its own",
  ]);
});

test("amends and amended-by are in ascending order, each ADR once", (t) => {
  const root = fixture(t, {
    "docs/adr/0001-one.md": adr(
      "status: accepted\ndate: 2026-08-24\namended-by: [ADR-003, ADR-002]\n",
      "ADR-001 — One",
    ),
    "docs/adr/0002-two.md": adr(
      "status: accepted\ndate: 2026-08-25\namends: [ADR-001, ADR-001]\n",
      "ADR-002 — Two",
    ),
    "docs/adr/0003-three.md": adr(
      "status: accepted\ndate: 2026-08-26\namends: [ADR-001]\n",
      "ADR-003 — Three",
    ),
    "docs/adr/README.md": INDEX,
  });

  assert.deepEqual(failures(check(root)), [
    "docs/adr/0001-one.md:4: amended-by: [ADR-003, ADR-002] — not in ascending order, each ADR once: write it as [ADR-002, ADR-003]",
    "docs/adr/0002-two.md:4: amends: [ADR-001, ADR-001] — not in ascending order, each ADR once: write it as [ADR-001]",
  ]);
});

test("an ADR has no field but status, date, amends and amended-by, in any order", (t) => {
  const root = fixture(t, {
    "docs/adr/0001-one.md": adr(
      "amended-by: [ADR-002]\ndate: 2026-08-24\ntitle: One\nstatus: accepted\n",
      "ADR-001 — One",
    ),
    "docs/adr/0002-two.md": adr(
      "amends: [ADR-001]\ndate: 2026-08-25\nstatus: accepted\n",
      "ADR-002 — Two",
    ),
    "docs/adr/README.md": INDEX,
  });

  assert.deepEqual(failures(check(root)), [
    "docs/adr/0001-one.md:4: title: One — not a field an ADR has: status, date, amends, amended-by",
  ]);
});

test("superseded by an ADR with no file fails", (t) => {
  const root = fixture(t, {
    "docs/adr/0001-one.md": adr(
      "status: superseded by ADR-002\ndate: 2026-08-24\n",
      "ADR-001 — One",
    ),
    "docs/adr/0002-two.md": adr(
      "status: superseded by ADR-009\ndate: 2026-08-25\n",
      "ADR-002 — Two",
    ),
    "docs/adr/README.md": INDEX,
  });

  assert.deepEqual(failures(check(root)), [
    "docs/adr/0002-two.md:2: status: superseded by ADR-009 — no such ADR in docs/adr/",
  ]);
});
