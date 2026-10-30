import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import * as schema from '../database/schema';
import { tablePages } from './table-diagrams-pages';

/**
 * `npm run diagrams` (ADR-086): writes docs/tables/, one diagram per area
 * of its tables and their foreign keys, from the Drizzle schema, and
 * removes any other page there. `npm run diagrams -- --check` writes
 * nothing, and exits 1 when a page is not what this would write, or when
 * a table is in no area; scripts/verify.sh and CI run it, as they check
 * the API document. Reads no .env and no database.
 */

const ROOT = join(__dirname, '..', '..', '..');
const FOLDER = 'docs/tables';

/**
 * Each table's area, named as AREAS in scripts/adr-index.mjs names it: the
 * area whose code writes the table, as .claude/rules/ gives its schema
 * file. In AREAS' order. A table in none, or in two, fails the run.
 */
const TABLE_AREAS: Record<string, readonly string[]> = {
  boms: ['bom_lines', 'boms'],
  costs: ['exchange_rates'],
  invoices: [
    'credit_note_lines',
    'credit_note_taxes',
    'credit_notes',
    'invoice_line_taxes',
    'invoice_lines',
    'invoice_taxes',
    'invoices',
  ],
  locations: ['locations'],
  numbering: ['document_numbering', 'document_sequences'],
  orders: ['order_lines', 'order_returns', 'orders', 'shipments'],
  partners: ['addresses', 'contacts', 'partners'],
  'price-lists': ['price_list_items', 'price_lists'],
  'product-licences': ['product_licences'],
  'production-orders': ['production_order_lines', 'production_orders'],
  products: [
    'product_images',
    'product_translations',
    'product_variants',
    'products',
    'variant_translations',
  ],
  recent: ['recent_records'],
  'return-authorizations': [
    'return_authorization_lines',
    'return_authorizations',
  ],
  stock: [
    'lots',
    'stock_levels',
    'stock_movements',
    'stock_valuations',
    'valuation_pools',
  ],
  'tax-codes': ['tax_code_components', 'tax_codes'],
  audit: ['audit_log'],
  auth: ['account_events', 'auth_tokens', 'sessions'],
  authorization: [
    'invitation_roles',
    'membership_roles',
    'permissions',
    'role_permissions',
    'roles',
  ],
  files: ['files'],
  invitations: ['invitations', 'organization_invitations'],
  notifications: ['notifications'],
  organizations: ['memberships', 'organizations'],
  users: ['users'],
};

const fail = (text: string): void => {
  process.stderr.write(`${text}\n`);
};

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const check = argv[0] === '--check';
  if (argv.length > 1 || (argv.length === 1 && !check)) {
    fail('Usage:\n  npm run diagrams\n  npm run diagrams -- --check');
    return 1;
  }

  // AREAS reads the tree through git, as the ADRs' index does: one list.
  const { AREAS } = (await import(
    pathToFileURL(join(ROOT, 'scripts', 'adr-index.mjs')).href
  )) as { AREAS: string[] };

  const { pages, failures } = tablePages(schema, TABLE_AREAS, AREAS);
  if (failures.length > 0) {
    for (const failure of failures) fail(failure);
    fail(
      'Nothing written. Each table is in one area of TABLE_AREAS, in' +
        ' server/src/cli/table-diagrams.ts, by the names AREAS in' +
        ' scripts/adr-index.mjs gives.',
    );
    return 1;
  }

  const folder = join(ROOT, FOLDER);
  const others = existsSync(folder)
    ? readdirSync(folder).filter((name) => !pages.has(name))
    : [];

  if (check) {
    const stale = [...pages]
      .filter(([name, text]) => {
        try {
          return readFileSync(join(folder, name), 'utf8') !== text;
        } catch {
          return true;
        }
      })
      .map(([name]) => `${FOLDER}/${name}: not what npm run diagrams writes`);
    const extra = others.map((name) => `${FOLDER}/${name}: not a page of it`);
    if (stale.length + extra.length > 0) {
      for (const line of [...stale, ...extra]) fail(line);
      fail(`Run npm run diagrams in server/, and commit ${FOLDER}/.`);
      return 1;
    }
    process.stdout.write(
      `${FOLDER}/: ${pages.size} pages, current, every table in an area.\n`,
    );
    return 0;
  }

  mkdirSync(folder, { recursive: true });
  for (const name of others) rmSync(join(folder, name), { recursive: true });
  for (const [name, text] of pages) writeFileSync(join(folder, name), text);
  process.stdout.write(`${FOLDER}/: ${pages.size} pages written.\n`);
  return 0;
}

void main().then((code) => {
  process.exitCode = code;
});
