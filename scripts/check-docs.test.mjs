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
  "# Architecture Decisions\n\n## By number\n\n<!-- adr-index:start -->\n<!-- adr-index:end -->\n\n## By area\n\n<!-- adr-areas:start -->\n<!-- adr-areas:end -->\n";

/** The index script, run in the fixture as a person runs it. */
const writeIndex = (root) =>
  execFileSync(process.execPath, [path.join(ROOT, "scripts/adr-index.mjs")], {
    cwd: root,
  });

test("ADRs with front matter, amendments both ways and a current index pass, and a stale index fails", (t) => {
  const root = fixture(t, {
    "docs/adr/0001-one.md": adr(
      "status: accepted\ndate: 2026-08-24\namended-by: [ADR-002]\nareas: [docs]\n",
      "ADR-001 — One",
    ),
    "docs/adr/0002-two.md": adr(
      "status: deferred\ndate: 2026-08-25\namends: [ADR-001]\nareas: [docs]\n",
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
      "status: accepted\ndate: 2026-08-24\namended-by: [ADR-002]\nareas: [docs]\n",
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
      "status: accepted\ndate: 2026-08-24\nareas: [docs]\n",
      "ADR-001 — One",
    ),
  });

  assert.deepEqual(failures(check(root)), [
    'docs/adr/README.md: the index — no such file: write it with a "By number" heading with <!-- adr-index:start --> and <!-- adr-index:end --> under it, and a "By area" heading with <!-- adr-areas:start --> and <!-- adr-areas:end --> under it, then run node scripts/adr-index.mjs',
  ]);
});

test("front matter's --- lines may end in spaces, for the ADRs as for the links", (t) => {
  const root = fixture(t, {
    "docs/adr/0001-one.md":
      "--- \nstatus: accepted\ndate: 2026-08-24\nareas: [docs]\n---  \n\n# ADR-001 — One\n\nThe decision.\n",
    "docs/adr/README.md": INDEX,
  });
  writeIndex(root);

  const run = check(root);
  assert.equal(run.status, 0, run.stderr);
});

test("docs/adr/ holds ADRs named NNNN-<slug>.md, the README and open-decisions.md, and nothing else git sees", (t) => {
  const root = fixture(t, {
    "docs/adr/0001-one.md": adr(
      "status: accepted\ndate: 2026-08-24\nareas: [docs]\n",
      "ADR-001 — One",
    ),
    "docs/adr/002-two.md": adr(
      "status: accepted\ndate: 2026-08-25\nareas: [docs]\n",
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
      "status: approved\ndate: 2026-02-30\nareas: [docs]\n",
      "ADR-002 — Two",
    ),
    "docs/adr/0003-three.md": adr(
      "status: accepted\ndate 2026-08-24\nareas: [docs]\n",
      "ADR-003 — Three",
    ),
    // Months and days past any calendar's, which no Date can hold.
    "docs/adr/0004-four.md": adr(
      "status: accepted\ndate: 2026-13-01\nareas: [docs]\n",
      "ADR-004 — Four",
    ),
    "docs/adr/0005-five.md": adr(
      "status: accepted\ndate: 2026-10-32\nareas: [docs]\n",
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
      "status: accepted\ndate: 2026-08-24\nareas: [docs]\n",
      "ADR-013 — Twelve",
    ),
    "docs/adr/0013-thirteen.md":
      "---\nstatus: accepted\ndate: 2026-08-24\nareas: [docs]\n---\n\nThe decision, with no heading.\n",
    "docs/adr/README.md": INDEX,
  });

  assert.deepEqual(failures(check(root)), [
    "docs/adr/0012-twelve.md:7: ADR-013 — the heading's number is not the file's, ADR-012",
    "docs/adr/0013-thirteen.md:1: heading — none: the first line after the front matter is # ADR-013 — its title",
  ]);
});

test("an amendment is in both ADRs' front matter", (t) => {
  const root = fixture(t, {
    // Amended by ADR-003, whose amends does not say so.
    "docs/adr/0001-one.md": adr(
      "status: accepted\ndate: 2026-08-24\namended-by: [ADR-003]\nareas: [docs]\n",
      "ADR-001 — One",
    ),
    // Amends ADR-001, whose amended-by does not say so, and ADR-009,
    // which does not exist.
    "docs/adr/0002-two.md": adr(
      "status: accepted\ndate: 2026-08-25\namends: [ADR-001, ADR-009]\nareas: [docs]\n",
      "ADR-002 — Two",
    ),
    "docs/adr/0003-three.md": adr(
      "status: accepted\ndate: 2026-08-26\namends: ADR-001\nareas: [docs]\n",
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
      "status: accepted\ndate: 2026-08-24\nareas: [docs]\n",
      "ADR-012 — One",
    ),
    "docs/adr/0012-two.md": adr(
      "status: accepted\ndate: 2026-08-25\nareas: [docs]\n",
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
      "status: accepted\ndate: 2026-08-24\namended-by: [ADR-003, ADR-002]\nareas: [docs]\n",
      "ADR-001 — One",
    ),
    "docs/adr/0002-two.md": adr(
      "status: accepted\ndate: 2026-08-25\namends: [ADR-001, ADR-001]\nareas: [docs]\n",
      "ADR-002 — Two",
    ),
    "docs/adr/0003-three.md": adr(
      "status: accepted\ndate: 2026-08-26\namends: [ADR-001]\nareas: [docs]\n",
      "ADR-003 — Three",
    ),
    "docs/adr/README.md": INDEX,
  });

  assert.deepEqual(failures(check(root)), [
    "docs/adr/0001-one.md:4: amended-by: [ADR-003, ADR-002] — not in ascending order, each ADR once: write it as [ADR-002, ADR-003]",
    "docs/adr/0002-two.md:4: amends: [ADR-001, ADR-001] — not in ascending order, each ADR once: write it as [ADR-001]",
  ]);
});

test("an ADR has no field but status, date, areas, amends and amended-by, in any order", (t) => {
  const root = fixture(t, {
    "docs/adr/0001-one.md": adr(
      "amended-by: [ADR-002]\ndate: 2026-08-24\ntitle: One\nstatus: accepted\nareas: [docs]\n",
      "ADR-001 — One",
    ),
    "docs/adr/0002-two.md": adr(
      "amends: [ADR-001]\ndate: 2026-08-25\nstatus: accepted\nareas: [docs]\n",
      "ADR-002 — Two",
    ),
    "docs/adr/README.md": INDEX,
  });

  assert.deepEqual(failures(check(root)), [
    "docs/adr/0001-one.md:4: title: One — not a field an ADR has: status, date, areas, amends, amended-by",
  ]);
});

test("an ADR's areas: one or more, each one of AREAS, in that list's order and once", (t) => {
  const root = fixture(t, {
    "docs/adr/0001-one.md": adr(
      "status: accepted\ndate: 2026-08-24\n",
      "ADR-001 — One",
    ),
    "docs/adr/0002-two.md": adr(
      "status: accepted\ndate: 2026-08-24\nareas: invoices\n",
      "ADR-002 — Two",
    ),
    "docs/adr/0003-three.md": adr(
      "status: accepted\ndate: 2026-08-24\nareas: []\n",
      "ADR-003 — Three",
    ),
    "docs/adr/0004-four.md": adr(
      "status: accepted\ndate: 2026-08-24\nareas: [invoice, api]\n",
      "ADR-004 — Four",
    ),
    "docs/adr/0005-five.md": adr(
      "status: accepted\ndate: 2026-08-24\nareas: [api, invoices]\n",
      "ADR-005 — Five",
    ),
    "docs/adr/0006-six.md": adr(
      "status: accepted\ndate: 2026-08-24\nareas: [stock, stock]\n",
      "ADR-006 — Six",
    ),
    // A module, a core folder and what crosses them, in AREAS' order.
    "docs/adr/0007-seven.md": adr(
      "status: accepted\ndate: 2026-08-24\nareas: [invoices, audit, ui]\n",
      "ADR-007 — Seven",
    ),
    "docs/adr/README.md": INDEX,
  });

  assert.deepEqual(failures(check(root)), [
    "docs/adr/0001-one.md:1: areas — missing from the front matter: one or more of AREAS in scripts/adr-index.mjs, as [invoices, api]",
    "docs/adr/0002-two.md:4: areas: invoices — not a list of one or more areas, as [invoices, api]",
    "docs/adr/0003-three.md:4: areas: [] — not a list of one or more areas, as [invoices, api]",
    "docs/adr/0004-four.md:4: areas: invoice — not an area: boms, costs, home, invoices, locations, numbering, orders, partners, price-lists, product-licences, production-orders, products, recent, return-authorizations, search, stock, tax-codes, audit, auth, authorization, documents, files, invitations, notifications, organizations, people, users, api, database, docs, help, i18n, ops, ui",
    "docs/adr/0005-five.md:4: areas: [api, invoices] — not in the order AREAS lists them, each area once: write it as [invoices, api]",
    "docs/adr/0006-six.md:4: areas: [stock, stock] — not in the order AREAS lists them, each area once: write it as [stock]",
  ]);
});

test("superseded by an ADR with no file fails", (t) => {
  const root = fixture(t, {
    "docs/adr/0001-one.md": adr(
      "status: superseded by ADR-002\ndate: 2026-08-24\nareas: [docs]\n",
      "ADR-001 — One",
    ),
    "docs/adr/0002-two.md": adr(
      "status: superseded by ADR-009\ndate: 2026-08-25\nareas: [docs]\n",
      "ADR-002 — Two",
    ),
    "docs/adr/README.md": INDEX,
  });

  assert.deepEqual(failures(check(root)), [
    "docs/adr/0002-two.md:2: status: superseded by ADR-009 — no such ADR in docs/adr/",
  ]);
});

test("a path written as code names a file or folder; a command's first word, an ignored path and a module's pass", (t) => {
  const root = fixture(t, {
    ".gitignore": "tmp/\ndist/\n",
    "README.md": `# Readme

Run \`scripts/verify.sh\`, or \`scripts/verify.sh --quick\`; \`docs/\` holds
the guides. Import from \`client/src/api/types.gen\`; the build writes
\`client/dist/\`. Not paths: \`scripts/*.mjs\`, \`docs/adr/NNNN-<slug>.md\`,
\`client/src/…\`, \`client/src/{a,b}.ts\`, \`gone/file.md\` and \`npm run api\`.

\`\`\`sh
\`scripts/gone.sh\` in a fence
\`\`\`
`,
    "scripts/verify.sh": "",
    "client/src/api/types.gen.ts": "",
    "docs/guide.md": GUIDE,
    // History may name what has since gone.
    "docs/releases/v1.md": "# v1\n\nRemoved `scripts/gone.sh`.\n",
    "docs/adr/0001-one.md": `${adr("status: accepted\ndate: 2026-08-24\nareas: [docs]\n", "ADR-001 — One")}\nRan \`scripts/gone.sh\`.\n`,
    "docs/adr/README.md": INDEX,
    "tmp/brief.md": "# Brief\n\nWrite `scripts/gone.sh`.\n",
  });
  writeIndex(root);

  const run = check(root);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^Paths written as code: 5, /m);
});

test("a path written as code that names nothing is reported by file and line", (t) => {
  const root = fixture(t, {
    "README.md": `# Readme

The script is \`scripts/verify.sh\`, the guides in \`docs/old/\`; and
\`client/src/api/types.gen.js\`, wrapped: \`scripts/gone.sh
--yes\`.
`,
    "scripts/verify.sh": "",
    "client/src/api/types.gen.ts": "",
    "docs/guide.md": GUIDE,
  });

  const why =
    "no such file or folder in the repository; a file still to be written is named in plain words";
  assert.deepEqual(failures(check(root)), [
    `README.md:3: docs/old/ — ${why}`,
    `README.md:4: client/src/api/types.gen.js — ${why}`,
    `README.md:4: scripts/gone.sh — ${why}`,
  ]);
});

/** A test file and the manual checks a rules file cites. */
const CITED = {
  "server/test/invoices.e2e-spec.ts": `describe("Invoices", () => {
  it("refuses a credit note for more than is left of its invoice", () => {});
});
`,
  "docs/manual-checks.md":
    "# Manual checks\n\n- **MC-101** Issue an invoice.\n\nAs MC-102 does.\n",
  "docs/help.md": "# Help\n",
};

test("a rules file's test names are found in their files, and its manual checks exist", (t) => {
  const root = fixture(t, {
    ...CITED,
    "docs/rules/invoices.md": `# Invoices

## Credit notes

- **A credit note gives back no more than is left.**
  [test](../../server/test/invoices.e2e-spec.ts) "refuses a credit note for
  more than is left of its invoice" · [Help](../help.md) "not a test" ·
  MC-101
- **Invoices are listed.** [test](../../server/test/invoices.e2e-spec.ts#L1)
  "Invoices" · \`MC-999\` is code, not a citation.

\`\`\`markdown
- **An example.** [test](../../server/test/invoices.e2e-spec.ts) · MC-1234
\`\`\`
`,
  });

  const run = check(root);
  assert.equal(run.status, 0, run.stderr);
  assert.match(
    run.stdout,
    /^Rules files in docs\/rules\/: 1, citing 2 tests by name and 1 manual checks/m,
  );
});

test("a rules file's renamed test, missing name and unknown manual check fail", (t) => {
  const root = fixture(t, {
    ...CITED,
    "docs/rules/invoices.md": `# Invoices

- **One.** [test](../../server/test/invoices.e2e-spec.ts) "refuses a credit
  note for more than there is" · MC-102
- **Two.** [test](../../server/test/invoices.e2e-spec.ts) · MC-3
`,
  });

  assert.deepEqual(failures(check(root)), [
    'docs/rules/invoices.md:3: "refuses a credit note for more than there is" — not in server/test/invoices.e2e-spec.ts: renamed? Quote the test\'s name as it is now',
    `docs/rules/invoices.md:5: ../../server/test/invoices.e2e-spec.ts — no test's name after it: write it in quotes, as [test](…) "the test's name"`,
    "docs/rules/invoices.md:4: MC-102 — no such check in docs/manual-checks.md",
    "docs/rules/invoices.md:5: MC-3 — no such check in docs/manual-checks.md",
  ]);
});

/** The files an area's rules name. */
const AREA = {
  "server/src/modules/invoices/invoices.service.ts": "",
  "client/src/invoices/invoice-page.tsx": "",
  "server/test/invoices.e2e-spec.ts": "",
  "server/test/credit-notes.e2e-spec.ts": "",
};

test("Claude Code's rules have paths, each pattern matching a file, braces expanded", (t) => {
  const root = fixture(t, {
    ...AREA,
    ".claude/rules/invoices.md": `---
paths:
  - "server/src/modules/invoices/**"
  - 'client/src/**/*.tsx'
  - server/test/{invoices,credit-notes}.e2e-spec.ts
---

For Claude: invoicing's code rules.
`,
  });

  const run = check(root);
  assert.equal(run.status, 0, run.stderr);
  assert.match(
    run.stdout,
    /^Claude Code's rules in \.claude\/rules\/: 1, each with its paths; 4 patterns/m,
  );
});

test("Claude Code's rules without paths, or with a pattern that matches nothing, fail", (t) => {
  const root = fixture(t, {
    ...AREA,
    ".claude/rules/none.md": "For Claude, with no front matter.\n",
    ".claude/rules/other.md": "---\ndescription: No paths.\n---\n",
    ".claude/rules/inline.md": '---\npaths: "server/**"\n---\n',
    // Under a folder, which Claude Code loads as well.
    ".claude/rules/area/empty.md": "---\npaths:\n---\n",
    ".claude/rules/stock.md": `---
paths:
  - "server/src/modules/stock/**"
  - "server/test/{stock,invoices}.e2e-spec.ts"
  - "{client/src/invoices/{invoice,quote}-page,server/src/modules/invoices/invoices.service}.{ts,tsx}"
---
`,
  });

  const every = "or Claude Code loads it in every session";
  const nothing =
    "matches no file in the repository, and Claude Code skips it without a word";
  const braces =
    "{client/src/invoices/{invoice,quote}-page,server/src/modules/invoices/invoices.service}.{ts,tsx}";
  assert.deepEqual(failures(check(root)), [
    '.claude/rules/area/empty.md:2: paths: — not a list: under paths:, one - "pattern" to a line',
    '.claude/rules/inline.md:2: paths: "server/**" — not a list: under paths:, one - "pattern" to a line',
    `.claude/rules/none.md:1: front matter — none: open with a paths list between --- lines, ${every}`,
    `.claude/rules/other.md:1: paths — missing from the front matter: list the area's files, ${every}`,
    `.claude/rules/stock.md:3: server/src/modules/stock/** — ${nothing}`,
    `.claude/rules/stock.md:4: server/test/stock.e2e-spec.ts, in server/test/{stock,invoices}.e2e-spec.ts, — ${nothing}`,
    `.claude/rules/stock.md:5: client/src/invoices/invoice-page.ts, in ${braces}, — ${nothing}`,
    `.claude/rules/stock.md:5: client/src/invoices/quote-page.ts, in ${braces}, — ${nothing}`,
    `.claude/rules/stock.md:5: client/src/invoices/quote-page.tsx, in ${braces}, — ${nothing}`,
    `.claude/rules/stock.md:5: server/src/modules/invoices/invoices.service.tsx, in ${braces}, — ${nothing}`,
  ]);
});

/** git in the fixture, as a person with no identity of their own. */
const git = (root, ...args) =>
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd: root },
  );

test("the notice names a rules file left alone while its tests or area changed, and never fails", (t) => {
  const root = fixture(t, {
    ...AREA,
    "server/test/invoices.e2e-spec.ts": 'it("issues an invoice", () => {});\n',
    "docs/rules/invoices.md": `# Invoices

- **An invoice is issued.** [test](../../server/test/invoices.e2e-spec.ts)
  "issues an invoice"
`,
    ".claude/rules/invoices.md":
      '---\npaths:\n  - "client/src/invoices/**"\n---\n',
  });

  const notRun =
    "The rules files' notice was not run: no origin/main to compare with. git fetch origin main, then run again.";
  assert.equal(check(root).stdout.trimEnd().split("\n").at(-1), notRun);

  git(root, "add", "-A");
  git(root, "commit", "--quiet", "-m", "main");
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  assert.match(
    check(root).stdout,
    /^Rules files against origin\/main: nothing to notice\.$/m,
  );

  // The cited test, changed in a commit; a new file of the area, not yet
  // added; and a file outside both.
  write(
    root,
    "server/test/invoices.e2e-spec.ts",
    'it("issues an invoice", () => { });\n',
  );
  git(root, "commit", "--quiet", "-am", "branch");
  write(root, "client/src/invoices/void-dialog.tsx", "");
  write(root, "server/src/main.ts", "");

  const run = check(root);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    run.stdout.trimEnd().split("\n").at(-1),
    "notice: docs/rules/invoices.md — unchanged, though client/src/invoices/void-dialog.tsx, server/test/invoices.e2e-spec.ts changed on this branch: if a rule changed, update it in the same commit (ADR-087)",
  );

  write(root, "docs/rules/invoices.md", "# Invoices\n\nRewritten.\n");
  assert.match(check(root).stdout, /nothing to notice/);
});
