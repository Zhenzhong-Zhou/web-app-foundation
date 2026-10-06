/**
 * Fails when the client's audit action names and the server's actions
 * disagree (ADR-054). The client names every action in the reader's
 * language from client/src/audit/audit-actions.ts; an action the server
 * records and the client does not name would reach the audit log as a
 * spelled-out English key, and one named only on the client is dead text.
 * The two packages share no files, so this compares the sources, as
 * check-client-locales.js does for the language list.
 */
const fs = require('node:fs');
const path = require('node:path');

const SERVER = path.join(__dirname, '../src/core/audit/audit-actions.ts');
const CLIENT = path.join(__dirname, '../../client/src/audit/audit-actions.ts');

const serverKeys = new Set(
  [
    ...fs
      .readFileSync(SERVER, 'utf8')
      .matchAll(/:\s*'([a-z_]+(?:\.[a-z_]+)+)'/g),
  ].map((m) => m[1]),
);
const clientKeys = new Set(
  [
    ...fs
      .readFileSync(CLIENT, 'utf8')
      .matchAll(/^\s*'([a-z_]+(?:\.[a-z_]+)+)':/gm),
  ].map((m) => m[1]),
);

const unnamed = [...serverKeys].filter((key) => !clientKeys.has(key));
const dead = [...clientKeys].filter((key) => !serverKeys.has(key));

if (unnamed.length > 0 || dead.length > 0) {
  if (unnamed.length > 0) {
    console.error(`The client does not name: ${unnamed.join(', ')}`);
  }
  if (dead.length > 0) {
    console.error(
      `The client names actions the server lacks: ${dead.join(', ')}`,
    );
  }
  console.error('  Make client/src/audit/audit-actions.ts match the server.');
  process.exit(1);
}

console.log(`Client and server agree on ${serverKeys.size} audit actions.`);
