/**
 * What the database scripts share (ADR-089's amendment for #529):
 * one-at-a-time.mjs, folder-databases.mjs, database-ahead.mjs and the fix
 * runner's lib.mjs, so a fix made here reaches all four. One Stop; the
 * three addresses and what each names; a folder's .env, and the rule that
 * the environment's address comes before it, as dotenv leaves a variable
 * already set; pg, dotenv and Drizzle's migrator from server/node_modules;
 * a connection, and the migrations Drizzle records as run; the working
 * folders, and the checks that find the main one and a second one given.
 *
 * Nothing is required from server/node_modules until a function needs it,
 * so the runner's tests and CI need nothing installed to import this.
 * Each script's own tests cover what it uses from here: `node --test
 * scripts/`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/** A stop the person reads: its message, exit 1. */
export class Stop extends Error {}

/** The three databases, by the .env line that names each, as drizzle.config.ts reads them. */
export const KEYS = {
  dev: "DATABASE_URL",
  test: "DATABASE_URL_TEST",
  e2e: "DATABASE_URL_E2E",
};

/** A name that may reach SQL, in its double quotes. */
export const NAME = /^[a-z0-9_]+$/;

const isPostgres = (url) =>
  /^postgres(?:ql)?:\/\//.test(url ?? "") && URL.canParse(url);

/**
 * Where an address points: its server, as host:port, and its database,
 * whatever its user, password and query; null when it is not a
 * postgresql:// or postgres:// address naming a database.
 */
export function databaseAt(url) {
  if (!isPostgres(url)) return null;
  const { hostname, port, pathname } = new URL(url);
  const name = decodeURIComponent(pathname.slice(1));
  return name
    ? {
        server: `${(hostname || "localhost").toLowerCase()}:${port || 5432}`,
        name,
      }
    : null;
}

/** The database an address names, or null when it is not a Postgres one. */
export const databaseOf = (url) => databaseAt(url)?.name ?? null;

/** The same address, its user, password, host, port and query kept, another database. */
export function withDatabase(url, name) {
  const address = new URL(url);
  address.pathname = `/${name}`;
  return address.href;
}

/**
 * The address of the postgres database on the server `url` names, where
 * databases are made and dropped and the lock is held. Null when `url` is
 * not a postgresql:// or postgres:// address.
 */
export const postgresAddress = (url) =>
  isPostgres(url) ? withDatabase(url, "postgres") : null;

/** A package from the folder's server/node_modules, refused with what to do. */
export function fromServer(root, name) {
  const require = createRequire(path.join(root, "server/package.json"));
  try {
    return require(name);
  } catch {
    throw new Stop(
      `${name} comes from server/node_modules: run npm ci in server/ first.`,
    );
  }
}

/**
 * A folder's .env, read as dotenv reads it, with the dotenv of `root`'s
 * server/node_modules, since a second folder may have none; null when the
 * folder has no .env.
 */
export function readEnv(folder, root = folder) {
  let text;
  try {
    text = readFileSync(path.join(folder, ".env"));
  } catch {
    return null;
  }
  return fromServer(root, "dotenv").parse(text);
}

/** A line's address: the environment's before the .env's, as dotenv leaves a variable already set. */
export const addresses = (env, file) => (key) => env[key] || file?.[key];

/** A connection of pg's to the address, named for pg_stat_activity, once connected. */
export async function connect(root, url, applicationName, onError) {
  const client = new (fromServer(root, "pg").Client)({
    connectionString: url,
    application_name: applicationName,
  });
  if (onError) client.on("error", onError);
  await client.connect();
  return client;
}

/** A connection to the database at the address, by `connect`, refused with what to do. */
export async function open(url, name, connectTo) {
  try {
    return await connectTo(url);
  } catch (error) {
    if (error instanceof Stop) throw error;
    throw new Stop(
      `Could not reach ${name} on ${databaseAt(url)?.server ?? "its server"} ` +
        `(${error.message}). Is Postgres up? docker compose up -d`,
    );
  }
}

/** The migrations Drizzle records as run in the database, in that order; none when it has no record. */
export async function recorded(db) {
  const { rows } = await db.query(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as present",
  );
  if (!rows[0]?.present) return [];
  const ran = await db.query(
    "select hash, created_at from drizzle.__drizzle_migrations order by id",
  );
  return ran.rows;
}

const git = (cwd, ...args) =>
  execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trimEnd();

/** The working folders, the main one first, as git lists them; none when it cannot. */
export function worktrees(root) {
  let listed;
  try {
    listed = git(root, "worktree", "list", "--porcelain");
  } catch {
    return [];
  }
  return listed
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => {
      const folder = line.slice("worktree ".length);
      try {
        return realpathSync(folder);
      } catch {
        return folder;
      }
    });
}

/**
 * The main working folder, the parent of the folder git shares, found from
 * `from`. Refused from a second working folder, whose own git folder is
 * not the shared one, with the command to run from the main one.
 */
export function mainFolder(from, command) {
  let top;
  let gitDir;
  let common;
  try {
    [top, gitDir, common] = git(
      from,
      "rev-parse",
      "--path-format=absolute",
      "--show-toplevel",
      "--git-dir",
      "--git-common-dir",
    ).split("\n");
  } catch {
    throw new Stop(`${from} is not in a git repository`);
  }
  const main = path.dirname(realpathSync(common));
  if (realpathSync(gitDir) !== realpathSync(common)) {
    throw new Stop(
      `${top} is a second working folder; run it from the main working folder: cd ${main} && ${command} …`,
    );
  }
  return main;
}

/**
 * A second working folder of the main one's repository, given as a folder
 * that is there: its top, refused when it is not a working folder of this
 * repository, by git rev-parse --git-common-dir; when it is in the main
 * folder, the refusal ending with `mainRefusal`, why the main folder is not
 * the one; or when it is inside a working folder.
 */
export function secondFolder(main, folder, mainRefusal) {
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
    throw new Stop(`${folder} is in the main working folder, ${mainRefusal}`);
  }
  if (realpathSync(top) !== realpathSync(folder)) {
    throw new Stop(`${folder} is inside a working folder; give it, ${top}`);
  }
  return realpathSync(top);
}
