import { defineConfig } from '@hey-api/openapi-ts';

/**
 * The client's types, generated from the server's OpenAPI document into
 * src/api/ (ADR-068): `npm run api:types` here, or `npm run api` in server/
 * to write the document first. Types only, with the shared lists
 * (Permission, Locale, AuditAction, ErrorCode) as plain constants. The
 * output is committed: the static site's build on Render cannot read
 * server/.
 *
 * Formatted by Prettier as it is written, one export to a line, so a
 * change to the contract reads as a diff in review, and format:check holds
 * it to the same style as everything else.
 */
export default defineConfig({
  input: '../server/openapi.json',
  output: { path: 'src/api', postProcess: ['prettier'] },
  plugins: [{ name: '@hey-api/typescript', enums: 'javascript' }],
});
