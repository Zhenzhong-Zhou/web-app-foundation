/**
 * Tests for check-docs.mjs: ADR-087's checks, paths written as code, the rules files, Claude Code's rules and the notice. On Node's own runner, since scripts/
 * sits outside both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * What they share is in check-docs-fixture.mjs and git-fixture.mjs.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  adr,
  check,
  failures,
  fixture,
  GUIDE,
  INDEX,
  writeIndex,
} from "./check-docs-fixture.mjs";
import { git, write } from "./git-fixture.mjs";

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
    // An ADR, history, may name what has since gone.
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
    // Beside the ADRs, but not history.
    "docs/adr/open-decisions.md":
      "# Open decisions\n\n## One\n\nAs `scripts/gone.sh` would.\n",
    "docs/releases/v1.md": "# v1\n\nRemoved `scripts/gone.sh`.\n",
  });

  const why =
    "no such file or folder in the repository; a file still to be written is named in plain words";
  assert.deepEqual(failures(check(root)), [
    `README.md:3: docs/old/ — ${why}`,
    `README.md:4: client/src/api/types.gen.js — ${why}`,
    `README.md:4: scripts/gone.sh — ${why}`,
    `docs/adr/open-decisions.md:5: scripts/gone.sh — ${why}`,
    `docs/releases/v1.md:3: scripts/gone.sh — ${why}`,
  ]);
});

/** A test file and the manual checks a rules file cites, and its area. */
const CITED = {
  "server/src/modules/invoices/invoices.module.ts": "",
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
    // Not a rules file, so not counted.
    "docs/rules/README.md": "# Rules\n",
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

test("a rules file's renamed test, missing name and unknown manual check fail, and one not named for an area", (t) => {
  const root = fixture(t, {
    ...CITED,
    "docs/rules/inventory.md": "# Inventory\n",
    "docs/rules/invoices.md": `# Invoices

- **One.** [test](../../server/test/invoices.e2e-spec.ts) "refuses a credit
  note for more than there is" · MC-102
- **Two.** [test](../../server/test/invoices.e2e-spec.ts) · MC-3
- **Three,** its link %-escaped as the link check reads it.
  [test](../../server/test/invoices.e2e%2Dspec.ts) "a name it lacks"
`,
  });

  assert.deepEqual(failures(check(root)), [
    "docs/rules/inventory.md:1: inventory — not an area: a rules file takes its area's name from AREAS in scripts/adr-index.mjs, as its .claude/rules/ file does",
    'docs/rules/invoices.md:3: "refuses a credit note for more than there is" — no test by that name in server/test/invoices.e2e-spec.ts: renamed? Quote the test\'s name as it is now, whole',
    `docs/rules/invoices.md:5: ../../server/test/invoices.e2e-spec.ts — no test's name after it: write it in quotes, as [test](…) "the test's name"`,
    'docs/rules/invoices.md:7: "a name it lacks" — no test by that name in server/test/invoices.e2e-spec.ts: renamed? Quote the test\'s name as it is now, whole',
    "docs/rules/invoices.md:4: MC-102 — no such check in docs/manual-checks.md",
    "docs/rules/invoices.md:5: MC-3 — no such check in docs/manual-checks.md",
  ]);
});

test("a rules file's test name is a declared test's, whole: not words in a comment or a longer name", (t) => {
  const root = fixture(t, {
    ...CITED,
    "server/src/modules/stock/stock.module.ts": "",
    "server/test/stock.e2e-spec.ts": `describe("Stock", () => {
  // was: refuses a voided shipment
  it("refuses a voided shipment, and a draft", () => {});
  it.skip('refuses a sample order, and a sample shipment', () => {});
  test('doesn\\'t ship what is not \\
on hand', () => {});
});
`,
    "docs/rules/stock.md": `# Stock

- **One.** [test](../../server/test/stock.e2e-spec.ts) "refuses a voided
  shipment" · [test](../../server/test/stock.e2e-spec.ts) "refuses a sample"
- **Two.** [test](../../server/test/stock.e2e-spec.ts) "doesn't ship what is
  not on hand" · [test](../../server/test/stock.e2e-spec.ts) "Stock"
`,
  });

  const why =
    "no test by that name in server/test/stock.e2e-spec.ts: renamed? Quote the test's name as it is now, whole";
  assert.deepEqual(failures(check(root)), [
    `docs/rules/stock.md:3: "refuses a voided shipment" — ${why}`,
    `docs/rules/stock.md:4: "refuses a sample" — ${why}`,
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
    // The innermost braces first, so invoice's alternatives, then quote's.
    `.claude/rules/stock.md:5: client/src/invoices/invoice-page.ts, in ${braces}, — ${nothing}`,
    `.claude/rules/stock.md:5: server/src/modules/invoices/invoices.service.tsx, in ${braces}, — ${nothing}`,
    `.claude/rules/stock.md:5: client/src/invoices/quote-page.ts, in ${braces}, — ${nothing}`,
    `.claude/rules/stock.md:5: client/src/invoices/quote-page.tsx, in ${braces}, — ${nothing}`,
  ]);
});

test("Claude Code's rules: a comment or blank line in paths is skipped and the patterns after it checked; any other line fails", (t) => {
  const root = fixture(t, {
    ...AREA,
    ".claude/rules/invoices.md": `---
paths:
  - "server/src/modules/invoices/**"
  # the browser tests

  - "client/e2e/invoices.spec.ts"
description: Invoicing.
---
`,
    ".claude/rules/stock.md": `---
paths:
  - "server/test/invoices.e2e-spec.ts"
  server/test/credit-notes.e2e-spec.ts
  - "server/src/modules/stock/**"
---
`,
  });

  assert.deepEqual(failures(check(root)), [
    ".claude/rules/invoices.md:6: client/e2e/invoices.spec.ts — matches no file in the repository, and Claude Code skips it without a word",
    '.claude/rules/stock.md:4: server/test/credit-notes.e2e-spec.ts — not a pattern: under paths:, one - "pattern" to a line, or a # comment',
  ]);
});

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
