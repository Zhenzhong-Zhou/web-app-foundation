/**
 * Tests for adr-check.mjs, on Node's own runner: scripts/ sits outside
 * both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * Each test runs the script in a temporary repository, whose invoices
 * folder makes it an area beside the ones every repository has, with a
 * stand-in gh first on PATH. The stand-in answers only the calls the
 * script makes, from the issues the test gives it, and fails on any
 * other, so a call the check must not make, `gh issue view --comments`
 * among them, fails the test.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { folder, repository, write } from "./git-fixture.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** gh, as the script calls it, answered from the JSON file $GH_STAND_IN. */
const STAND_IN = `#!${process.execPath}
const { readFileSync } = require("node:fs");
const { issues, signedIn, failing } = JSON.parse(
  readFileSync(process.env.GH_STAND_IN, "utf8"),
);
const said = process.argv.slice(2).join(" ");
const fail = (why) => {
  process.stderr.write(why + "\\n");
  process.exit(1);
};
const labelled = (label) => issues.filter((i) => i.labels.includes(label));
const list = /^issue list --state open --label (\\S+) --limit 100( --json number,labels)?$/;
const view = /^issue view (\\d+) --json number,title,body,comments$/;
let match;
if (said === "auth status") {
  if (!signedIn) fail("You are not logged into any GitHub hosts.");
} else if ((match = list.exec(said))) {
  const open = labelled(match[1]);
  process.stdout.write(
    match[2]
      ? JSON.stringify(
          open.map((i) => ({
            number: i.number,
            labels: i.labels.map((name) => ({ name })),
          })),
        )
      : open
          .map((i) => [i.number, "OPEN", i.title, i.labels.join(", "), "2026-11-02T00:00:00Z"].join("\\t") + "\\n")
          .join(""),
  );
} else if ((match = view.exec(said))) {
  const issue = issues.find((i) => i.number === Number(match[1]));
  if (!issue || failing.includes(issue.number)) {
    fail("GraphQL: Could not resolve to an issue with the number of " + match[1] + ".");
  }
  process.stdout.write(
    JSON.stringify({
      number: issue.number,
      title: issue.title,
      body: issue.body,
      comments: issue.comments.map(([login, body]) => ({ author: { login }, body })),
    }),
  );
} else {
  fail("The stand-in gh does not answer: gh " + said);
}
`;

/**
 * The issues the stand-in knows, each listed under its labels: #12 and
 * #40 when-touched in docs, #7 and #40 in ops, #25 in neither area.
 */
const ISSUES = [
  {
    number: 30,
    title: "CI: a slow step",
    labels: ["area:ops", "later"],
    body: "Takes four minutes.",
    comments: [],
  },
  {
    number: 7,
    title: "CI: a flaky upload",
    labels: ["bug", "area:ops", "when-touched"],
    body: "Fails one run in ten.",
    comments: [],
  },
  {
    number: 40,
    title: "Docs and CI: the README's commands",
    labels: ["area:docs", "area:ops", "when-touched"],
    body: "Two commands are out of date.",
    comments: [["Zhenzhong-Zhou", "One is fixed."]],
  },
  {
    number: 12,
    title: "Docs: a stale link",
    labels: ["area:docs", "when-touched"],
    body: "The link in the handoff.\n\nIt moved.",
    comments: [
      ["Zhenzhong-Zhou", "Still there."],
      ["claude", "Fixed in part."],
    ],
  },
  {
    number: 25,
    title: "Invoices: rounding",
    labels: ["area:invoices"],
    body: "Rounds each line.",
    comments: [],
  },
];

/** A temporary repository, and a folder holding the stand-in gh. */
function fixture(t, { signedIn = true, failing = [] } = {}) {
  const root = repository(t, "adr-check", {
    "server/src/modules/invoices/index.ts": "",
  });
  const bin = folder(t, "adr-check-bin");
  write(bin, "gh", STAND_IN);
  chmodSync(path.join(bin, "gh"), 0o755);
  const answers = path.join(bin, "issues.json");
  write(
    bin,
    "issues.json",
    JSON.stringify({ issues: ISSUES, signedIn, failing }),
  );
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    GH_STAND_IN: answers,
  };
  return { root, env };
}

/** The script, run in the fixture as a person runs it. */
const run = ({ root, env }, ...args) =>
  spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts/adr-check.mjs"), ...args],
    { cwd: root, env, encoding: "utf8" },
  );

const check = ({ root }) =>
  readFileSync(path.join(root, "tmp/adr-089/check.txt"), "utf8");

/** The headings of the issues read whole, in the file's order. */
const readWhole = (text) => text.match(/^== #\d+/gm);

test("writes each area's open issues, then each issue named and each when-touched one, in number order", (t) => {
  const repo = fixture(t);

  const written = run(repo, "089", "--areas", "ops,docs", "--issues", "25");
  assert.equal(written.status, 0, written.stderr);
  assert.equal(
    written.stdout,
    "Wrote tmp/adr-089/check.txt: 2 areas, 4 open issues, 4 read whole. Attach it to the chat.\n",
  );
  assert.equal(
    check(repo),
    `== area:ops
30\tOPEN\tCI: a slow step\tarea:ops, later\t2026-11-02T00:00:00Z
7\tOPEN\tCI: a flaky upload\tbug, area:ops, when-touched\t2026-11-02T00:00:00Z
40\tOPEN\tDocs and CI: the README's commands\tarea:docs, area:ops, when-touched\t2026-11-02T00:00:00Z
== area:docs
40\tOPEN\tDocs and CI: the README's commands\tarea:docs, area:ops, when-touched\t2026-11-02T00:00:00Z
12\tOPEN\tDocs: a stale link\tarea:docs, when-touched\t2026-11-02T00:00:00Z
== #7 CI: a flaky upload
Fails one run in ten.
== #12 Docs: a stale link
The link in the handoff.

It moved.
-- Zhenzhong-Zhou:
Still there.
-- claude:
Fixed in part.
== #25 Invoices: rounding
Rounds each line.
== #40 Docs and CI: the README's commands
Two commands are out of date.
-- Zhenzhong-Zhou:
One is fixed.
`,
  );
});

test("an issue both named and when-touched is read once", (t) => {
  const repo = fixture(t);

  const written = run(repo, "089", "--areas", "docs", "--issues", "12,40,12");
  assert.equal(written.status, 0, written.stderr);
  assert.deepEqual(readWhole(check(repo)), ["== #12", "== #40"]);
});

test("without --issues, it reads the areas' when-touched issues alone", (t) => {
  const repo = fixture(t);

  const written = run(repo, "089", "--areas", "ops");
  assert.equal(written.status, 0, written.stderr);
  assert.match(written.stdout, /: 1 area, 3 open issues, 2 read whole\./);
  assert.deepEqual(readWhole(check(repo)), ["== #7", "== #40"]);
});

test("refuses a mistyped area, naming the areas, and writes nothing", (t) => {
  const repo = fixture(t);

  const refused = run(repo, "089", "--areas", "docs,doc");
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /^Not an area: doc\. The areas, from /);
  assert.match(refused.stderr, /: invoices, api, database, docs, help, /);
  assert.equal(existsSync(path.join(repo.root, "tmp")), false);
});

test("refuses an ADR number not of three digits, and writes nothing", (t) => {
  const repo = fixture(t);

  for (const number of ["89", "0089", "ADR-089"]) {
    const refused = run(repo, number, "--areas", "docs");
    assert.equal(refused.status, 1, number);
    assert.match(refused.stderr, /^Not an ADR number of three digits: /);
  }
  assert.equal(existsSync(path.join(repo.root, "tmp")), false);
});

test("refuses when gh is not signed in, and writes nothing", (t) => {
  const repo = fixture(t, { signedIn: false });

  const refused = run(repo, "089", "--areas", "docs");
  assert.equal(refused.status, 1);
  assert.match(
    refused.stderr,
    /^gh is not signed in, or cannot reach GitHub, as gh auth status says: run gh auth login/,
  );
  assert.equal(existsSync(path.join(repo.root, "tmp")), false);
});

test("stops when gh fails for one issue, naming it, and writes nothing", (t) => {
  const repo = fixture(t, { failing: [40] });

  const stopped = run(repo, "089", "--areas", "docs");
  assert.equal(stopped.status, 1);
  assert.match(
    stopped.stderr,
    /^gh failed reading #40, so nothing was written:/,
  );
  assert.equal(existsSync(path.join(repo.root, "tmp")), false);
});
