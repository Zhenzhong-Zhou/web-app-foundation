/**
 * Fails when the client's permission list and the server's disagree.
 *
 * The client mirrors the server's vocabulary as a union type, so a typo in
 * a permission check is a compile error (client/src/auth/permissions.ts).
 * That only helps while the two lists match: a permission added to the
 * server and not the client cannot be checked in the client at all, and one
 * left in the client after the server drops it gates a button on something
 * nobody can hold. This runs beside check-snapshots in CI, so either mistake
 * fails the build instead of shipping.
 *
 * Read as text rather than imported, so it needs no TypeScript toolchain and
 * no client dependencies.
 */
const fs = require('node:fs');
const path = require('node:path');

const SERVER = path.join(__dirname, '../src/core/authorization/permissions.ts');
const CLIENT = path.join(__dirname, '../../client/src/auth/permissions.ts');

const PERMISSION = /'([a-z_]+\.[a-z_]+)'/g;

function listed(file, block) {
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(block);

  if (!match) {
    console.error(`Could not find the permission list in ${file}`);
    process.exit(1);
  }

  return new Set([...match[1].matchAll(PERMISSION)].map((m) => m[1]));
}

const server = listed(
  SERVER,
  /export const PERMISSIONS = \{([\s\S]*?)\} as const;/,
);
const client = listed(
  CLIENT,
  /export const PERMISSIONS = \[([\s\S]*?)\] as const;/,
);

const missing = [...server].filter((key) => !client.has(key));
const extra = [...client].filter((key) => !server.has(key));

if (missing.length > 0 || extra.length > 0) {
  if (missing.length > 0) {
    console.error(
      `On the server but not the client: ${missing.join(', ')}\n` +
        '  Add them to client/src/auth/permissions.ts.',
    );
  }
  if (extra.length > 0) {
    console.error(
      `On the client but not the server: ${extra.join(', ')}\n` +
        '  Remove them from client/src/auth/permissions.ts.',
    );
  }
  process.exit(1);
}

console.log(`Client and server agree on ${server.size} permissions.`);
