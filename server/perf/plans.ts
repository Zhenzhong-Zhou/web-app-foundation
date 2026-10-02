import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { type INestApplicationContext, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Pool } from 'pg';

import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.tokens';
import type { VolumeManifest } from '../src/database/seed-volume';
import { runInTenantContext } from '../src/database/tenant-context';
import { CostsService } from '../src/modules/costs/costs.service';
import { InvoicesService } from '../src/modules/invoices/invoices.service';
import { OrdersService } from '../src/modules/orders/orders.service';
import { ShippingService } from '../src/modules/orders/shipping.service';
import { AvailabilityService } from '../src/modules/stock/availability.service';
import { LotTraceService } from '../src/modules/stock/lot-trace.service';
import { StockReadsService } from '../src/modules/stock/stock-reads.service';
import { type Captured, QueryCapture } from './capture';
import { toUnits } from './quantity';
import { REPORTS } from './report';

/**
 * Query plans for the main list and ledger queries (ADR-051).
 *
 * Calls the real services in one seeded organization, records the SQL they
 * send, and runs EXPLAIN (ANALYZE, BUFFERS) on each statement inside a
 * transaction that is rolled back. Fails on a sequential scan of a large
 * table: a missing index shows up here before anyone feels it.
 *
 * Usage, from `server/`, against the volume seed's database (README):
 *
 *     NODE_ENV=test DATABASE_URL_TEST=$PERF_DB npm run perf:plans
 *     ... npm run perf:plans -- --min-rows 50000
 *
 * Large means at least --min-rows rows (default 10,000) by the planner's own
 * estimate, after a fresh ANALYZE. Below that a sequential scan is often the
 * right plan, and failing on it would teach people to ignore the check.
 */

const MANIFEST = join(__dirname, 'volume.json');

/**
 * Sequential scans that are the decision, not an accident. Each says why,
 * so the next person can tell whether the reason still holds.
 */
const ALLOWED: { probe: string; table: string; reason: string }[] = [
  {
    probe: 'lot search',
    table: 'lots',
    reason:
      "Matches anywhere in the code (ilike '%…%'), which no b-tree index " +
      "serves. lot-trace.service.ts reads the organization's lots in full " +
      'by design; pg_trgm is the recorded fix if lots reach millions.',
  },
];

interface Probe {
  name: string;
  run: () => Promise<unknown>;
}

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  Plans?: PlanNode[];
}

interface Explained {
  probe: string;
  sql: string;
  planningMs: number;
  executionMs: number;
  seqScans: { table: string; rows: number; allowed: boolean }[];
  plan: PlanNode;
}

async function main(): Promise<number> {
  const logger = new Logger('PlanCheck');
  const minRows = Number(valueOf(process.argv, '--min-rows') ?? 10_000);

  if (!existsSync(MANIFEST)) {
    logger.error(`No ${MANIFEST}: run npm run seed:volume first.`);
    return 1;
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as VolumeManifest;
  const org = manifest.organizations[0];

  const capture = new QueryCapture();
  capture.install();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const pool = app.get<Pool>(PG_POOL);

    // The planner's view of this data, not of whatever was there before.
    await pool.query('analyze');
    const sizes = await tableSizes(pool);

    const probes = await runInTenantContext(
      { userId: org.userId, organizationId: org.organizationId },
      () => buildProbes(app, org),
    );

    for (const probe of probes) {
      await runInTenantContext(
        { userId: org.userId, organizationId: org.organizationId },
        () => capture.during(probe.name, probe.run),
      );
    }

    const explained: Explained[] = [];
    for (const statement of capture.statements) {
      explained.push(await explain(pool, statement, sizes, minRows));
    }

    const violations = explained.flatMap((entry) =>
      entry.seqScans
        .filter((scan) => !scan.allowed)
        .map((scan) => ({ probe: entry.probe, ...scan })),
    );

    const markdown = summary(probes, explained, violations, minRows);
    console.log(`\n${markdown}`);

    mkdirSync(REPORTS, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = join(REPORTS, `${stamp}-${manifest.scale}-plans.json`);
    writeFileSync(
      path,
      `${JSON.stringify({ scale: manifest.scale, minRows, explained }, null, 2)}\n`,
    );
    console.log(`\nPlans: ${path}`);

    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${markdown}\n`);
    }

    return violations.length > 0 ? 1 : 0;
  } finally {
    await app.close();
  }
}

/**
 * What the list screens and the ledger ask, in the first seeded
 * organization. Inputs (an order, a shelf, a cursor) are found first and
 * outside the capture, so only the query under test is explained.
 */
async function buildProbes(
  app: INestApplicationContext,
  org: VolumeManifest['organizations'][number],
): Promise<Probe[]> {
  const orders = app.get(OrdersService);
  const stock = app.get(StockReadsService);
  const availability = app.get(AvailabilityService);
  const invoices = app.get(InvoicesService);
  const traces = app.get(LotTraceService);
  const shipping = app.get(ShippingService);
  const costs = app.get(CostsService);

  const firstOrders = await orders.list({ status: 'all' });
  const deepOrders = await cursorAfter(
    (before) => orders.list({ status: 'all', before }),
    20,
  );
  const deepMovements = await cursorAfter(
    (before) => stock.listMovements({ before }),
    20,
  );

  const shelf = (await stock.list({})).find((row) => row.lotId);
  if (!shelf) throw new Error('No lot-tracked stock: was this volume-seeded?');

  // An open sale to preview: what earliest expiry first reads before a ship.
  const sale = await firstSale(orders, stock);

  const probes: Probe[] = [
    { name: 'orders: open', run: () => orders.list({}) },
    { name: 'orders: all', run: () => orders.list({ status: 'all' }) },
    {
      name: 'orders: one customer',
      run: () => orders.list({ status: 'all', partnerId: org.customerId }),
    },
    {
      name: 'orders: page 21',
      run: () => orders.list({ status: 'all', before: deepOrders }),
    },
    {
      name: 'order detail',
      run: () => orders.findById(firstOrders.entries[0].id),
    },
    { name: 'inventory', run: () => stock.list({}) },
    {
      name: 'inventory: one shelf',
      run: () => stock.list({ locationId: shelf.locationId }),
    },
    {
      name: 'inventory: one product',
      run: () => stock.list({ variantId: shelf.variantId }),
    },
    { name: 'availability', run: () => availability.list() },
    { name: 'movements', run: () => stock.listMovements({}) },
    {
      name: 'movements: page 21',
      run: () => stock.listMovements({ before: deepMovements }),
    },
    {
      name: 'movements: one product',
      run: () => stock.listMovements({ variantId: shelf.variantId }),
    },
    {
      name: 'movements: one lot',
      run: () => stock.listMovements({ lotId: shelf.lotId! }),
    },
    {
      name: 'movements: one shelf',
      run: () => stock.listMovements({ locationId: shelf.locationId }),
    },
    { name: 'invoices', run: () => invoices.list({}) },
    {
      name: 'invoices: issued',
      run: () => invoices.list({ status: 'issued' }),
    },
    {
      name: 'invoices: one customer',
      run: () => invoices.list({ partnerId: org.customerId }),
    },
    { name: 'lot search', run: () => traces.search('LV-0001') },
    { name: 'valuation', run: () => costs.stockValuation() },
  ];

  if (org.traceLotId) {
    const lotId = org.traceLotId;
    probes.push({ name: 'lot trace', run: () => traces.trace(lotId) });
  }

  // Missing it would drop the earliest-expiry-first read from the check
  // without a word, so its absence is a failure, not a skipped row.
  if (!sale) {
    throw new Error('No confirmed sale with anything left to ship to preview');
  }

  probes.push({
    name: 'shipping preview (FEFO)',
    run: () =>
      shipping.preview(sale.orderId, {
        fromLocationId: sale.locationId,
        lines: [{ lineId: sale.lineId, quantity: '1' }],
      }),
  });

  return probes;
}

/** The cursor after `pages` pages, the way a person paging back gets there. */
async function cursorAfter(
  page: (before?: string) => Promise<{ nextCursor: string | null }>,
  pages: number,
): Promise<string | undefined> {
  let cursor: string | undefined;

  for (let i = 0; i < pages; i++) {
    const { nextCursor } = await page(cursor);
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return cursor;
}

/**
 * A confirmed sale with something left to ship, and its shelf.
 *
 * Paged rather than read from the first page: after a perf run, the newest
 * confirmed orders are perf's own purchases, and a first page with no sale
 * on it left the preview probe out of the check without a word.
 */
async function firstSale(orders: OrdersService, stock: StockReadsService) {
  let before: string | undefined;

  for (let page = 0; page < 40; page++) {
    const { entries, nextCursor } = await orders.list({
      status: 'confirmed',
      before,
    });

    for (const candidate of entries) {
      if (candidate.direction !== 'sale') continue;

      const order = await orders.findById(candidate.id);
      const line = order.lines.find(
        (entry) => entry.quantityFulfilled !== entry.quantityOrdered,
      );
      if (!line) continue;

      // The shelf holding most of it: the volume seed keeps each product on
      // one shelf, and ships from there.
      const rows = await stock.list({ variantId: line.variantId });
      const shelf = rows.sort((a, b) =>
        toUnits(b.quantity) > toUnits(a.quantity) ? 1 : -1,
      )[0];
      if (!shelf) continue;

      return {
        orderId: order.id,
        lineId: line.id,
        locationId: shelf.locationId,
      };
    }

    if (!nextCursor) break;
    before = nextCursor;
  }

  return undefined;
}

async function explain(
  pool: Pool,
  statement: Captured,
  sizes: Map<string, number>,
  minRows: number,
): Promise<Explained> {
  const client = await pool.connect();

  try {
    // Rolled back whatever happens: ANALYZE runs the statement for real.
    await client.query('begin');
    const { rows } = await client.query<{
      'QUERY PLAN': {
        Plan: PlanNode;
        'Planning Time': number;
        'Execution Time': number;
      }[];
    }>({
      text: `explain (analyze, buffers, format json) ${statement.text}`,
      values: statement.values,
    });
    await client.query('rollback');

    const [result] = rows[0]['QUERY PLAN'];

    const seqScans = scansOf(result.Plan)
      .map((table) => ({ table, rows: sizes.get(table) ?? 0 }))
      .filter((scan) => scan.rows >= minRows)
      .map((scan) => ({
        ...scan,
        allowed: ALLOWED.some(
          (entry) =>
            entry.probe === statement.probe && entry.table === scan.table,
        ),
      }));

    return {
      probe: statement.probe,
      sql: statement.text.replace(/\s+/g, ' ').trim(),
      planningMs: result['Planning Time'],
      executionMs: result['Execution Time'],
      seqScans,
      plan: result.Plan,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

function scansOf(node: PlanNode): string[] {
  const own =
    (node['Node Type'] === 'Seq Scan' ||
      node['Node Type'] === 'Parallel Seq Scan') &&
    node['Relation Name']
      ? [node['Relation Name']]
      : [];

  return [...own, ...(node.Plans ?? []).flatMap(scansOf)];
}

/** Rows per table by the planner's estimate, which is what it plans with. */
async function tableSizes(pool: Pool): Promise<Map<string, number>> {
  const { rows } = await pool.query<{ relname: string; rows: string }>(`
    select c.relname, greatest(c.reltuples, 0)::bigint::text as rows
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  `);

  return new Map(rows.map((row) => [row.relname, Number(row.rows)]));
}

function summary(
  probes: Probe[],
  explained: Explained[],
  violations: { probe: string; table: string; rows: number }[],
  minRows: number,
): string {
  const lines = [
    `## Query plans: sequential scans of tables over ${minRows.toLocaleString('en')} rows`,
    '',
    '| Probe | Statements | Slowest | Large-table seq scans |',
    '|---|---|---|---|',
  ];

  for (const probe of probes) {
    const mine = explained.filter((entry) => entry.probe === probe.name);
    const slowest = Math.max(0, ...mine.map((entry) => entry.executionMs));
    const scans = mine.flatMap((entry) =>
      entry.seqScans.map(
        (scan) =>
          `${scan.table} (${scan.rows.toLocaleString('en')})${scan.allowed ? ', allowed' : ''}`,
      ),
    );

    lines.push(
      `| ${probe.name} | ${mine.length} | ${slowest.toFixed(1)} ms | ${scans.join('; ') || 'none'} |`,
    );
  }

  lines.push('');

  if (violations.length === 0) {
    lines.push('Passed: no unexpected sequential scan of a large table.');
  } else {
    lines.push('**Failed:**', '');
    for (const violation of violations) {
      lines.push(
        `- ${violation.probe} scans ${violation.table} (${violation.rows.toLocaleString('en')} rows) in full. Add an index, bound the query, or allow it in perf/plans.ts with the reason.`,
      );
    }
  }

  for (const entry of ALLOWED) {
    lines.push(
      '',
      `Allowed: ${entry.probe} on ${entry.table}. ${entry.reason}`,
    );
  }

  return lines.join('\n');
}

function valueOf(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

void main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    process.exitCode = 1;
  });
