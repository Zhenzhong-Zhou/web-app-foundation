/**
 * Tests for verify.sh's API contract step (#346) and the container of
 * Playwright's Linux image, its wait and the browsers it serves, on Node's
 * own runner:
 * scripts/ sits outside both packages, so neither one's Vitest would find
 * them.
 *
 *     node --test scripts/
 *
 * Each test runs `verify.sh --quick` in a temporary repository holding a
 * copy of the script, the API document and the client's types. Stand-ins
 * take every other step's place: npm and npx come first on the PATH and
 * pass, but for `npm run api`, which writes what the test says it
 * generates, as openapi-ts does: the folder emptied, then written. npx
 * notes where it runs, the remote browser it is given and its arguments.
 * The container's tests run the full script, with a docker of their own,
 * which notes what it is asked, and a one-at-a-time.mjs that notes its
 * call and runs the command after --, as the lock's script does once it
 * holds the lock. The script runs through /bin/bash, the
 * Mac's 3.2 where the tests run on a Mac, so anything newer than 3.2 fails
 * here.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
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
 * scripts/one-at-a-time.mjs, as verify.sh calls it: it notes its
 * arguments, then the command's exit, in $ONE_AT_A_TIME_LOG, and runs the
 * command after --, the lock's variable set.
 */
const ONE_AT_A_TIME = `import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
const note = (line) => appendFileSync(process.env.ONE_AT_A_TIME_LOG, line + "\\n");
note(args.join(" "));
const at = args.indexOf("--");
const run = spawnSync(args[at + 1], args.slice(at + 2), {
  stdio: "inherit",
  env: { ...process.env, ONE_AT_A_TIME_HELD: args[0] },
});
note("exit " + run.status);
process.exit(run.status ?? 1);
`;

/**
 * A repository with OLD committed, and a Mac's .DS_Store in
 * client/src/api/, which git ignores and openapi-ts's emptying removes.
 */
function fixture(t) {
  const root = repository(t, "verify", {
    ".gitignore": ".DS_Store\nnode_modules/\n",
    "scripts/verify.sh": readFileSync(path.join(ROOT, "scripts/verify.sh")),
    "scripts/one-at-a-time.mjs": ONE_AT_A_TIME,
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
 * `verify.sh --quick` (or with the arguments in `mode`, none for the full
 * run), its npm writing `generated` on `npm run
 * api`, from server/ as the script runs it, and a docker, when `docker` is
 * given, that is this script. The run, with npm's, npx's, docker's and
 * one-at-a-time.mjs's calls.
 */
function verify(t, root, generated, { mode = ["--quick"], docker } = {}) {
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
  writeFileSync(
    path.join(bin, "npx"),
    `#!/bin/sh
echo "\${PWD##*/}, \${PW_TEST_CONNECT_WS_ENDPOINT:-no remote} \${PW_TEST_CONNECT_EXPOSE_NETWORK:-}: $*" >> "$0.log"
`,
    { mode: 0o755 },
  );
  // Each stand-in notes its calls in its own name's .log beside it.
  const npxLog = path.join(bin, "npx.log");
  const dockerLog = path.join(bin, "docker.log");
  const lockLog = path.join(bin, "one-at-a-time.log");
  writeFileSync(npxLog, "");
  writeFileSync(dockerLog, "");
  writeFileSync(lockLog, "");
  if (docker) writeFileSync(path.join(bin, "docker"), docker, { mode: 0o755 });
  const run = spawnSync("/bin/bash", ["scripts/verify.sh", ...mode], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      ONE_AT_A_TIME_LOG: lockLog,
    },
    timeout: 60_000,
  });
  const lines = (file) => readFileSync(file, "utf8").trimEnd().split("\n");
  return {
    ...run,
    npm: lines(log),
    npx: lines(npxLog),
    docker: lines(dockerLog),
    oneAtATime: lines(lockLog),
  };
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

/**
 * A docker whose Playwright container logs `logs` and, asked whether it is
 * running, says `running`; everything else it is asked, it does. It notes
 * each call in docker.log beside it.
 */
const container = (logs, running) => `#!/bin/sh
echo "$*" >> "$0.log"
case "$1" in
  logs) echo '${logs}' ;;
  inspect) echo '${running}' ;;
  port) echo '127.0.0.1:49152' ;;
esac
`;

/** The full run's last step reads the Playwright version the client pins. */
function withPlaywright(root) {
  write(
    root,
    "client/node_modules/@playwright/test/package.json",
    '{ "version": "1.2.3" }\n',
  );
}

/** The full run's call of its last part, the Linux browsers, under the lock. */
const LINUX_UNDER_THE_LOCK =
  "linux-browsers -- /bin/bash scripts/verify.sh --linux-browsers";

/** The Playwright suites the run started, each as npx noted it. */
const playwright = (run) =>
  run.npx.filter((call) => call.includes(": playwright "));

test("the full run stops at once, with the container's logs, when the browsers' container has exited", (t) => {
  const root = fixture(t);
  withPlaywright(root);
  const run = verify(t, root, OLD, {
    mode: [],
    docker: container("Error: the browser could not start", "false"),
  });

  assert.equal(run.error, undefined, "it waited instead of stopping");
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /Error: the browser could not start/);
  assert.match(
    run.stderr,
    /container stopped before it listened;\nits logs are above\./,
  );
  assert.doesNotMatch(run.stderr, /did not start in 120 seconds/);
  assert.doesNotMatch(run.stdout, /== All passed/);
  assert.deepEqual(playwright(run), []);
  assert.deepEqual(run.oneAtATime, [LINUX_UNDER_THE_LOCK, "exit 1"]);
});

test("the full run, once the container listens, runs the specs every browser runs in its Firefox, then in its WebKit", (t) => {
  const root = fixture(t);
  withPlaywright(root);
  const run = verify(t, root, OLD, {
    mode: [],
    docker: container("Listening on ws://0.0.0.0:3333/", "true"),
  });

  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.deepEqual(playwright(run), [
    "client, ws://127.0.0.1:49152/ <loopback>: playwright test --project=firefox",
    "client, ws://127.0.0.1:49152/ <loopback>: playwright test --project=webkit",
  ]);
  assert.equal(
    run.docker.filter((call) => call.startsWith("run ")).length,
    1,
    run.docker.join("\n"),
  );
  assert.match(
    run.stdout,
    /every browser runs, in Firefox[^]*every browser runs, in Linux WebKit[^]*^== All passed$/m,
  );
  // The container and both browsers, under one hold of the lock.
  assert.deepEqual(run.oneAtATime, [LINUX_UNDER_THE_LOCK, "exit 0"]);
});

test("--linux-browsers typed by hand, outside the lock, is refused before any container", (t) => {
  const root = fixture(t);
  withPlaywright(root);
  const bin = folder(t, "verify-bin");
  const dockerLog = path.join(bin, "docker.log");
  writeFileSync(
    path.join(bin, "docker"),
    `#!/bin/sh\necho "$*" >> '${dockerLog}'\n`,
    { mode: 0o755 },
  );
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
  };
  delete env.ONE_AT_A_TIME_HELD;
  const run = spawnSync(
    "/bin/bash",
    ["scripts/verify.sh", "--linux-browsers"],
    {
      cwd: root,
      encoding: "utf8",
      env,
      timeout: 60_000,
    },
  );

  assert.equal(run.status, 2, run.stdout + run.stderr);
  assert.match(run.stderr, /--linux-browsers is the full run's own call/);
  assert.match(
    run.stderr,
    /node scripts\/one-at-a-time\.mjs linux-browsers -- bash scripts\/verify\.sh --linux-browsers/,
  );
  assert.equal(existsSync(dockerLog), false, "it called docker");
});

test("--quick takes no lock: it runs no end-to-end or browser part", (t) => {
  const root = fixture(t);
  const run = verify(t, root, OLD);

  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.deepEqual(run.oneAtATime, [""]);
});
