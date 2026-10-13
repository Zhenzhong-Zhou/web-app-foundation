import { defineConfig } from '@hey-api/openapi-ts';

/**
 * The client's types, generated from the server's OpenAPI document into
 * src/api/ (ADR-068): `npm run api:types` here, or `npm run api` in server/
 * to write the document first. Types only, with the shared lists
 * (Permission, Locale, AuditAction, ErrorCode) as plain constants. The
 * output is committed: the static site's build on Render cannot read
 * server/.
 */
export default defineConfig({
  input: '../server/openapi.json',
  output: 'src/api',
  plugins: [{ name: '@hey-api/typescript', enums: 'javascript' }],
});
