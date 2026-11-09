/**
 * Tests for cloud-picks.sh, on Node's own runner:
 *
 *     node --test scripts/
 *
 * Each test runs the script in a temporary repository, with a stand-in gh
 * first on PATH that answers only the two calls the script makes, from
 * the issues the test gives it, and fails on any other.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { folder, repository, write } from "./git-fixture.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** gh, as the script calls it, answered from the JSON file $GH_STAND_IN. */
const STAND_IN = `#!${process.execPath}
const { readFileSync } = require("node:fs");
const issues = JSON.parse(readFileSync(process.env.GH_STAND_IN, "utf8"));
const said = process.argv.slice(2).join(" ");
const jq = require("node:child_process");
let match;
if (said.startsWith("issue list --state open --limit 500 --json number,title,labels,body --jq ")) {
  const filter = process.argv[process.argv.indexOf("--jq") + 1];
  const listed = issues.map(({ comments, ...i }) => ({
    ...i,
    labels: i.labels.map((name) => ({ name })),
  }));
  const done = jq.spawnSync("jq", ["-c", filter], { input: JSON.stringify(listed), encoding: "utf8" });
  process.stdout.write(done.stdout);
  process.exit(done.status);
} else if ((match = /^issue view (\\d+) --json number,title,labels,body,comments$/.exec(said))) {
  const issue = issues.find((i) => i.number === Number(match[1]));
  if (!issue) {
    process.stderr.write("Could not resolve to an issue\\n");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({ ...issue, labels: issue.labels.map((name) => ({ name })) }));
} else {
  process.stderr.write("The stand-in gh does not answer: gh " + said + "\\n");
  process.exit(1);
}
`;

const issue = (number, labels) => ({
  number,
  title: `Issue ${number}`,
  labels,
  body: `Text of ${number}.`,
  comments: [{ author: { login: "bob" }, body: `Comment on ${number}.` }],
});

const ISSUES = [
  issue(1, ["fix-now"]),
  issue(2, ["when-touched", "area:docs"]),
  issue(3, ["fix-now", "later"]),
  issue(4, ["when-touched", "decision"]),
  issue(5, ["bug"]),
  issue(6, ["fix-now", "area:ops"]),
];

/** A temporary repository holding the script and a stand-in gh. */
function fixture(t) {
  const root = repository(t, "cloud-picks");
  write(root, "scripts/.keep", "");
  cpSync(
    path.join(ROOT, "scripts/cloud-picks.sh"),
    path.join(root, "scripts/cloud-picks.sh"),
  );
  const bin = folder(t, "cloud-picks-bin");
  write(bin, "gh", STAND_IN);
  chmodSync(path.join(bin, "gh"), 0o755);
  write(bin, "issues.json", JSON.stringify(ISSUES));
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    GH_STAND_IN: path.join(bin, "issues.json"),
  };
  return { root, env };
}

const run = ({ root, env }, ...args) =>
  spawnSync("bash", [path.join(root, "scripts/cloud-picks.sh"), ...args], {
    cwd: root,
    env,
    encoding: "utf8",
  });

const read = ({ root }, file) =>
  JSON.parse(readFileSync(path.join(root, file), "utf8"));

test("without numbers: the fix-now and when-touched issues, none later or decision, without comments", (t) => {
  const repo = fixture(t);

  const done = run(repo);
  assert.equal(done.status, 0, done.stderr);
  assert.equal(done.stdout, "tmp/cloud-picks.json: 3 issues\n");
  const picks = read(repo, "tmp/cloud-picks.json");
  assert.deepEqual(
    picks.map((i) => i.number),
    [1, 2, 6],
  );
  assert.deepEqual(Object.keys(picks[0]).sort(), [
    "body",
    "labels",
    "number",
    "title",
  ]);
});

test("with numbers: each issue's text and comments, in the order given", (t) => {
  const repo = fixture(t);

  const done = run(repo, "6", "2");
  assert.equal(done.status, 0, done.stderr);
  assert.equal(done.stdout, "tmp/cloud-picks-shortlist.json: 2 issues\n");
  const shortlist = read(repo, "tmp/cloud-picks-shortlist.json");
  assert.deepEqual(
    shortlist.map((i) => i.number),
    [6, 2],
  );
  assert.equal(shortlist[1].body, "Text of 2.");
  assert.equal(shortlist[1].comments[0].body, "Comment on 2.");
});

test("a number that is not one is refused, and an unknown issue fails the run", (t) => {
  const repo = fixture(t);

  const bad = run(repo, "12x");
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /'12x' is not an issue number/);

  const missing = run(repo, "99");
  assert.notEqual(missing.status, 0);
});
