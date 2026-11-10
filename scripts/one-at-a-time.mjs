#!/usr/bin/env node
/**
 * One run at a time of what the working folders share (ADR-089's
 * amendment, "one lock for the runs both folders share"): the test and
 * e2e databases, the browser suite's servers on 3100 and 5273, the Linux
 * browsers' container, and a quiet machine for the timed runs. The
 * packages' scripts, scripts/verify.sh and server/scripts/e2e-flake-hunt.sh
 * run each of those through it.
 *
 *     node scripts/one-at-a-time.mjs <label> -- <command> [args…]
 *
 * It takes a session-level advisory lock on a connection of its own, runs
 * the command under it, and closes the connection when the command ends,
 * which frees the lock. A run that dies frees it too, so nothing stale is
 * left. The key is fixed, and not the server's E2E_LOCK_KEY, which the e2e
 * suite's global setup takes behind this one (server/test/global-setup.ts).
 *
 * The lock is in the postgres database, which every Postgres has, on the
 * server DATABASE_URL_TEST names, from the root .env (ADR-089's amendment
 * for #529). Advisory locks meet only inside one database, and each
 * working folder has its own test database, so in a database of their own
 * two folders' runs would never wait for each other.
 *
 * Before it takes the lock, it refuses a folder whose test or e2e database
 * another working folder's .env names too (git worktree list), exit 1,
 * naming that folder, the database and the command that gives the second
 * folder its own, scripts/folder-databases.mjs, since the main folder keeps
 * its names: the lock keeps two runs apart in time, not two folders'
 * tables. The fix runner makes the same check before a fix starts
 * (scripts/fix-issue/lib.mjs).
 *
 * When another folder holds it, it tries again every 5 seconds and says,
 * at once and then each minute, what it waits for: the holder's label,
 * folder and time, read from the name of the holder's connection in
 * pg_stat_activity. After 60 minutes it stops, exit 1, naming the holder.
 *
 * The command runs with its output as it comes and ONE_AT_A_TIME_HELD set,
 * so a call of this script within it passes straight through; Ctrl-C is
 * passed on to it, as dotenv-cli passes it on, and its exit code is
 * returned. With CI set, where each job runs alone, it runs the command
 * alone.
 *
 * For a browser run, a label in SERVERS below, before the command: a server
 * already listening on its ports from another working folder (lsof) stops
 * the run, naming the folder and the process, since Playwright would reuse
 * it and test that folder's code. One from this folder is reused, as
 * Playwright does. That check comes once the lock is taken, when another
 * folder's own run has stopped the servers it started.
 *
 * pg and dotenv come from server/node_modules, as i18n-review.mjs reaches
 * the client's packages, so `npm ci` in server/ first; the addresses, the
 * .env and the connection are databases.mjs's, which the other database
 * scripts share. Its tests, in
 * one-at-a-time.test.mjs, stand in for the database and lsof:
 * `node --test scripts/`.
 */
import { execFileSync, spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { constants } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  KEYS,
  Stop,
  addresses,
  connect as connectTo,
  databaseAt,
  postgresAddress,
  readEnv,
  worktrees,
} from "./databases.mjs";

export { Stop, postgresAddress };

/** This working folder: the one this copy of the script is in. */
const ROOT = realpathSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
);

/** Fixed and arbitrary, as the server's E2E_LOCK_KEY (4_802_048) is, and not it. */
export const LOCK_KEY = 4_802_089;

export const TRY_EVERY_MS = 5_000;
export const SAY_EVERY_MS = 60_000;
export const WAIT_AT_MOST_MS = 60 * 60_000;

/**
 * The browser runs, by label, with the ports whose servers their
 * Playwright config reuses outside CI: client/playwright.config.ts's, and
 * the screenshots' own, in client/playwright.screenshots.config.ts.
 */
export const SERVERS = {
  "browser-suite": [3100, 5273],
  "browser-ui": [3100, 5273],
  "linux-browsers": [3100, 5273],
  screenshots: [3200, 5373],
};

const USAGE =
  "Usage: node scripts/one-at-a-time.mjs <label> -- <command> [args…]\n" +
  "The label is lowercase letters, digits and hyphens, such as server-e2e.";

/** The label and the command, or null when they are not as USAGE says. */
export function parse(argv) {
  const [label, dashes, command, ...args] = argv;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(label ?? "") || dashes !== "--") {
    return null;
  }
  return command ? { label, command, args } : null;
}

/** The time as HH:MM, on this machine's clock. */
export const hhmm = (ms) => new Date(ms).toTimeString().slice(0, 5);

/** The name of the holder's connection, which a waiting run reads. */
export const nameFor = (label, folder, ms) =>
  `${label} in ${folder} since ${hhmm(ms)}`;

/**
 * The holder, as a waiting run says it: "<label> in <folder>, since
 * <HH:MM>" from its connection's name, or what is known of a connection
 * this script did not name.
 */
export function describe(holder) {
  if (!holder) return "another run, which has just ended";
  const match = /^([a-z0-9-]+) in (.+) since (\d\d:\d\d)$/.exec(holder.name);
  return match
    ? `${match[1]} in ${match[2]}, since ${match[3]}`
    : `a connection named "${holder.name}", pid ${holder.pid}`;
}

/** This folder's databases a run empties, by the line that names each. */
const SHARED = { test: KEYS.test, e2e: KEYS.e2e };

/**
 * What refuses a run in `root` when another working folder's .env names
 * its test or e2e database, on the same server: for each such folder, a
 * line for each database, then the command that gives the second folder
 * its own, run from the main working folder, whose names stay. None when
 * no folder shares. Its address is the environment's before its .env's,
 * as dotenv leaves a variable already set; a folder without a .env names
 * nothing. `own` is root's .env, when already read.
 */
export function sharedDatabases(root, env, own = readEnv(root, ROOT)) {
  const folders = worktrees(root);
  const main = folders[0];
  if (!main) return [];
  const address = addresses(env, own);
  const mine = Object.entries(SHARED)
    .map(([which, key]) => ({ which, at: databaseAt(address(key)) }))
    .filter(({ at }) => at);
  const lines = [];
  for (const folder of folders) {
    if (folder === root) continue;
    const theirs = readEnv(folder, ROOT);
    if (!theirs) continue;
    const named = Object.values(SHARED)
      .map((key) => databaseAt(theirs[key]))
      .filter(Boolean);
    const shared = mine.filter(({ at }) =>
      named.some((one) => one.server === at.server && one.name === at.name),
    );
    if (!shared.length) continue;
    const there = path.relative(root, folder);
    for (const { which, at } of shared) {
      lines.push(
        `${there} names the same ${which} database as this folder, ${at.name}.`,
      );
    }
    const second = folder === main ? root : folder;
    lines.push(
      `Give ${second === root ? "this folder" : "it"} its own, from the main working folder:`,
      `  node scripts/folder-databases.mjs ${path.relative(main, second)}`,
    );
  }
  return lines;
}

/** The connection holding the lock in this database, or null. */
async function readHolder(db) {
  const { rows } = await db.query(
    `select a.pid, a.application_name as name
       from pg_locks l
       join pg_stat_activity a on a.pid = l.pid
      where l.locktype = 'advisory' and l.granted
        and l.database = (select oid from pg_database where datname = current_database())
        and l.classid = 0 and l.objid = $1 and l.objsubid = 1`,
    [LOCK_KEY],
  );
  return rows[0] ?? null;
}

/**
 * Takes the lock, waiting for another run's: true once taken, its
 * connection then named for the label, the folder and the time; false
 * after WAIT_AT_MOST_MS, having said who holds it.
 */
export async function take(db, { label, folder, now, sleep, say }) {
  const start = now();
  let saidAt = null;
  for (;;) {
    const { rows } = await db.query(
      "select pg_try_advisory_lock($1) as locked",
      [LOCK_KEY],
    );
    if (rows[0]?.locked) {
      await db.query("select set_config('application_name', $1, false)", [
        nameFor(label, folder, now()),
      ]);
      if (saidAt !== null) say(`The lock is free: ${label} runs now.`);
      return true;
    }
    const holder = describe(await readHolder(db));
    if (now() - start >= WAIT_AT_MOST_MS) {
      say(
        `Stopped after ${WAIT_AT_MOST_MS / 60_000} minutes waiting for ` +
          `${holder}. Let it finish, or stop it, then run again.`,
      );
      return false;
    }
    if (saidAt === null || now() - saidAt >= SAY_EVERY_MS) {
      say(`Waiting for ${holder}.`);
      saidAt = now();
    }
    await sleep(TRY_EVERY_MS);
  }
}

/** The processes listening on the port, from lsof's fields. */
export function listeners(port, lsof) {
  const fields = lsof(["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"]);
  const found = [];
  for (const line of fields.split("\n")) {
    if (line.startsWith("p")) found.push({ pid: Number(line.slice(1)) });
    else if (line.startsWith("c") && found.length) {
      found.at(-1).command = line.slice(1);
    }
  }
  return found;
}

/** The process's working directory, from lsof's fields, or null. */
export function cwdOf(pid, lsof) {
  const line = lsof(["-a", "-p", String(pid), "-d", "cwd", "-Fn"])
    .split("\n")
    .find((each) => each.startsWith("n"));
  return line ? line.slice(1) : null;
}

/** The working folder a directory is in, by git, or the directory itself. */
export function folderOf(dir) {
  try {
    const top = execFileSync(
      "git",
      ["-C", dir, "rev-parse", "--show-toplevel"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    return realpathSync(top);
  } catch {
    return dir;
  }
}

/** The servers on the ports that a working folder other than root runs. */
export function othersServers(ports, root, { lsof, folderOf: folder }) {
  const others = [];
  for (const port of ports) {
    for (const { pid, command } of listeners(port, lsof)) {
      const cwd = cwdOf(pid, lsof);
      const where = cwd === null ? null : folder(cwd);
      if (where !== root) others.push({ port, pid, command, folder: where });
    }
  }
  return others;
}

/** lsof, its fields as text; nothing found is its exit 1, and no text. */
function lsof(args) {
  try {
    return execFileSync("lsof", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (error) {
    if (error.status === 1) return error.stdout ?? "";
    throw error;
  }
}

/**
 * The command, its output as it comes, Ctrl-C and the other stops passed
 * on: its exit code, or 128 and the signal's number when one ended it, as
 * a shell gives.
 */
export function run(command, args, env, say) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
    const pass = (signal) => child.kill(signal);
    for (const signal of signals) process.on(signal, pass);
    let done = false;
    const end = (status) => {
      if (done) return;
      done = true;
      for (const signal of signals) process.off(signal, pass);
      resolve(status);
    };
    child.on("error", (error) => {
      say(`Could not run ${command}: ${error.message}`);
      end(127);
    });
    child.on("exit", (code, signal) =>
      end(code ?? 128 + (constants.signals[signal] ?? 0)),
    );
  });
}

/**
 * The connection the lock is held on, to the postgres database on the
 * server DATABASE_URL_TEST names. With no .env, the variable may still be
 * set, as the global setup reads it.
 */
async function connect(address, say) {
  const url = address(KEYS.test);
  if (!url) {
    throw new Stop(
      "DATABASE_URL_TEST is not set. Add it to the root .env (see .env.example).",
    );
  }
  const server = postgresAddress(url);
  if (!server) {
    throw new Stop(
      "DATABASE_URL_TEST is not a postgresql:// address. Correct it in the " +
        "root .env (see .env.example).",
    );
  }
  try {
    return await connectTo(ROOT, server, "one-at-a-time", (error) =>
      say(
        `The lock's connection to Postgres ended (${error.message}); ` +
          "the run goes on without it.",
      ),
    );
  } catch (error) {
    if (error instanceof Stop) throw error;
    throw new Stop(
      "Could not reach the postgres database on the server " +
        `DATABASE_URL_TEST names, where the lock is (${error.message}). ` +
        "Is it up? docker compose up -d",
    );
  }
}

/** This folder's .env, read once for the check and the lock; {} when it has none. */
let ownEnv;
const own = () => (ownEnv ??= readEnv(ROOT) ?? {});

/** What a run uses outside itself; the tests give their own. */
export const SYSTEM = {
  root: ROOT,
  env: process.env,
  shared: () => sharedDatabases(ROOT, process.env, own()),
  connect: () => connect(addresses(process.env, own()), SYSTEM.say),
  lsof,
  folderOf,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  say: (line) => process.stderr.write(`${line}\n`),
  run,
};

/** The command run under the lock, or alone where it passes through: its exit code. */
export async function oneAtATime({ label, command, args }, system) {
  const { env, root, say } = system;
  const folder = path.basename(root);
  const childEnv = { ...env, ONE_AT_A_TIME_HELD: `${label} in ${folder}` };
  if (env.CI || env.ONE_AT_A_TIME_HELD) {
    return system.run(command, args, childEnv, say);
  }

  let db;
  try {
    const shared = system.shared();
    if (shared.length) {
      for (const line of shared) say(line);
      return 1;
    }
    db = await system.connect();
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    say(error.message);
    return 1;
  }
  try {
    if (!(await take(db, { label, folder, ...system }))) return 1;
    const others = SERVERS[label]
      ? othersServers(SERVERS[label], root, system)
      : [];
    if (others.length) {
      for (const { port, pid, command: name, folder: where } of others) {
        say(
          `A server already listens on port ${port} from another working ` +
            `folder, ${where ?? "one lsof cannot read"}: ${name ?? "a process"}, pid ${pid}.`,
        );
      }
      say(
        "Playwright would reuse it and test that folder's code. Stop it " +
          "there, then run again.",
      );
      return 1;
    }
    return await system.run(command, args, childEnv, say);
  } finally {
    await db.end().catch(() => {});
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const parsed = parse(process.argv.slice(2));
  if (!parsed) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }
  process.exitCode = await oneAtATime(parsed, SYSTEM);
}
