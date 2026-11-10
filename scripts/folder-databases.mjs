#!/usr/bin/env node
/**
 * Each working folder's own databases (ADR-089's amendment for #529): a
 * second working folder gets its own dev, test and e2e databases, so its
 * migrations and tests never run on another folder's tables. Run from the
 * main working folder:
 *
 *     node scripts/folder-databases.mjs ../waf-fix
 *     node scripts/folder-databases.mjs --drop ../waf-fix
 *
 * The names are the main folder's three, from its .env, with the folder's
 * own name after the dev name: foundation_waf_fix, foundation_waf_fix_test
 * and foundation_waf_fix_e2e for ../waf-fix. The folder's name is
 * lowercased, each character outside a-z and 0-9 an underscore.
 *
 * It writes the three addresses into the folder's .env, the main folder's
 * server with the new names, copied from the main folder's .env when the
 * folder has none, and changes no other line; makes each database that is
 * missing, from the postgres database on that server, owned by the
 * address's user; runs npm run migrate:all in the folder's server/, so the
 * folder's own code migrates them; and npm run seed there for a dev
 * database it has just made. Run again, it changes nothing already right,
 * and says so. It prints, at the end, each database and what was done.
 *
 * --drop drops the three databases the folder's .env names, before
 * git worktree remove, and leaves the .env, since the folder is about to
 * go. A name that is the main folder's is never dropped.
 *
 * It refuses, before changing anything: a run from a second working
 * folder; the main folder given; a folder that is not a working folder of
 * this repository; no .env in the main folder; a name that is the main
 * folder's own, or longer than Postgres's 63 bytes; a folder's .env that
 * is the main folder's, linked; and the folder's server/node_modules
 * missing, since its own code migrates.
 *
 * pg and dotenv come from server/node_modules, as one-at-a-time.mjs
 * reaches them. Its tests, in folder-databases.test.mjs, stand in for the
 * database and npm, in a temporary repository with a second working
 * folder: `node --test scripts/`.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAddress } from "./one-at-a-time.mjs";

/** This working folder: the one this copy of the script is in. */
const ROOT = realpathSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
);

const SCRIPT = "node scripts/folder-databases.mjs";

/** The three databases, by the .env line that names each. */
export const KEYS = {
  dev: "DATABASE_URL",
  test: "DATABASE_URL_TEST",
  e2e: "DATABASE_URL_E2E",
};

/** Postgres keeps 63 bytes of a name, and cuts a longer one without a word. */
export const MAX_NAME_BYTES = 63;

/** A name that may reach SQL, in its double quotes. */
const NAME = /^[a-z0-9_]+$/;

const USAGE = [
  "Usage, from the main working folder:",
  `  ${SCRIPT} <folder>          its own dev, test and e2e databases`,
  `  ${SCRIPT} --drop <folder>   drops them, before git worktree remove`,
].join("\n");

/** A stop the person reads: its message, exit 1. */
export class Stop extends Error {}

/** The folder and whether to drop, or null when not as USAGE says. */
export function parse(argv) {
  const drop = argv[0] === "--drop";
  const words = drop ? argv.slice(1) : argv;
  if (words.length !== 1 || words[0].startsWith("-") || !words[0]) {
    return null;
  }
  return { drop, folder: words[0] };
}

const git = (cwd, ...args) =>
  execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trimEnd();

/**
 * The main working folder, the parent of the folder git shares, from the
 * one this script is in. Refused from a second working folder, whose own
 * git folder is not the shared one.
 */
export function mainFolder(root) {
  let gitDir;
  let common;
  try {
    [gitDir, common] = git(
      root,
      "rev-parse",
      "--path-format=absolute",
      "--git-dir",
      "--git-common-dir",
    ).split("\n");
  } catch {
    throw new Stop(`${root} is not in a git repository`);
  }
  const main = path.dirname(realpathSync(common));
  if (realpathSync(gitDir) !== realpathSync(common)) {
    throw new Stop(
      `${root} is a second working folder; run this from the main working folder: cd ${main} && ${SCRIPT} …`,
    );
  }
  return main;
}

/**
 * The second working folder given, from the folder the script was started
 * in: refused when it is the main folder, whose databases keep their
 * names, or not a working folder of this repository, by
 * git rev-parse --git-common-dir as scripts/fix-issue/lib.mjs checks it.
 */
export function secondFolder(main, given, cwd) {
  const folder = path.resolve(cwd, given);
  if (!existsSync(folder)) throw new Stop(`no folder at ${folder}`);
  let top;
  let common;
  try {
    [top, common] = git(
      folder,
      "rev-parse",
      "--path-format=absolute",
      "--show-toplevel",
      "--git-common-dir",
    ).split("\n");
  } catch {
    throw new Stop(`${folder} is not a working folder of this repository`);
  }
  if (path.dirname(realpathSync(common)) !== main) {
    throw new Stop(`${folder} is not a working folder of this repository`);
  }
  if (realpathSync(top) === main) {
    throw new Stop(
      `${folder} is in the main working folder, whose databases keep their names; give a second one, such as ../waf-fix`,
    );
  }
  if (realpathSync(top) !== realpathSync(folder)) {
    throw new Stop(`${folder} is inside a working folder; give it, ${top}`);
  }
  return realpathSync(top);
}

/** The folder's name as it goes in a database's: a-z, 0-9 and _. */
export const nameOf = (folder) =>
  path
    .basename(folder)
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "_");

/** The database an address names, or null when it is not a Postgres one. */
export function databaseOf(url) {
  if (!postgresAddress(url)) return null;
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  return name || null;
}

/** The same address, its user, password, host, port and query kept, another database. */
export function withDatabase(url, name) {
  const address = new URL(url);
  address.pathname = `/${name}`;
  return address.href;
}

/**
 * The folder's three names, from the main folder's: `_<name>` after the
 * dev name in each. Refused when a main name does not start with the dev
 * name, when one is not a-z, 0-9 and _, longer than 63 bytes, or one of
 * the main folder's own.
 */
export function folderNames(main, folder) {
  const own = nameOf(folder);
  const names = {};
  for (const [which, name] of Object.entries(main)) {
    if (!name.startsWith(main.dev)) {
      throw new Stop(
        `the main folder's ${which} database, ${name}, does not start with its dev database's name, ${main.dev}, so no name can be made from it`,
      );
    }
    names[which] = `${main.dev}_${own}${name.slice(main.dev.length)}`;
  }
  for (const [which, name] of Object.entries(names)) {
    if (!NAME.test(name)) {
      throw new Stop(
        `${name}, the ${which} database's name, would have a character outside a-z, 0-9 and _; the main folder's names have only those`,
      );
    }
    const bytes = Buffer.byteLength(name);
    if (bytes > MAX_NAME_BYTES) {
      throw new Stop(
        `${name} is ${bytes} bytes, longer than Postgres's ${MAX_NAME_BYTES}; give the folder a shorter name`,
      );
    }
    const theirs = Object.keys(main).find((each) => main[each] === name);
    if (theirs) {
      throw new Stop(
        `${name}, the folder's ${which} database, is the main folder's ${theirs} database; give the folder another name`,
      );
    }
  }
  return names;
}

/**
 * The .env with each line of `values` set, `KEY=value`, and a missing one
 * added at the end: every other line as it was, and a line whose value
 * already reads as the one wanted left as it is. Gives the text and the
 * keys set and added.
 */
export function rewriteEnv(text, values, parseEnv) {
  const set = [];
  const found = new Set();
  const lines = text.split("\n").map((line) => {
    const key = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(
      line,
    )?.[1];
    if (!key || !Object.hasOwn(values, key)) return line;
    found.add(key);
    if (parseEnv(line)[key] === values[key]) return line;
    set.push(key);
    return `${key}=${values[key]}`;
  });
  const added = Object.keys(values).filter((key) => !found.has(key));
  let result = lines.join("\n");
  if (added.length) {
    if (result && !result.endsWith("\n")) result += "\n";
    result += added.map((key) => `${key}=${values[key]}\n`).join("");
  }
  return { text: result, set: [...new Set(set)], added };
}

/** The main folder's three addresses and names, from its .env. */
function mainDatabases(main, system) {
  const file = path.join(main, ".env");
  if (!existsSync(file)) {
    throw new Stop(
      `no .env in the main working folder, ${main}: copy .env.example to .env there and fill it in`,
    );
  }
  const env = system.parseEnv(readFileSync(file, "utf8"));
  const addresses = {};
  const names = {};
  for (const [which, key] of Object.entries(KEYS)) {
    if (!env[key]) {
      throw new Stop(
        `the main folder's .env has no ${key}; add it (see .env.example)`,
      );
    }
    const name = databaseOf(env[key]);
    if (!name) {
      throw new Stop(
        `the main folder's ${key} is not a postgresql:// address naming a database; correct it (see .env.example)`,
      );
    }
    addresses[which] = env[key];
    names[which] = name;
  }
  return { addresses, names };
}

/** Where an address points, for a message: never its password. */
const serverOf = (url) => {
  const { hostname, port } = new URL(url);
  return `${hostname || "localhost"}:${port || 5432}`;
};

/** A connection to the database at the address, refused with what to do. */
async function open(url, system) {
  try {
    return await system.connect(url);
  } catch (error) {
    if (error instanceof Stop) throw error;
    throw new Stop(
      `could not reach ${databaseOf(url)} on ${serverOf(url)} (${error.message}). Is Postgres up? docker compose up -d`,
    );
  }
}

/** Whether the database is there, asked of the postgres database on its server. */
async function exists(db, name) {
  const { rows } = await db.query(
    "select 1 from pg_database where datname = $1",
    [name],
  );
  return rows.length > 0;
}

/** The migrations Drizzle records as applied to the database at the address. */
async function applied(url, system) {
  const db = await open(url, system);
  try {
    const { rows } = await db.query(
      "select to_regclass('drizzle.__drizzle_migrations') is not null as present",
    );
    if (!rows[0]?.present) return 0;
    const counted = await db.query(
      "select count(*)::int as applied from drizzle.__drizzle_migrations",
    );
    return counted.rows[0].applied;
  } finally {
    await db.end().catch(() => {});
  }
}

/**
 * The environment npm runs in, without the addresses a shell may hold:
 * dotenv never overrides a variable already set, so one left here would
 * send the folder's migrations to whatever it names.
 */
export function npmEnv(env) {
  const result = { ...env };
  for (const key of [...Object.values(KEYS), "MIGRATE_TARGET"]) {
    delete result[key];
  }
  return result;
}

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The lines that end a run: each database and what was done to it. */
function report(say, rows) {
  const width = Math.max(...rows.map(([what]) => what.length));
  for (const [what, done] of rows) say(`  ${what.padEnd(width)}  ${done}`);
}

/**
 * Gives the second folder its own databases: its .env, then each database
 * made when missing, migrated by the folder's own code, and a dev one just
 * made seeded. Every refusal comes before any change.
 */
export async function give(given, system) {
  const main = mainFolder(system.root);
  const folder = secondFolder(main, given, system.cwd);
  const there = path.relative(main, folder);
  const { addresses, names: mainNames } = mainDatabases(main, system);
  const names = folderNames(mainNames, folder);
  const server = path.join(folder, "server");
  if (!existsSync(path.join(server, "node_modules"))) {
    throw new Stop(
      [
        `${there}/server/node_modules is missing, and the folder's own code migrates its databases. First:`,
        `  (cd ${there}/server && npm ci)`,
      ].join("\n"),
    );
  }
  const envFile = path.join(folder, ".env");
  const mainEnvFile = path.join(main, ".env");
  if (existsSync(envFile)) {
    const [mine, theirs] = [statSync(envFile), statSync(mainEnvFile)];
    if (mine.ino === theirs.ino && mine.dev === theirs.dev) {
      throw new Stop(
        `${there}/.env is the main folder's own .env, linked, so writing it would rename the main folder's databases. Remove it, rm ${there}/.env, and run this again: it is then copied.`,
      );
    }
  }

  const urls = {};
  const values = {};
  for (const [which, key] of Object.entries(KEYS)) {
    urls[which] = withDatabase(addresses[which], names[which]);
    values[key] = urls[which];
  }

  const rows = [];
  const done = {};
  for (const which of Object.keys(KEYS)) done[which] = [];
  let changed = false;
  try {
    const copied = !existsSync(envFile);
    if (copied) copyFileSync(mainEnvFile, envFile);
    const before = readFileSync(envFile, "utf8");
    const env = rewriteEnv(before, values, system.parseEnv);
    if (env.text !== before) writeFileSync(envFile, env.text);
    changed ||= copied || env.text !== before;
    const changes = [
      copied && "copied from the main folder's",
      env.set.length && `${env.set.join(", ")} set`,
      env.added.length && `${env.added.join(", ")} added`,
    ].filter(Boolean);
    rows.push([
      `${there}/.env`,
      changes.length ? changes.join("; ") : "already right",
    ]);

    const made = {};
    const counts = {};
    for (const [which, url] of Object.entries(urls)) {
      const db = await open(postgresAddress(url), system);
      try {
        made[which] = !(await exists(db, names[which]));
        // The connection's user owns what it makes: the address's own.
        if (made[which]) await db.query(`create database "${names[which]}"`);
      } finally {
        await db.end().catch(() => {});
      }
      changed ||= made[which];
      done[which].push(made[which] ? "made" : "already there");
      counts[which] = made[which] ? 0 : await applied(url, system);
    }

    const npm = (script) => {
      if (system.npm(server, ["run", script], npmEnv(system.env)) !== 0) {
        const after = made.dev
          ? "npm run migrate:all && npm run seed"
          : "npm run migrate:all";
        throw new Stop(
          `npm run ${script} failed in ${there}/server, above. Once it is put right: (cd ${there}/server && ${after})`,
        );
      }
    };
    npm("migrate:all");
    for (const [which, url] of Object.entries(urls)) {
      const count = (await applied(url, system)) - counts[which];
      changed ||= count !== 0;
      done[which].push(
        count ? `${plural(count, "migration")} applied` : "up to date",
      );
    }
    if (made.dev) {
      npm("seed");
      done.dev.push("seeded");
    }
  } finally {
    if (rows.length) {
      // On a line of its own: drizzle-kit's last line ends with none.
      system.say("");
      system.say(`${there}'s own databases:`);
      for (const [which, name] of Object.entries(names)) {
        rows.push([name, done[which].join(", ") || "not reached"]);
      }
      report(system.say, rows);
    }
  }
  system.say(
    changed
      ? `Done: ${there} has its own databases.`
      : `Nothing changed: ${there}'s databases were already right.`,
  );
}

/**
 * Drops the databases the second folder's .env names, never one that is
 * the main folder's: true when none was refused.
 */
export async function drop(given, system) {
  const main = mainFolder(system.root);
  const folder = secondFolder(main, given, system.cwd);
  const there = path.relative(main, folder);
  const { names: mainNames } = mainDatabases(main, system);
  const envFile = path.join(folder, ".env");
  if (!existsSync(envFile)) {
    throw new Stop(
      `no .env in ${there}, so nothing names its databases; nothing is dropped`,
    );
  }
  const env = system.parseEnv(readFileSync(envFile, "utf8"));
  const theirs = new Set(Object.values(mainNames));

  const rows = [];
  let refused = false;
  for (const key of Object.values(KEYS)) {
    const name = env[key] ? databaseOf(env[key]) : null;
    if (!name) {
      rows.push([key, "names no database; nothing dropped"]);
    } else if (theirs.has(name)) {
      rows.push([name, `the main folder's; refused, left as it is`]);
      refused = true;
    } else if (!NAME.test(name)) {
      rows.push([name, "not a-z, 0-9 and _; refused, left as it is"]);
      refused = true;
    } else {
      const db = await open(postgresAddress(env[key]), system);
      try {
        if (await exists(db, name)) {
          await db.query(`drop database "${name}" with (force)`);
          rows.push([name, "dropped"]);
        } else {
          rows.push([name, "not there; nothing dropped"]);
        }
      } finally {
        await db.end().catch(() => {});
      }
    }
  }
  rows.push([`${there}/.env`, "left as it is, for the folder is to go"]);
  system.say(`${there}'s databases:`);
  report(system.say, rows);
  return !refused;
}

/** pg and dotenv, from this folder's server/node_modules. */
function packages() {
  const require = createRequire(path.join(ROOT, "server/package.json"));
  try {
    return { pg: require("pg"), dotenv: require("dotenv") };
  } catch {
    throw new Stop(
      "pg and dotenv come from server/node_modules: run npm ci in server/ first.",
    );
  }
}

/** What a run uses outside itself; the tests give their own database and npm. */
export const SYSTEM = {
  root: ROOT,
  cwd: process.cwd(),
  env: process.env,
  parseEnv: (text) => packages().dotenv.parse(text),
  connect: async (url) => {
    const client = new (packages().pg.Client)({
      connectionString: url,
      application_name: "folder-databases",
    });
    await client.connect();
    return client;
  },
  npm: (dir, args, env) =>
    spawnSync("npm", args, { cwd: dir, stdio: "inherit", env }).status ?? 1,
  say: (line) => process.stdout.write(`${line}\n`),
};

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const parsed = parse(process.argv.slice(2));
  if (!parsed) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }
  try {
    if (parsed.drop) {
      process.exitCode = (await drop(parsed.folder, SYSTEM)) ? 0 : 1;
    } else {
      await give(parsed.folder, SYSTEM);
    }
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
