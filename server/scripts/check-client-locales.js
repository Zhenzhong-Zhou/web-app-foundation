/**
 * Fails when the client's language list and the server's disagree
 * (ADR-054).
 *
 * The server refuses a tag it does not list, and the client offers only
 * the tags it lists. A language added to one side alone is either offered
 * and then refused on save, or accepted and then shown in English by a
 * client with no catalogue for it. Runs beside check-client-permissions in
 * CI, for the same reason.
 *
 * Read as text rather than imported, so it needs no TypeScript toolchain and
 * no client dependencies.
 */
const fs = require('node:fs');
const path = require('node:path');

const SERVER = path.join(__dirname, '../src/common/locales.ts');
const CLIENT = path.join(__dirname, '../../client/src/lib/locales.ts');

const LIST = /export const SUPPORTED_LOCALES = \[([^\]]*)\] as const;/;
const TAG = /'([A-Za-z-]+)'/g;

function listed(file) {
  const match = fs.readFileSync(file, 'utf8').match(LIST);

  if (!match) {
    console.error(`Could not find SUPPORTED_LOCALES in ${file}`);
    process.exit(1);
  }

  return [...match[1].matchAll(TAG)].map((m) => m[1]);
}

const server = listed(SERVER);
const client = listed(CLIENT);

// Order matters too: the client offers them in this order, and English
// first is the fallback both sides assume.
if (server.join(',') !== client.join(',')) {
  console.error(
    `The server lists ${server.join(', ')}; the client lists ${client.join(', ')}.\n` +
      '  Make server/src/common/locales.ts and client/src/lib/locales.ts agree.',
  );
  process.exit(1);
}

console.log(`Client and server agree on ${server.length} languages.`);
