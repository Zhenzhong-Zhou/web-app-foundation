/**
 * Tests for verify.sh's API contract step (#346), on Node's own runner:
 * scripts/ sits outside both packages, so neither one's Vitest would find
 * them.
 *
 *     node --test scripts/
 *
 * Each test runs `verify.sh --quick` in a temporary repository holding a
 * copy of the script, the API document and the client's types. Stand-ins
 * take every other step's place: npm and npx come first on the PATH and
 * pass, but for `npm run api`, which writes what the test says it
 * generates, as openapi-ts does: the folder emptied, then written. The
 * script runs through /bin/bash, the Mac's 3.2 where the tests run on a
 * Mac, so anything newer than 3.2 fails here.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { folder, git, repository, write } from "./git-fixture.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The API as committed at the start, then as a change regenerates it. */
const OLD = {
  "server/openapi.json": '{ "info": { "version": "1.1" } }\n',
  "client/src/api/index.ts": "export * from './types.gen';\n",
  "client/src/api/types.gen.ts": "export type TaxCode = { rate: string };\n",
};
const NEW = {
  ...OLD,
  "server/openapi.json": '{ "info": { "version": "1.2" } }\n',
  "client/src/api/types.gen.ts":
    "export type TaxCode = { rate: string; name: string };\n",
};

/** The steps' stand-ins in the repository: they pass. */
const STAND_INS = [
  "scripts/check-docs.mjs",
  "scripts/check-shell.sh",
  "server/node_modules/.bin/prettier",
];

/**
 * A repository with OLD committed, and a Mac's .DS_Store in
 * client/src/api/, which git ignores and openapi-ts's emptying removes.
 */
function fixture(t) {
  const root = repository(t, "verify", {
    ".gitignore": ".DS_Store\nnode_modules/\n",
    "scripts/verify.sh": readFileSync(path.join(ROOT, "scripts/verify.sh")),
    ...OLD,
  });
  for (const standIn of STAND_INS) {
    write(root, standIn, "");
    chmodSync(path.join(root, standIn), 0o755);
  }
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "Start");
  write(root, "client/src/api/.DS_Store", "Finder's.\n");
  return root;
}

/** Writes the files into the repository. */
function put(root, files) {
  for (const [file, text] of Object.entries(files)) write(root, file, text);
}

/**
 * `verify.sh --quick`, its npm writing `generated` on `npm run api`, from
 * server/ as the script runs it. The run, with npm's calls.
 */
function verify(t, root, generated) {
  const bin = folder(t, "verify-bin");
  const made = path.join(bin, "generated");
  for (const [file, text] of Object.entries(generated)) {
    write(made, file, text);
  }
  const log = path.join(bin, "npm.log");
  writeFileSync(
    path.join(bin, "npm"),
    `#!/bin/sh
echo "$*" >> '${log}'
if [ "$*" = "run api" ]; then
  cp '${made}/server/openapi.json' openapi.json
  rm -rf ../client/src/api
  cp -R '${made}/client/src/api' ../client/src/api
fi
`,
    { mode: 0o755 },
  );
  writeFileSync(path.join(bin, "npx"), "#!/bin/sh\n", { mode: 0o755 });
  const run = spawnSync("/bin/bash", ["scripts/verify.sh", "--quick"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });
  return { ...run, npm: readFileSync(log, "utf8").trimEnd().split("\n") };
}

const read = (root, file) => readFileSync(path.join(root, file), "utf8");
const status = (root) => git(root, "status", "--porcelain");

/** What a stale run says, after the files it names. */
const STALE =
  /^npm run api changed the files above, so they were not current\. Check\nwhat it wrote and commit it \(conventions\.md, "The API contract"\)\.$/m;

for (const [state, prepare] of [
  ["changed and not yet staged", (root) => put(root, NEW)],
  [
    "staged and not yet committed",
    (root) => {
      put(root, NEW);
      git(root, "add", ".");
    },
  ],
  [
    "committed",
    (root) => {
      put(root, NEW);
      git(root, "commit", "--quiet", "-am", "Change the API");
    },
  ],
]) {
  test(`--quick passes when the regenerated files are current, ${state}, and stages nothing`, (t) => {
    const root = fixture(t);
    prepare(root);
    const before = status(root);
    const run = verify(t, root, NEW);

    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.ok(run.npm.includes("run api"), run.npm.join("\n"));
    assert.match(run.stdout, /^== All passed$/m);
    assert.equal(status(root), before);
    for (const [file, text] of Object.entries(NEW)) {
      assert.equal(read(root, file), text, file);
    }
  });
}

test("--quick stops when the committed files are stale, naming each, and leaves what npm run api wrote", (t) => {
  const root = fixture(t);
  const run = verify(t, root, NEW);

  assert.equal(run.status, 1, run.stdout);
  assert.match(
    run.stdout,
    /^M\tclient\/src\/api\/types\.gen\.ts\nM\tserver\/openapi\.json$/m,
  );
  assert.doesNotMatch(run.stdout, /index\.ts/);
  assert.match(run.stderr, STALE);
  assert.doesNotMatch(run.stdout, /== All passed/);
  for (const [file, text] of Object.entries(NEW)) {
    assert.equal(read(root, file), text, file);
  }
});

test("--quick stops when uncommitted files are stale, a file added and one removed among them", (t) => {
  const root = fixture(t);
  put(root, NEW);
  const generated = {
    ...NEW,
    "client/src/api/revision.gen.ts": "export const API_REVISION = 2;\n",
  };
  delete generated["client/src/api/index.ts"];
  const run = verify(t, root, generated);

  assert.equal(run.status, 1, run.stdout);
  assert.match(
    run.stdout,
    /^D\tclient\/src\/api\/index\.ts\nA\tclient\/src\/api\/revision\.gen\.ts$/m,
  );
  assert.doesNotMatch(run.stdout, /openapi\.json|types\.gen\.ts/);
  assert.match(run.stderr, STALE);
});
