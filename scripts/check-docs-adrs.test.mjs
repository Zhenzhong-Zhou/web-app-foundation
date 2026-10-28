/**
 * Tests for check-docs.mjs: the ADRs, by adr-index.mjs's rules. On Node's own runner, since scripts/
 * sits outside both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * What they share is in check-docs-fixture.mjs.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  adr,
  check,
  failures,
  fixture,
  INDEX,
  write,
  writeIndex,
} from "./check-docs-fixture.mjs";

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

test("docs/adr/ holds ADRs named NNNN-<slug>.md, the README, open-decisions.md and the template, and nothing else git sees", (t) => {
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
    "docs/adr/template.md": "# ADR-NNN — Title\n",
    "docs/adr/README.md": INDEX,
    // Ignored, as a Mac's .DS_Store is, so not in a checkout.
    "docs/adr/tmp/notes.md": "# Notes\n",
  });

  const why =
    "not a name for a file here: an ADR is NNNN-<slug>.md, four digits and its title's words in lower case, and the only others are README.md, open-decisions.md and template.md";
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

test("an amendment headed with another ADR's number is in amended-by", (t) => {
  const root = fixture(t, {
    "docs/adr/0001-one.md": `${adr(
      "status: accepted\ndate: 2026-08-24\namended-by: [ADR-002]\nareas: [docs]\n",
      "ADR-001 — One",
    )}
## Amendment (October 2026) — as built (#12)

## Amendment (October 2026) — two (ADR-002)

## Amendment (October 2026) — three ([ADR-003](0003-three.md), #14)
`,
    "docs/adr/0002-two.md": adr(
      "status: accepted\ndate: 2026-08-25\namends: [ADR-001]\nareas: [docs]\n",
      "ADR-002 — Two",
    ),
    "docs/adr/0003-three.md": `${adr(
      "status: accepted\ndate: 2026-08-26\nareas: [docs]\n",
      "ADR-003 — Three",
    )}
## Amendment (October 2026) — as built (ADR-003)
`,
    "docs/adr/README.md": INDEX,
  });

  assert.deepEqual(failures(check(root)), [
    "docs/adr/0001-one.md:16: ## Amendment (October 2026) — three ([ADR-003](0003-three.md), #14) — names ADR-003, which amended-by does not list: add it there, and ADR-001 to its amends",
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
    // AREAS, from the tree: the folders of modules/, then core/, then
    // shared/, each in order; a file beside the folders is not one.
    "server/src/modules/stock/stock.ts": "",
    "server/src/modules/invoices/invoices.ts": "",
    "server/src/modules/README.md": "",
    "server/src/core/audit/audit.ts": "",
    "server/src/shared/mail/mail.ts": "",
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
    "docs/adr/0004-four.md:4: areas: invoice — not an area: invoices, stock, audit, mail, api, database, docs, help, i18n, ops, ui",
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
