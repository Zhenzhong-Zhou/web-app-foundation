/**
 * Fails when the client's error codes and the server's disagree
 * (conventions.md, "Error codes"). A screen keys on a code to offer the way
 * out of a refusal; a code the client expects and the server never sends
 * leaves that screen silently without its link, and one the server sends
 * that the client lacks is a way out nobody offers. The two packages share
 * no files, so this compares the sources, as check-client-permissions.js
 * does for the permission list.
 */
const fs = require('node:fs');
const path = require('node:path');

const SERVER = path.join(__dirname, '../src/common/error-codes.ts');
const CLIENT = path.join(__dirname, '../../client/src/lib/api.ts');

/** The `name: 'code'` pairs inside `export const ERROR_CODES = { … }`. */
function codesIn(file) {
  const source = fs.readFileSync(file, 'utf8');
  const block = /export const ERROR_CODES = \{([\s\S]*?)\} as const;/.exec(
    source,
  );
  if (!block) {
    console.error(
      `No ERROR_CODES list in ${path.relative(process.cwd(), file)}`,
    );
    process.exit(1);
  }
  return new Map(
    [...block[1].matchAll(/(\w+):\s*'([a-z_]+)'/g)].map((m) => [m[1], m[2]]),
  );
}

const server = codesIn(SERVER);
const client = codesIn(CLIENT);

const problems = [];
for (const [name, code] of server) {
  if (!client.has(name)) {
    problems.push(`the client lacks ${name}`);
  } else if (client.get(name) !== code) {
    problems.push(
      `${name} is '${client.get(name)}' on the client, '${code}' on the server`,
    );
  }
}
for (const name of client.keys()) {
  if (!server.has(name)) problems.push(`the server has no ${name}`);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    '  Make ERROR_CODES in client/src/lib/api.ts match server/src/common/error-codes.ts.',
  );
  process.exit(1);
}

console.log(`Client and server agree on ${server.size} error codes.`);
