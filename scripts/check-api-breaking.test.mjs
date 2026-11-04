/**
 * Tests for check-api-breaking.sh, on Node's own runner: scripts/ sits
 * outside both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * The script runs in a throwaway repository whose commit holds the base's
 * server/openapi.json and whose tree holds the revision's, with a
 * stand-in for docker first on the PATH: it says the image is here, keeps
 * a copy of the folder each run is given as /specs, so a test reads what
 * oasdiff would have compared, and reports nothing breaking. oasdiff
 * itself never runs. The script runs through /bin/bash, the Mac's 3.2
 * where the tests run on a Mac, so anything newer than 3.2 fails here.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { folder, git, repository, write } from "./git-fixture.mjs";

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "check-api-breaking.sh",
);

const ACCEPTED = "# Reviewed and accepted.\n";

/** A GET whose 200 answers `schema`. */
const answering = (schema) => ({
  get: {
    responses: {
      200: { description: "", content: { "application/json": { schema } } },
    },
  },
});

/**
 * An API document whose Permission schema holds `permissions`, listed
 * again inline in GET /roles's response, as the server's document lists
 * them in each response; and an order's `statuses`, an enum that is not
 * the permissions.
 */
const document = (permissions, statuses) =>
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "API", version: "4" },
    paths: {
      "/roles": answering({
        type: "array",
        items: { type: "string", enum: permissions },
      }),
      "/orders": answering({ type: "string", enum: statuses }),
    },
    components: {
      schemas: { Permission: { type: "string", enum: permissions } },
    },
  });

/** Where `run`'s base lists the permissions, then an order's statuses. */
const enums = ({ base }) => ({
  schema: base.components.schemas.Permission.enum,
  roles:
    base.paths["/roles"].get.responses[200].content["application/json"].schema
      .items.enum,
  orders:
    base.paths["/orders"].get.responses[200].content["application/json"].schema
      .enum,
});

/**
 * The script against a commit holding `base`, with `revision` on disk:
 * the run, with each docker run's /specs as the stand-in kept it.
 */
function check(t, base, revision) {
  const root = repository(t, "check-api-breaking", {
    "scripts/check-api-breaking.sh": readFileSync(SCRIPT, "utf8"),
    "server/openapi.json": base,
    "server/openapi-breaking-accepted.txt": ACCEPTED,
  });
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "The base");
  write(root, "server/openapi.json", revision);

  const bin = folder(t, "check-api-breaking-bin");
  const runs = folder(t, "check-api-breaking-runs");
  writeFileSync(
    path.join(bin, "docker"),
    [
      "#!/bin/sh",
      '[ "$1" = image ] && exit 0',
      `n=$(ls '${runs}' | wc -l | tr -d ' ')`,
      "previous=",
      "for arg; do",
      `  [ "$previous" = -v ] && cp -R "\${arg%%:*}" '${runs}'/run-$n`,
      "  previous=$arg",
      "done",
      `case " $* " in *" --format json "*) echo '[]' ;; esac`,
      "",
    ].join("\n"),
    { mode: 0o755 },
  );

  const run = spawnSync(
    "/bin/bash",
    [path.join(root, "scripts/check-api-breaking.sh"), "HEAD"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: [bin, process.env.PATH].join(path.delimiter),
      },
    },
  );
  const specs = readdirSync(runs)
    .sort()
    .map((each) => ({
      base: JSON.parse(
        readFileSync(path.join(runs, each, "base.json"), "utf8"),
      ),
      accepted: readFileSync(path.join(runs, each, "accepted.txt"), "utf8"),
    }));
  return { ...run, specs };
}

// The order's status named as the new permission is: widened in the base,
// it would pass as one (#432).
test("oasdiff compares once, with a new permission in the base where it lists the permissions alone", (t) => {
  const { status, stderr, specs } = check(
    t,
    document(["orders.view"], ["open"]),
    document(["orders.view", "orders.ship"], ["open", "orders.ship"]),
  );

  assert.equal(status, 0, stderr);
  assert.equal(specs.length, 1, "one oasdiff run");
  assert.deepEqual(enums(specs[0]), {
    schema: ["orders.view", "orders.ship"],
    roles: ["orders.view", "orders.ship"],
    orders: ["open"],
  });
  assert.equal(specs[0].accepted, ACCEPTED, "no line added to the accepted");
});

test("a permission the revision takes away stays in the base, so oasdiff still finds it gone", (t) => {
  const { status, stderr, specs } = check(
    t,
    document(["orders.view", "orders.cancel"], ["open"]),
    document(["orders.view", "orders.ship"], ["open"]),
  );

  assert.equal(status, 0, stderr);
  assert.deepEqual(enums(specs.at(-1)).schema, [
    "orders.view",
    "orders.cancel",
    "orders.ship",
  ]);
});
