/**
 * Writes src/api/revision.gen.ts from the server's OpenAPI document
 * (ADR-081). Run by `npm run api:types` after openapi-ts, which empties
 * src/api/ before writing the types.
 *
 * The document's info.version is 1.<revision>: /v1, then the API revision
 * within it (server/src/common/api-revision.ts). The server refuses a
 * request whose X-Api-Revision is below its own, so the client needs the
 * one it was built for. Written from the document rather than copied, so
 * the contract check fails a client and a server that disagree.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCUMENT = path.join(CLIENT, '../server/openapi.json');
const OUTPUT = path.join(CLIENT, 'src/api/revision.gen.ts');

const { version } = JSON.parse(readFileSync(DOCUMENT, 'utf8')).info;
const match = /^1\.([1-9][0-9]*)$/.exec(version);
if (!match) {
  console.error(
    `server/openapi.json's info.version is "${version}", not 1.<revision> (ADR-081).`,
  );
  process.exit(1);
}

writeFileSync(
  OUTPUT,
  `// Written from server/openapi.json by scripts/write-api-revision.mjs
// (ADR-081). Never edited by hand: raise API_REVISION in
// server/src/common/api-revision.ts, then run \`npm run api\` in server/.

/** The API revision this client was built for. */
export const API_REVISION = ${match[1]};
`,
);
