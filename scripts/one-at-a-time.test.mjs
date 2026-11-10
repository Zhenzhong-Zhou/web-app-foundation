/**
 * Tests for one-at-a-time.mjs, on Node's own runner: scripts/ sits outside
 * both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * The lock's tests run its function with stand-ins for what it uses: a
 * database answering the calls it makes from a list of answers, lsof
 * answering from the listeners the test gives, and a clock whose sleep
 * moves time on, so an hour's wait takes no time. The folder checks, and
 * the check of a folder that shares this one's databases, use real git
 * and real .env files, in a temporary repository with worktrees. The rest
 * run the script itself with CI set, where it needs no database: the exit
 * code, the output and Ctrl-C passed on.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { folder as tempFolder, git, repository } from "./git-fixture.mjs";
import {
  LOCK_KEY,
  SERVERS,
  WAIT_AT_MOST_MS,
  cwdOf,
  describe,
  folderOf,
  hhmm,
  listeners,
  nameFor,
  oneAtATime,
  othersServers,
  parse,
  postgresAddress,
  sharedDatabases,
} from "./one-at-a-time.mjs";

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "one-at-a-time.mjs",
);

/** 19:16 on 8 November 2026, on this machine's clock. */
const START = new Date(2026, 10, 8, 19, 16).getTime();

/**
 * A database whose lock is refused `refusals` times, then granted, held
 * meanwhile by the connection named `holder`. It notes each call.
 */
function database({ refusals = 0, holder = null } = {}) {
  const db = {
    calls: [],
    names: [],
    ended: false,
    async query(sql, params) {
      db.calls.push(sql.trim().split(/\s+/).slice(0, 2).join(" "));
      if (sql.includes("pg_try_advisory_lock")) {
        assert.deepEqual(params, [LOCK_KEY]);
        return { rows: [{ locked: refusals-- <= 0 }] };
      }
      if (sql.includes("pg_stat_activity")) {
        assert.deepEqual(params, [LOCK_KEY]);
        return { rows: holder ? [holder] : [] };
      }
      if (sql.includes("set_config('application_name'")) {
        db.names.push(params[0]);
        return { rows: [{}] };
      }
      throw new Error(`Not a call the lock makes: ${sql}`);
    },
    async end() {
      db.ended = true;
    },
  };
  return db;
}

/** lsof answering for the listeners given, each { port, pid, command, cwd }. */
const lsofFor = (servers) => (args) => {
  const port = args.find((arg) => arg.startsWith("-iTCP:"));
  if (port) {
    return servers
      .filter((s) => `-iTCP:${s.port}` === port)
      .map((s) => `p${s.pid}\nc${s.command}\nf23\n`)
      .join("");
  }
  const pid = Number(args[args.indexOf("-p") + 1]);
  const server = servers.find((s) => s.pid === pid);
  return server ? `p${pid}\nfcwd\nn${server.cwd}\n` : "";
};

/**
 * The system the lock runs in, every part a stand-in: the clock starts at
 * START and moves on as it sleeps; what it says and runs is noted.
 */
function system(db, overrides = {}) {
  let clock = START;
  const said = [];
  const ran = [];
  return {
    said,
    ran,
    root: "/Users/bob/web-app-foundation",
    env: {},
    shared: () => [],
    connect: async () => db,
    lsof: lsofFor([]),
    folderOf: (dir) => dir.replace(/\/(server|client)$/, ""),
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    say: (line) => said.push(line),
    run: async (command, args, env) => {
      ran.push({ command, args, held: env.ONE_AT_A_TIME_HELD, at: clock });
      return 0;
    },
    ...overrides,
  };
}

const SLEEP = { label: "server-e2e", command: "sleep", args: ["20"] };

test("the arguments: a label, --, then the command and its own arguments as they stand", () => {
  assert.deepEqual(
    parse([
      "browser-suite",
      "--",
      "dotenv",
      "-e",
      "../.env",
      "--",
      "playwright",
      "test",
    ]),
    {
      label: "browser-suite",
      command: "dotenv",
      args: ["-e", "../.env", "--", "playwright", "test"],
    },
  );
  for (const wrong of [
    [],
    ["server-e2e"],
    ["server-e2e", "--"],
    ["server-e2e", "sleep", "1"],
    ["--", "sleep", "1"],
    ["Server E2E", "--", "sleep", "1"],
  ]) {
    assert.equal(parse(wrong), null, wrong.join(" "));
  }
});

test("the lock is in the postgres database on the test database's server, the same whatever a folder's test database is called", () => {
  const main = postgresAddress(
    "postgresql://app:change_me_locally@localhost:5432/foundation_test",
  );
  assert.equal(
    main,
    "postgresql://app:change_me_locally@localhost:5432/postgres",
  );
  assert.equal(
    postgresAddress(
      "postgresql://app:change_me_locally@localhost:5432/foundation_waf_fix_test",
    ),
    main,
  );
});

test("the lock's address keeps the user, an encoded password, the host, the port and the query", () => {
  assert.equal(
    postgresAddress(
      "postgres://ci%40corp:p%40ss%2Fw%3Ard%25@db.internal:6543/foundation_test?sslmode=require&application_name=ci",
    ),
    "postgres://ci%40corp:p%40ss%2Fw%3Ard%25@db.internal:6543/postgres?sslmode=require&application_name=ci",
  );
  for (const wrong of [
    undefined,
    "foundation_test",
    "localhost:5432/foundation_test",
    "postgresql:foundation_test",
    "mysql://app@localhost/foundation_test",
  ]) {
    assert.equal(postgresAddress(wrong), null, String(wrong));
  }
});

test("a free lock is taken, its connection named for the label, the folder and the time, the command run and the connection closed", async () => {
  const db = database();
  const sys = system(db);
  const status = await oneAtATime(SLEEP, sys);

  assert.equal(status, 0);
  assert.deepEqual(db.names, ["server-e2e in web-app-foundation since 19:16"]);
  assert.deepEqual(sys.ran, [
    {
      command: "sleep",
      args: ["20"],
      held: "server-e2e in web-app-foundation",
      at: START,
    },
  ]);
  assert.deepEqual(sys.said, []);
  assert.equal(db.ended, true);
});

test("a lock refused waits, saying for whom at once and each minute, then runs once it is granted", async () => {
  // 30 refusals at a try every 5 seconds: two and a half minutes.
  const db = database({
    refusals: 30,
    holder: { pid: 801, name: "browser-suite in waf-fix since 19:10" },
  });
  const sys = system(db);
  const status = await oneAtATime(SLEEP, sys);

  assert.equal(status, 0);
  assert.deepEqual(sys.said, [
    "Waiting for browser-suite in waf-fix, since 19:10.",
    "Waiting for browser-suite in waf-fix, since 19:10.",
    "Waiting for browser-suite in waf-fix, since 19:10.",
    "The lock is free: server-e2e runs now.",
  ]);
  assert.equal(sys.ran.length, 1);
  assert.equal(sys.ran[0].at, START + 150_000);
  assert.deepEqual(db.names, [
    nameFor("server-e2e", "web-app-foundation", START + 150_000),
  ]);
  assert.equal(db.ended, true);
});

test("the holder's name reads back as its label, folder and time; another connection's by its name and pid", () => {
  const name = nameFor("flake-hunt", "waf-fix", START);
  assert.equal(name, "flake-hunt in waf-fix since 19:16");
  assert.equal(name.length <= 63, true, "Postgres keeps 63 bytes of a name");
  assert.equal(
    describe({ pid: 7, name }),
    "flake-hunt in waf-fix, since 19:16",
  );
  assert.equal(
    describe({ pid: 7, name: "psql" }),
    'a connection named "psql", pid 7',
  );
  assert.equal(describe(null), "another run, which has just ended");
  assert.equal(hhmm(START + 59_000), "19:16");
});

test("after 60 minutes refused it stops, exit 1, naming the holder, the command never run", async () => {
  const db = database({
    refusals: Infinity,
    holder: { pid: 801, name: "linux-browsers in waf-fix since 19:00" },
  });
  const sys = system(db);
  const status = await oneAtATime(SLEEP, sys);

  assert.equal(status, 1);
  assert.equal(sys.ran.length, 0);
  assert.equal(sys.said.length, 61, sys.said.join("\n"));
  assert.equal(
    sys.said.at(-1),
    "Stopped after 60 minutes waiting for linux-browsers in waf-fix, since 19:00. " +
      "Let it finish, or stop it, then run again.",
  );
  assert.equal(
    db.calls.filter((call) => call.startsWith("select pg_try")).length,
    WAIT_AT_MOST_MS / 5_000 + 1,
  );
  assert.equal(db.ended, true);
});

for (const [why, env] of [
  ["in CI", { CI: "true" }],
  [
    "when nested",
    { ONE_AT_A_TIME_HELD: "linux-browsers in web-app-foundation" },
  ],
]) {
  test(`${why}, the command runs alone: no database, no port check, the lock's variable set for it`, async () => {
    const sys = system(null, {
      env,
      shared: () => assert.fail("read the other folders' .env"),
      connect: async () => assert.fail("connected"),
      lsof: () => assert.fail("asked lsof"),
    });
    const status = await oneAtATime({ ...SLEEP, label: "browser-suite" }, sys);

    assert.equal(status, 0);
    assert.equal(sys.ran.length, 1);
    assert.equal(sys.ran[0].held, "browser-suite in web-app-foundation");
  });
}

test("the command's exit code is returned, and the connection closed", async () => {
  const db = database();
  const status = await oneAtATime(SLEEP, system(db, { run: async () => 3 }));

  assert.equal(status, 3);
  assert.equal(db.ended, true);
});

test("a browser run stops at another folder's server on its ports, naming the folder and the process", async () => {
  const db = database();
  const sys = system(db, {
    lsof: lsofFor([
      {
        port: 3100,
        pid: 4242,
        command: "node",
        cwd: "/Users/bob/waf-fix/server",
      },
      {
        port: 5273,
        pid: 4343,
        command: "node",
        cwd: "/Users/bob/web-app-foundation/client",
      },
    ]),
  });
  const status = await oneAtATime({ ...SLEEP, label: "browser-suite" }, sys);

  assert.equal(status, 1);
  assert.equal(sys.ran.length, 0);
  assert.deepEqual(sys.said, [
    "A server already listens on port 3100 from another working folder, /Users/bob/waf-fix: node, pid 4242.",
    "Playwright would reuse it and test that folder's code. Stop it there, then run again.",
  ]);
  assert.equal(db.ended, true);
});

test("a browser run reuses this folder's servers; a run that is not a browser's does not look", async () => {
  const servers = lsofFor([
    {
      port: 3100,
      pid: 4343,
      command: "node",
      cwd: "/Users/bob/web-app-foundation/server",
    },
    {
      port: 5373,
      pid: 4242,
      command: "node",
      cwd: "/Users/bob/waf-fix/client",
    },
  ]);
  const browsers = system(database(), { lsof: servers });
  assert.equal(
    await oneAtATime({ ...SLEEP, label: "browser-suite" }, browsers),
    0,
  );
  assert.equal(browsers.ran.length, 1);

  const e2e = system(database(), { lsof: () => assert.fail("asked lsof") });
  assert.equal(await oneAtATime(SLEEP, e2e), 0);

  // The screenshots' own ports, 3200 and 5373.
  const pictures = system(database(), { lsof: servers });
  assert.equal(
    await oneAtATime({ ...SLEEP, label: "screenshots" }, pictures),
    1,
  );
  assert.match(
    pictures.said[0],
    /port 5373 from another working folder, \/Users\/bob\/waf-fix: node, pid 4242\./,
  );
  assert.deepEqual(SERVERS.screenshots, [3200, 5373]);
});

test("lsof's fields read: each listener's pid and command, and a process's working directory", () => {
  const lsof = (args) =>
    args.includes("-d")
      ? "p4242\nfcwd\nn/Users/bob/waf-fix/server\n"
      : "p4242\ncnode\nf23\nf24\np4343\ncvite\nf30\n";
  assert.deepEqual(listeners(3100, lsof), [
    { pid: 4242, command: "node" },
    { pid: 4343, command: "vite" },
  ]);
  assert.deepEqual(
    listeners(3100, () => ""),
    [],
  );
  assert.equal(cwdOf(4242, lsof), "/Users/bob/waf-fix/server");
  assert.equal(
    cwdOf(4242, () => ""),
    null,
  );
});

test("a server's folder is its git top level, so a worktree is another folder, even one inside this one", (t) => {
  const main = realpathSync(repository(t, "one-at-a-time"));
  git(main, "commit", "--quiet", "--allow-empty", "-m", "Start");
  const beside = path.join(
    realpathSync(tempFolder(t, "one-at-a-time-beside")),
    "waf-fix",
  );
  git(main, "worktree", "add", "--quiet", "--detach", beside);
  const inside = path.join(main, ".claude/worktrees/step");
  git(main, "worktree", "add", "--quiet", "--detach", inside);
  for (const root of [main, beside, inside]) {
    mkdirSync(path.join(root, "server"), { recursive: true });
  }

  assert.equal(folderOf(path.join(main, "server")), main);
  assert.equal(folderOf(path.join(beside, "server")), beside);
  assert.equal(folderOf(path.join(inside, "server")), inside);
  const outside = realpathSync(tempFolder(t, "one-at-a-time-none"));
  assert.equal(folderOf(outside), outside);

  const servers = (cwd) =>
    othersServers([3100], main, {
      lsof: lsofFor([{ port: 3100, pid: 9, command: "node", cwd }]),
      folderOf,
    });
  assert.deepEqual(servers(path.join(main, "server")), []);
  assert.deepEqual(servers(path.join(inside, "server")), [
    { port: 3100, pid: 9, command: "node", folder: inside },
  ]);
  assert.deepEqual(servers(path.join(beside, "server")), [
    { port: 3100, pid: 9, command: "node", folder: beside },
  ]);
});

test("a folder that shares another's database is refused before the lock is taken, exit 1, saying what to run", async () => {
  const lines = [
    "../waf-fix names the same test database as this folder, foundation_test.",
    "Give it its own, from the main working folder:",
    "  node scripts/folder-databases.mjs ../waf-fix",
  ];
  const sys = system(null, {
    shared: () => lines,
    connect: async () => assert.fail("connected"),
  });
  const status = await oneAtATime(SLEEP, sys);

  assert.equal(status, 1);
  assert.deepEqual(sys.said, lines);
  assert.equal(sys.ran.length, 0);
});

/** The main folder's three addresses, as its .env names them. */
const MAIN_ENV = [
  "DATABASE_URL=postgresql://app:pw@localhost:5432/foundation",
  "DATABASE_URL_TEST=postgresql://app:pw@localhost:5432/foundation_test",
  "DATABASE_URL_E2E=postgresql://app:pw@localhost:5432/foundation_e2e",
  "",
].join("\n");

/** ../waf-fix's own, as scripts/folder-databases.mjs writes them. */
const WAF_FIX_ENV = MAIN_ENV.replaceAll("foundation", "foundation_waf_fix");

/**
 * A main working folder and, beside it, ../waf-fix and ../spare, with
 * the .env given for each; ../spare has none unless given.
 */
function sharing(t, envs) {
  const parent = realpathSync(tempFolder(t, "one-at-a-time-sharing"));
  const main = path.join(parent, "main");
  mkdirSync(main);
  git(main, "init", "--quiet");
  git(main, "commit", "--quiet", "--allow-empty", "-m", "Start");
  for (const name of ["waf-fix", "spare"]) {
    git(
      main,
      "worktree",
      "add",
      "--quiet",
      "--detach",
      path.join(parent, name),
    );
  }
  const at = {
    main,
    wafFix: path.join(parent, "waf-fix"),
    spare: path.join(parent, "spare"),
  };
  for (const [name, env] of Object.entries(envs)) {
    writeFileSync(path.join(at[name], ".env"), env);
  }
  return at;
}

test("another folder naming this folder's test database is named, with the command that gives it its own", (t) => {
  const { main } = sharing(t, {
    main: MAIN_ENV,
    wafFix: WAF_FIX_ENV.replace("foundation_waf_fix_test", "foundation_test"),
  });

  assert.deepEqual(sharedDatabases(main, {}), [
    "../waf-fix names the same test database as this folder, foundation_test.",
    "Give it its own, from the main working folder:",
    "  node scripts/folder-databases.mjs ../waf-fix",
  ]);
});

test("another folder naming this folder's e2e database is named too, whatever its password and query", (t) => {
  const { main } = sharing(t, {
    main: MAIN_ENV,
    wafFix: WAF_FIX_ENV.replace(
      "pw@localhost:5432/foundation_waf_fix_e2e",
      "other@LOCALHOST:5432/foundation_e2e?sslmode=disable",
    ),
  });

  assert.deepEqual(sharedDatabases(main, {}), [
    "../waf-fix names the same e2e database as this folder, foundation_e2e.",
    "Give it its own, from the main working folder:",
    "  node scripts/folder-databases.mjs ../waf-fix",
  ]);
});

test("from either side, the command names the second folder, since the main one keeps its names", (t) => {
  const { main, wafFix } = sharing(t, { main: MAIN_ENV, wafFix: MAIN_ENV });
  const give = [
    "Give it its own, from the main working folder:",
    "  node scripts/folder-databases.mjs ../waf-fix",
  ];

  assert.deepEqual(sharedDatabases(main, {}), [
    "../waf-fix names the same test database as this folder, foundation_test.",
    "../waf-fix names the same e2e database as this folder, foundation_e2e.",
    ...give,
  ]);
  assert.deepEqual(sharedDatabases(wafFix, {}), [
    "../main names the same test database as this folder, foundation_test.",
    "../main names the same e2e database as this folder, foundation_e2e.",
    "Give this folder its own, from the main working folder:",
    give[1],
  ]);
});

test("an address in the environment counts before the folder's .env, as dotenv leaves it", (t) => {
  const { wafFix } = sharing(t, { main: MAIN_ENV, wafFix: WAF_FIX_ENV });

  assert.deepEqual(
    sharedDatabases(wafFix, {
      DATABASE_URL_TEST: "postgresql://app:pw@localhost:5432/foundation_test",
    }),
    [
      "../main names the same test database as this folder, foundation_test.",
      "Give this folder its own, from the main working folder:",
      "  node scripts/folder-databases.mjs ../waf-fix",
    ],
  );
});

test("none shared: each folder's own names, the same name on another server, a folder with no .env", (t) => {
  const { main, wafFix, spare } = sharing(t, {
    main: MAIN_ENV,
    wafFix: WAF_FIX_ENV.replace(
      "localhost:5432/foundation_waf_fix_test",
      "localhost:5433/foundation_test",
    ),
  });

  assert.deepEqual(sharedDatabases(main, {}), []);
  assert.deepEqual(sharedDatabases(wafFix, {}), []);
  // ../spare has no .env, so names nothing, and is passed over.
  assert.deepEqual(sharedDatabases(spare, {}), []);
});

/** The script itself, with CI set: it runs the command alone. */
const script = (args, env = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, CI: "true", ...env },
    timeout: 30_000,
  });

test("the script returns the command's exit code, its output passed through, the lock's variable set", () => {
  const run = script([
    "server-e2e",
    "--",
    process.execPath,
    "-e",
    "console.log(process.env.ONE_AT_A_TIME_HELD); console.error('to stderr'); process.exit(5)",
  ]);
  assert.equal(run.status, 5, run.stderr);
  assert.match(run.stdout, /^server-e2e in \S+$/m);
  assert.equal(run.stderr, "to stderr\n");
});

test("the script refuses a call without a label and --, exit 2", () => {
  const run = script(["sleep", "1"]);
  assert.equal(run.status, 2);
  assert.match(
    run.stderr,
    /^Usage: node scripts\/one-at-a-time\.mjs <label> -- <command>/,
  );
});

test("Ctrl-C is passed on to the command, and the exit code it ends with returned", async () => {
  const child = spawn(
    process.execPath,
    [
      SCRIPT,
      "server-e2e",
      "--",
      process.execPath,
      "-e",
      "process.on('SIGINT', () => { console.log('stopped'); process.exit(130); }); console.log('ready'); setInterval(() => {}, 1000);",
    ],
    { env: { ...process.env, CI: "true" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  let out = "";
  child.stdout.on("data", (chunk) => {
    out += chunk;
    if (out.includes("ready") && !out.includes("stopped")) child.kill("SIGINT");
  });
  const status = await new Promise((resolve) => child.on("exit", resolve));

  assert.equal(out, "ready\nstopped\n");
  assert.equal(status, 130);
});
