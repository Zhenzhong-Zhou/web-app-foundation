/**
 * Tests for folder-databases.mjs, on Node's own runner, with the scripts'
 * tests:
 *
 *     node --test scripts/
 *
 * The working folders are real: a temporary repository and a second
 * working folder beside it, as git-fixture.mjs makes them, with their own
 * .env files. The rest is a stand-in: a Postgres holding its databases by
 * name, each with its count of migrations applied, and npm, whose
 * migrate:all applies the migrations to the databases the folder's .env
 * names, as the folder's own code would.
 */
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { folder as tempFolder, git, write } from "./git-fixture.mjs";
import {
  MAX_NAME_BYTES,
  SYSTEM,
  Stop,
  databaseOf,
  drop,
  folderNames,
  give,
  mainFolder,
  nameOf,
  npmEnv,
  parse,
  rewriteEnv,
  secondFolder,
  withDatabase,
} from "./folder-databases.mjs";

/** The migrations the folder's code holds, which migrate:all applies. */
const MIGRATIONS = 80;

const MAIN = {
  dev: "foundation",
  test: "foundation_test",
  e2e: "foundation_e2e",
};

/** The main folder's .env: the three addresses among other lines. */
const MAIN_ENV = [
  "# Copy to .env and fill in. Never commit .env.",
  "NODE_ENV=development",
  "",
  "# --- Database ---",
  "POSTGRES_USER=app",
  "DATABASE_URL=postgresql://app:s%40fe@localhost:5432/foundation",
  "# Separate database for integration tests.",
  "DATABASE_URL_TEST=postgresql://app:s%40fe@localhost:5432/foundation_test",
  "DATABASE_URL_E2E=postgresql://app:other@localhost:5432/foundation_e2e?sslmode=disable",
  'MAIL_FROM="Panivo <no-reply@localhost>"',
  "",
].join("\n");

/** What the main folder's .env becomes in ../waf-fix. */
const WAF_FIX_ENV = MAIN_ENV.replace(
  "5432/foundation\n",
  "5432/foundation_waf_fix\n",
)
  .replace("foundation_test", "foundation_waf_fix_test")
  .replace("foundation_e2e", "foundation_waf_fix_e2e");

const refuses = (run, message) =>
  assert.throws(
    run,
    (error) => error instanceof Stop && message.test(error.message),
  );

const refusesAsync = (run, message) =>
  assert.rejects(
    run,
    (error) => error instanceof Stop && message.test(error.message),
  );

/**
 * A repository in `main`, its .env as given, and a second working folder
 * beside it, `waf-fix` unless named, its server/node_modules there.
 */
function folders(t, { env = MAIN_ENV, second = "waf-fix" } = {}) {
  const parent = tempFolder(t, "folder-databases");
  const main = path.join(parent, "main");
  mkdirSync(main);
  git(main, "init", "--quiet");
  write(main, "server/package.json", "{}\n");
  git(main, "add", ".");
  git(main, "commit", "--quiet", "-m", "first");
  if (env !== null) writeFileSync(path.join(main, ".env"), env);
  const there = path.join(parent, second);
  git(main, "worktree", "add", "--quiet", "--detach", there);
  mkdirSync(path.join(there, "server/node_modules"));
  return {
    parent,
    main: realpathSync(main),
    second: realpathSync(there),
  };
}

/**
 * Postgres, its databases by name, each with its migrations applied. A
 * connection to a database it lacks fails, as Postgres's does.
 */
function postgres(databases = MAIN) {
  const server = {
    databases: new Map(Object.values(databases).map((name) => [name, 0])),
    sql: [],
  };
  server.connect = async (url) => {
    const name = new URL(url).pathname.slice(1);
    if (name !== "postgres" && !server.databases.has(name)) {
      throw new Error(`database "${name}" does not exist`);
    }
    return {
      async query(sql, params = []) {
        server.sql.push(sql);
        if (sql.includes("from pg_database")) {
          return { rows: server.databases.has(params[0]) ? [{}] : [] };
        }
        let match = /^create database "([a-z0-9_]+)"$/.exec(sql);
        if (match) {
          assert.equal(name, "postgres");
          assert.equal(server.databases.has(match[1]), false);
          server.databases.set(match[1], 0);
          return { rows: [] };
        }
        match = /^drop database "([a-z0-9_]+)" with \(force\)$/.exec(sql);
        if (match) {
          assert.equal(name, "postgres");
          server.databases.delete(match[1]);
          return { rows: [] };
        }
        if (sql.includes("to_regclass('drizzle.__drizzle_migrations')")) {
          return { rows: [{ present: server.databases.get(name) > 0 }] };
        }
        if (sql.includes("from drizzle.__drizzle_migrations")) {
          return { rows: [{ applied: server.databases.get(name) }] };
        }
        throw new Error(`Not a call the script makes: ${sql}`);
      },
      async end() {},
    };
  };
  return server;
}

/**
 * The system a run uses, from the main folder: the stand-in Postgres, and
 * npm whose migrate:all applies the migrations to the databases the
 * folder's .env names. A shell's own addresses are in its environment.
 */
function system(root, server, overrides = {}) {
  const said = [];
  const npm = [];
  return {
    said,
    npm: (dir, args, env) => {
      npm.push({ dir, script: args.join(" "), env });
      if (args[1] === "migrate:all") {
        const env = SYSTEM.parseEnv(
          readFileSync(path.join(dir, "..", ".env"), "utf8"),
        );
        for (const key of [
          "DATABASE_URL",
          "DATABASE_URL_TEST",
          "DATABASE_URL_E2E",
        ]) {
          const name = databaseOf(env[key]);
          assert.equal(server.databases.has(name), true, name);
          server.databases.set(name, MIGRATIONS);
        }
      }
      return 0;
    },
    ran: npm,
    root,
    cwd: root,
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: "postgresql://app@localhost:5432/foundation",
      MIGRATE_TARGET: "test",
    },
    parseEnv: SYSTEM.parseEnv,
    connect: server.connect,
    say: (line) => said.push(line),
    ...overrides,
  };
}

test("the arguments: a folder, or --drop and a folder", () => {
  assert.deepEqual(parse(["../waf-fix"]), {
    drop: false,
    folder: "../waf-fix",
  });
  assert.deepEqual(parse(["--drop", "../waf-fix"]), {
    drop: true,
    folder: "../waf-fix",
  });
  for (const wrong of [
    [],
    ["--drop"],
    ["../a", "../b"],
    ["--drop", "../a", "../b"],
    ["--remove", "../a"],
    [""],
  ]) {
    assert.equal(parse(wrong), null, wrong.join(" "));
  }
});

test("the names: the main folder's three, the folder's own name after the dev name", () => {
  assert.deepEqual(folderNames(MAIN, "/Users/bob/waf-fix"), {
    dev: "foundation_waf_fix",
    test: "foundation_waf_fix_test",
    e2e: "foundation_waf_fix_e2e",
  });
  assert.equal(nameOf("/Users/bob/Waf.Fix 2"), "waf_fix_2");
  assert.equal(nameOf("/Users/bob/café-品桥"), "caf____");
  assert.deepEqual(
    folderNames(
      { dev: "app", test: "app_testing", e2e: "app_e2e" },
      "/Users/bob/items",
    ),
    { dev: "app_items", test: "app_items_testing", e2e: "app_items_e2e" },
  );
});

test("a name over 63 bytes, the main folder's own, or one not from the dev name is refused", () => {
  // foundation_ and _test are 16 bytes: a 47-byte folder name fills 63.
  const longest = "a".repeat(MAX_NAME_BYTES - 16);
  assert.equal(
    folderNames(MAIN, `/x/${longest}`).test,
    `foundation_${longest}_test`,
  );
  refuses(
    () => folderNames(MAIN, `/x/${longest}b`),
    /foundation_a+b_test is 64 bytes, longer than Postgres's 63; give the folder a shorter name/,
  );
  refuses(
    () => folderNames(MAIN, "/x/test"),
    /^foundation_test, the folder's dev database, is the main folder's test database/,
  );
  refuses(
    () => folderNames({ ...MAIN, test: "tests_foundation" }, "/x/waf-fix"),
    /the main folder's test database, tests_foundation, does not start with its dev database's name, foundation/,
  );
  refuses(
    () =>
      folderNames(
        { dev: "Foundation", test: "Foundation_test", e2e: "Foundation_e2e" },
        "/x/waf-fix",
      ),
    /^Foundation_waf_fix, the dev database's name, would have a character outside a-z, 0-9 and _/,
  );
});

test("an address keeps its user, encoded password, host, port and query with another database", () => {
  const url =
    "postgres://ci%40corp:p%40ss%2Fw%3Ard%25@db.internal:6543/foundation_test?sslmode=require";
  assert.equal(databaseOf(url), "foundation_test");
  assert.equal(
    withDatabase(url, "foundation_waf_fix_test"),
    "postgres://ci%40corp:p%40ss%2Fw%3Ard%25@db.internal:6543/foundation_waf_fix_test?sslmode=require",
  );
  for (const wrong of [
    undefined,
    "foundation",
    "mysql://app@localhost/foundation",
    "postgresql://app@localhost:5432",
    "postgresql://app@localhost:5432/",
  ]) {
    assert.equal(databaseOf(wrong), null, String(wrong));
  }
});

test("the .env: the three lines set, a missing one added, every other line as it was", () => {
  const text = [
    "# DATABASE_URL=postgresql://kept@localhost/commented",
    "NODE_ENV=development",
    "export DATABASE_URL=postgresql://app@localhost:5432/foundation",
    "DATABASE_URL_TEST = 'postgresql://app@localhost:5432/foundation_waf_fix_test'",
    "DATABASE_URL_TESTS=postgresql://app@localhost:5432/kept",
    'MAIL_FROM="Panivo <no-reply@localhost>"',
  ].join("\n");
  const values = {
    DATABASE_URL: "postgresql://app@localhost:5432/foundation_waf_fix",
    DATABASE_URL_TEST:
      "postgresql://app@localhost:5432/foundation_waf_fix_test",
    DATABASE_URL_E2E: "postgresql://app@localhost:5432/foundation_waf_fix_e2e",
  };
  const result = rewriteEnv(text, values, SYSTEM.parseEnv);

  assert.equal(
    result.text,
    [
      "# DATABASE_URL=postgresql://kept@localhost/commented",
      "NODE_ENV=development",
      "DATABASE_URL=postgresql://app@localhost:5432/foundation_waf_fix",
      // Already the value wanted, in its own quotes: left as it is.
      "DATABASE_URL_TEST = 'postgresql://app@localhost:5432/foundation_waf_fix_test'",
      "DATABASE_URL_TESTS=postgresql://app@localhost:5432/kept",
      'MAIL_FROM="Panivo <no-reply@localhost>"',
      "DATABASE_URL_E2E=postgresql://app@localhost:5432/foundation_waf_fix_e2e",
      "",
    ].join("\n"),
  );
  assert.deepEqual(result.set, ["DATABASE_URL"]);
  assert.deepEqual(result.added, ["DATABASE_URL_E2E"]);

  const again = rewriteEnv(result.text, values, SYSTEM.parseEnv);
  assert.equal(again.text, result.text);
  assert.deepEqual([again.set, again.added], [[], []]);
});

test("a folder with no .env gets the main folder's, its three databases made, migrated by its own code and the dev one seeded", async (t) => {
  const { main, second } = folders(t);
  const server = postgres();
  const sys = system(main, server);
  await give("../waf-fix", sys);

  assert.equal(readFileSync(path.join(second, ".env"), "utf8"), WAF_FIX_ENV);
  assert.equal(readFileSync(path.join(main, ".env"), "utf8"), MAIN_ENV);
  assert.deepEqual(Object.fromEntries(server.databases), {
    ...Object.fromEntries(Object.values(MAIN).map((name) => [name, 0])),
    foundation_waf_fix: MIGRATIONS,
    foundation_waf_fix_test: MIGRATIONS,
    foundation_waf_fix_e2e: MIGRATIONS,
  });
  assert.deepEqual(
    sys.ran.map(({ dir, script }) => [dir, script]),
    [
      [path.join(second, "server"), "run migrate:all"],
      [path.join(second, "server"), "run seed"],
    ],
  );
  // The shell's own addresses never reach npm, where dotenv would keep them.
  for (const { env } of sys.ran) {
    assert.equal(env.DATABASE_URL, undefined);
    assert.equal(env.MIGRATE_TARGET, undefined);
    assert.equal(env.PATH, process.env.PATH);
  }
  assert.deepEqual(sys.said, [
    "",
    "../waf-fix's own databases:",
    "  ../waf-fix/.env          copied from the main folder's; DATABASE_URL, DATABASE_URL_TEST, DATABASE_URL_E2E set",
    "  foundation_waf_fix       made, 80 migrations applied, seeded",
    "  foundation_waf_fix_test  made, 80 migrations applied",
    "  foundation_waf_fix_e2e   made, 80 migrations applied",
    "Done: ../waf-fix has its own databases.",
  ]);
});

test("run again, it changes nothing already right, and says so", async (t) => {
  const { main, second } = folders(t);
  const server = postgres();
  await give("../waf-fix", system(main, server));
  const sql = server.sql.length;

  const sys = system(main, server);
  await give("../waf-fix", sys);

  assert.equal(readFileSync(path.join(second, ".env"), "utf8"), WAF_FIX_ENV);
  assert.equal(server.databases.size, 6);
  assert.deepEqual(
    server.sql.slice(sql).filter((each) => /^(create|drop)/.test(each)),
    [],
  );
  assert.deepEqual(
    sys.ran.map(({ script }) => script),
    ["run migrate:all"],
  );
  assert.deepEqual(sys.said, [
    "",
    "../waf-fix's own databases:",
    "  ../waf-fix/.env          already right",
    "  foundation_waf_fix       already there, up to date",
    "  foundation_waf_fix_test  already there, up to date",
    "  foundation_waf_fix_e2e   already there, up to date",
    "Nothing changed: ../waf-fix's databases were already right.",
  ]);
});

test("a folder whose .env names the main folder's databases: those three lines set, nothing else, and a dev database there not seeded", async (t) => {
  const { main, second } = folders(t);
  const own = MAIN_ENV.replace("NODE_ENV=development", "NODE_ENV=test");
  writeFileSync(path.join(second, ".env"), own);
  const server = postgres();
  server.databases.set("foundation_waf_fix", 79);
  const sys = system(main, server);
  await give("../waf-fix", sys);

  assert.equal(
    readFileSync(path.join(second, ".env"), "utf8"),
    WAF_FIX_ENV.replace("NODE_ENV=development", "NODE_ENV=test"),
  );
  assert.deepEqual(
    sys.ran.map(({ script }) => script),
    ["run migrate:all"],
  );
  assert.deepEqual(sys.said.slice(2, 6), [
    "  ../waf-fix/.env          DATABASE_URL, DATABASE_URL_TEST, DATABASE_URL_E2E set",
    "  foundation_waf_fix       already there, 1 migration applied",
    "  foundation_waf_fix_test  made, 80 migrations applied",
    "  foundation_waf_fix_e2e   made, 80 migrations applied",
  ]);
});

test("npm runs without the addresses or the migration's target a shell may hold", () => {
  assert.deepEqual(
    npmEnv({
      PATH: "/bin",
      DATABASE_URL: "a",
      DATABASE_URL_TEST: "b",
      DATABASE_URL_E2E: "c",
      MIGRATE_TARGET: "test",
      DATABASE_URL_OTHER: "d",
    }),
    { PATH: "/bin", DATABASE_URL_OTHER: "d" },
  );
});

test("migrate:all failing stops the run, after what was done, with the commands left to run", async (t) => {
  const { main } = folders(t);
  const server = postgres();
  const sys = system(main, server, { npm: () => 1 });
  await refusesAsync(
    () => give("../waf-fix", sys),
    /^npm run migrate:all failed in \.\.\/waf-fix\/server, above\. Once it is put right: \(cd \.\.\/waf-fix\/server && npm run migrate:all && npm run seed\)$/,
  );
  assert.deepEqual(sys.said.slice(3), [
    "  foundation_waf_fix       made",
    "  foundation_waf_fix_test  made",
    "  foundation_waf_fix_e2e   made",
  ]);
});

/** A refused run: nothing written, connected to or run. */
async function refusedRun(run, message, { main, second }) {
  const sys = system(main, {
    connect: async () => assert.fail("connected to Postgres"),
  });
  sys.npm = () => assert.fail("ran npm");
  await refusesAsync(() => run(sys), message);
  if (second) {
    assert.equal(existsSync(path.join(second, ".env")), false);
  }
  assert.deepEqual(sys.said, []);
}

test("run from a second working folder, it says to run it from the main one", async (t) => {
  const { main, second } = folders(t);
  refuses(
    () => mainFolder(second),
    new RegExp(
      `^${second} is a second working folder; run this from the main working folder: cd ${main} && node scripts/folder-databases.mjs`,
    ),
  );
  await refusedRun(
    (sys) => give(".", { ...sys, root: second, cwd: second }),
    /is a second working folder/,
    { main, second },
  );
});

test("the main folder, or a folder in it, is refused: its databases keep their names", async (t) => {
  const { main, second } = folders(t);
  for (const given of [".", "server"]) {
    await refusedRun(
      (sys) => give(given, sys),
      /is in the main working folder, whose databases keep their names; give a second one, such as \.\.\/waf-fix$/,
      { main, second },
    );
  }
  await refusedRun((sys) => drop(".", sys), /is in the main working folder/, {
    main,
  });
});

test("a folder missing, of no repository, of another, or inside a working folder is refused", async (t) => {
  const { parent, main, second } = folders(t);
  const plain = path.join(parent, "plain");
  mkdirSync(plain);
  const other = path.join(parent, "other");
  mkdirSync(other);
  git(other, "init", "--quiet");
  for (const [given, message] of [
    ["../missing", /^no folder at .*\/missing$/],
    ["../plain", /plain is not a working folder of this repository$/],
    ["../other", /other is not a working folder of this repository$/],
    ["../waf-fix/server", /is inside a working folder; give it, .*waf-fix$/],
  ]) {
    await refusedRun((sys) => give(given, sys), message, { main, second });
  }
  assert.equal(secondFolder(main, "../waf-fix", main), second);
});

test("no .env in the main folder is refused", async (t) => {
  const { main, second } = folders(t, { env: null });
  await refusedRun(
    (sys) => give("../waf-fix", sys),
    /^no \.env in the main working folder, .*main: copy \.env\.example to \.env there and fill it in$/,
    { main, second },
  );
});

test("the folder's server/node_modules missing is refused, with the npm ci that installs it", async (t) => {
  const { main, second } = folders(t);
  rmSync(path.join(second, "server/node_modules"), { recursive: true });
  await refusedRun(
    (sys) => give("../waf-fix", sys),
    /^\.\.\/waf-fix\/server\/node_modules is missing, and the folder's own code migrates its databases\. First:\n {2}\(cd \.\.\/waf-fix\/server && npm ci\)$/,
    { main, second },
  );
});

test("a folder's .env that is the main folder's, linked, is refused and the main one left", async (t) => {
  const { main, second } = folders(t);
  symlinkSync(path.join(main, ".env"), path.join(second, ".env"));
  const sys = system(main, {
    connect: async () => assert.fail("connected to Postgres"),
  });
  await refusesAsync(
    () => give("../waf-fix", sys),
    /^\.\.\/waf-fix\/\.env is the main folder's own \.env, linked, so writing it would rename the main folder's databases\. Remove it, rm \.\.\/waf-fix\/\.env, and run this again/,
  );
  assert.equal(readFileSync(path.join(main, ".env"), "utf8"), MAIN_ENV);
});

test("--drop drops the three the folder's .env names, and leaves the .env", async (t) => {
  const { main, second } = folders(t);
  const server = postgres();
  await give("../waf-fix", system(main, server));
  server.databases.delete("foundation_waf_fix_e2e");

  const sys = system(main, server);
  assert.equal(await drop("../waf-fix", sys), true);

  assert.deepEqual([...server.databases.keys()], Object.values(MAIN));
  assert.equal(readFileSync(path.join(second, ".env"), "utf8"), WAF_FIX_ENV);
  assert.deepEqual(sys.ran, []);
  assert.deepEqual(sys.said, [
    "../waf-fix's databases:",
    "  foundation_waf_fix       dropped",
    "  foundation_waf_fix_test  dropped",
    "  foundation_waf_fix_e2e   not there; nothing dropped",
    "  ../waf-fix/.env          left as it is, for the folder is to go",
  ]);
});

test("--drop refuses each name that is the main folder's, and drops the folder's own", async (t) => {
  const { main, second } = folders(t);
  // As a second folder's .env is, copied from the main one's, but its dev line.
  writeFileSync(
    path.join(second, ".env"),
    MAIN_ENV.replace("5432/foundation\n", "5432/foundation_waf_fix\n"),
  );
  const server = postgres({ ...MAIN, own: "foundation_waf_fix" });
  const sys = system(main, server);
  assert.equal(await drop("../waf-fix", sys), false);

  assert.deepEqual([...server.databases.keys()], Object.values(MAIN));
  assert.deepEqual(
    server.sql.filter((each) => each.startsWith("drop")),
    ['drop database "foundation_waf_fix" with (force)'],
  );
  assert.deepEqual(sys.said.slice(1, 4), [
    "  foundation_waf_fix  dropped",
    "  foundation_test     the main folder's; refused, left as it is",
    "  foundation_e2e      the main folder's; refused, left as it is",
  ]);
});

test("--drop refuses a folder with no .env", async (t) => {
  const { main, second } = folders(t);
  await refusedRun(
    (sys) => drop("../waf-fix", sys),
    /^no \.env in \.\.\/waf-fix, so nothing names its databases; nothing is dropped$/,
    { main, second },
  );
});
