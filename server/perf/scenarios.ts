import type { VolumeManifest } from '../src/database/seed-volume';
import { calendarDay, type Session } from './client';
import {
  inParallel,
  type LoadOptions,
  quota,
  runLoad,
  type Send,
} from './load';
import { fromUnits, sumUnits, toUnits, wholeUnitsUp } from './quantity';
import type { ConcurrencyResult } from './report';

export const READ_BUDGET_MS = 300;
export const WRITE_BUDGET_MS = 500;

/** Products with the most lots on one shelf, where FEFO has most to sort. */
const HOT_VARIANTS = 10;

/** Pages walked to find a cursor deep in a list. */
const DEEP_PAGES = 20;

type Anchors = VolumeManifest['organizations'][number];

interface Hot {
  variantId: string;
  locationId: string;
  lots: number;
}

/** A signed-in organization and what perf found in it before timing. */
export interface Org {
  session: Session;
  anchors: Anchors;
  hot: Hot[];
  orderIds: string[];
  deepOrders: string;
  deepMovements: string;
}

export interface Scenario {
  name: string;
  kind: 'read' | 'write';
  budgetMs: number;
  send: Send;
}

interface StockRow {
  variantId: string;
  sku: string;
  locationId: string;
  lotId: string | null;
  quantity: string;
}

interface Page {
  entries: { id: string }[];
  nextCursor: string | null;
}

interface CreatedOrder {
  order: { id: string; reference: string; lines: { id: string }[] };
}

interface OpenOrder {
  orderId: string;
  lineId: string;
  reference: string;
}

/** Spread across organizations, so the tenant filter has neighbours. */
function orgOf(orgs: Org[], worker: number): Org {
  return orgs[worker % orgs.length];
}

// -----------------------------------------------------------------------------
// Discovery: untimed, through the API, from what the volume seed wrote

export async function discover(
  session: Session,
  anchors: Anchors,
): Promise<Org> {
  const [rows, locations] = await Promise.all([
    session.json<StockRow[]>('GET', '/stock'),
    session.json<{ id: string; isAvailable: boolean }[]>('GET', '/locations'),
  ]);

  const available = new Set(
    locations.filter((location) => location.isAvailable).map((l) => l.id),
  );

  /**
   * Goods only, by the volume seed's SKU prefix: they are what sells. Lots
   * are counted per product and shelf, and each product kept once, at the
   * shelf where it has the most.
   */
  const byShelf = new Map<string, Hot>();

  for (const row of rows) {
    if (!row.lotId || !row.sku.startsWith('G-')) continue;
    if (!available.has(row.locationId)) continue;

    const key = `${row.variantId}:${row.locationId}`;
    const hot = byShelf.get(key) ?? {
      variantId: row.variantId,
      locationId: row.locationId,
      lots: 0,
    };
    hot.lots++;
    byShelf.set(key, hot);
  }

  const seen = new Set<string>();
  const hot = [...byShelf.values()]
    .sort((a, b) => b.lots - a.lots)
    .filter((candidate) => {
      if (seen.has(candidate.variantId)) return false;
      seen.add(candidate.variantId);
      return true;
    })
    .slice(0, HOT_VARIANTS);

  if (hot.length === 0) {
    throw new Error(
      `${session.label} has no lot-tracked goods in stock. Was it seeded with seed:volume?`,
    );
  }

  const orders = await walk(session, '/orders?status=all');
  const movements = await walk(session, '/stock/movements');

  return {
    session,
    anchors,
    hot,
    orderIds: orders.ids,
    deepOrders: orders.cursor,
    deepMovements: movements.cursor,
  };
}

/** Pages through a list to collect ids and the cursor where it stopped. */
async function walk(session: Session, path: string) {
  const ids: string[] = [];
  let cursor: string | null = null;
  const join = path.includes('?') ? '&' : '?';

  for (let page = 0; page < DEEP_PAGES; page++) {
    const url: string = cursor ? `${path}${join}before=${cursor}` : path;
    const { entries, nextCursor } = await session.json<Page>('GET', url);

    ids.push(...entries.map((entry) => entry.id));
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  if (!cursor) {
    throw new Error(`${session.label}: ${path} has fewer than two pages`);
  }

  return { ids, cursor };
}

// -----------------------------------------------------------------------------
// Reads (ADR-051): the lists people open, an order, and a lot's trace

export function readScenarios(orgs: Org[]): Scenario[] {
  const read = (
    name: string,
    path: (org: Org, n: number) => string,
  ): Scenario => ({
    name,
    kind: 'read',
    budgetMs: READ_BUDGET_MS,
    send: (worker, n) => {
      const org = orgOf(orgs, worker);
      return org.session.send('GET', path(org, n));
    },
  });

  const scenarios = [
    read('GET /orders (open)', () => '/orders'),
    read('GET /orders?status=all', () => '/orders?status=all'),
    read(
      'GET /orders, page 21',
      (org) => `/orders?status=all&before=${org.deepOrders}`,
    ),
    read(
      'GET /orders/:id',
      (org, n) => `/orders/${org.orderIds[n % org.orderIds.length]}`,
    ),
    // The Inventory page makes these two together.
    read('GET /stock', () => '/stock'),
    read('GET /stock/availability', () => '/stock/availability'),
    read('GET /stock/movements', () => '/stock/movements'),
    read(
      'GET /stock/movements, page 21',
      (org) => `/stock/movements?before=${org.deepMovements}`,
    ),
    read(
      'GET /stock/movements?variantId',
      (org) => `/stock/movements?variantId=${org.hot[0].variantId}`,
    ),
    read('GET /invoices', () => '/invoices'),
  ];

  if (orgs.every((org) => org.anchors.traceLotId)) {
    scenarios.push(
      read(
        'GET /stock/lots/:id/trace',
        (org) => `/stock/lots/${org.anchors.traceLotId}/trace`,
      ),
    );
  }

  return scenarios;
}

// -----------------------------------------------------------------------------
// Writes: receive, ship, issue, credit, each connection with its own documents

interface Bench {
  org: Org;
  hot: Hot;
  sale: OpenOrder;
  purchase: OpenOrder;
  shipments: string[];
  drafts: { invoiceId: string; lineId: string }[];
  issued: { invoiceId: string; lineId: string }[];
}

/**
 * The four writes ADR-051 budgets, run as a chain: each step's output is
 * the next step's input. Shipments made by the shipping run are the ones
 * invoiced, and the invoices issued are the ones credited, so perf brings
 * its own documents and reruns on the same seed without using up anything
 * the seed wrote.
 *
 * Every connection gets its own sale and its own purchase, for its own
 * product where there are enough products to go round. Two connections
 * shipping one product queue on its lock (ADR-045); that is the
 * concurrency check's subject, not the budget's.
 */
export class WriteChain {
  private readonly benches: Bench[] = [];

  constructor(
    private readonly orgs: Org[],
    private readonly options: LoadOptions,
    private readonly tag: string,
  ) {}

  /** Untimed: stock enough to ship, and an open sale and purchase each. */
  async prepare(): Promise<void> {
    const { connections, requests, warmup } = this.options;

    const plan = Array.from({ length: connections }, (_, worker) => {
      const org = orgOf(this.orgs, worker);
      const slot = Math.floor(worker / this.orgs.length);

      return {
        worker,
        org,
        hot: org.hot[slot % org.hot.length],
        need:
          quota(requests, connections, worker) +
          quota(warmup, connections, worker),
      };
    });

    for (const org of this.orgs) {
      const demand = new Map<Hot, number>();

      for (const entry of plan.filter((candidate) => candidate.org === org)) {
        demand.set(entry.hot, (demand.get(entry.hot) ?? 0) + entry.need);
      }

      await ensureSupply(org, demand, this.tag);
    }

    await inParallel(plan, 10, async ({ worker, org, hot, need }) => {
      const reference = `PERF-${this.tag}-${worker}`;

      this.benches[worker] = {
        org,
        hot,
        sale: await openOrder(
          org,
          'sale',
          hot.variantId,
          need,
          `${reference}S`,
        ),
        purchase: await openOrder(
          org,
          'purchase',
          hot.variantId,
          need,
          `${reference}P`,
        ),
        shipments: [],
        drafts: [],
        issued: [],
      };
    });
  }

  /** One unit into a new lot on the dock: a receipt that creates a lot. */
  receive(): Scenario {
    return this.write('POST receipts (new lot)', (bench, worker, n) =>
      bench.org.session.send(
        'POST',
        `/orders/${bench.purchase.orderId}/lines/${bench.purchase.lineId}/receipts`,
        {
          toLocationId: bench.org.anchors.dockLocationId,
          quantity: '1',
          lot: {
            code: `PF-${this.tag}-${worker}-${n}`,
            expiresAt: calendarDay(365),
          },
        },
      ),
    );
  }

  /** One unit, lots left to the server: earliest expiry first (ADR-041). */
  ship(): Scenario {
    return this.write('POST shipments (FEFO)', async (bench) => {
      const response = await bench.org.session.send(
        'POST',
        `/orders/${bench.sale.orderId}/shipments`,
        {
          fromLocationId: bench.hot.locationId,
          lines: [{ lineId: bench.sale.lineId, quantity: '1' }],
        },
      );

      if (response.status === 201) {
        const { shipment } = JSON.parse(response.text) as {
          shipment: { id: string };
        };
        bench.shipments.push(shipment.id);
      }

      return response;
    });
  }

  /** Untimed: a draft for every shipment the shipping run made. */
  async draftInvoices(): Promise<void> {
    for (const bench of this.benches) {
      await inParallel(bench.shipments, 4, async (shipmentId) => {
        const { invoice } = await bench.org.session.json<{
          invoice: { id: string; lines: { id: string }[] };
        }>('POST', '/invoices', {
          shipmentId,
          taxCodeId: bench.org.anchors.taxCodeId,
        });

        bench.drafts.push({
          invoiceId: invoice.id,
          lineId: invoice.lines[0].id,
        });
      });
    }
  }

  issue(): Scenario {
    return this.write('POST invoices/:id/issue', async (bench, _worker, n) => {
      const draft = fixture(bench.drafts, n, 'draft');

      const response = await bench.org.session.send(
        'POST',
        `/invoices/${draft.invoiceId}/issue`,
        { invoiceDate: calendarDay() },
      );

      if (response.status === 200) bench.issued.push(draft);
      return response;
    });
  }

  /** A credit of one unit, no goods back: the path with nothing to wait on. */
  credit(): Scenario {
    return this.write('POST invoices/:id/credit-notes', (bench, _worker, n) => {
      const invoice = fixture(bench.issued, n, 'issued invoice');

      return bench.org.session.send(
        'POST',
        `/invoices/${invoice.invoiceId}/credit-notes`,
        {
          reason: 'Perf: price adjustment',
          creditDate: calendarDay(),
          lines: [{ invoiceLineId: invoice.lineId, quantity: '1' }],
        },
      );
    });
  }

  private write(
    name: string,
    send: (bench: Bench, worker: number, n: number) => ReturnType<Send>,
  ): Scenario {
    return {
      name,
      kind: 'write',
      budgetMs: WRITE_BUDGET_MS,
      send: (worker, n) => send(this.benches[worker], worker, n),
    };
  }
}

/**
 * The nth document an earlier step made. Missing means that step failed for
 * this request, and the failure is counted here too rather than hidden.
 */
function fixture<T>(items: T[], n: number, what: string): T {
  const item = items[n];
  if (!item) throw new Error(`No ${what} left: an earlier step failed`);
  return item;
}

// -----------------------------------------------------------------------------
// Concurrency (ADR-051): one product, several connections, stock adds up

/**
 * Ten connections ship one unit of the same product twenty times each,
 * spread over four orders, so connections also share orders. Passes when
 * every shipment succeeded, the shelf went down by exactly what shipped,
 * and each order's shipped quantity matches what went out against it.
 *
 * A deadlock surfaces as a 500 and fails it; so does a lost update, which
 * would show as stock and orders disagreeing.
 */
export async function concurrencyCheck(
  org: Org,
  tag: string,
): Promise<ConcurrencyResult> {
  const connections = 10;
  const perConnection = 20;
  const orderCount = 4;
  const hot = org.hot[0];

  const counts = Array.from({ length: orderCount }, (_, order) =>
    Array.from({ length: connections }).reduce<number>(
      (sum, _unused, worker) =>
        worker % orderCount === order ? sum + perConnection : sum,
      0,
    ),
  );
  const attempted = connections * perConnection;

  await ensureSupply(org, new Map([[hot, attempted]]), `${tag}C`);

  const orders: OpenOrder[] = [];
  for (const [index, count] of counts.entries()) {
    orders.push(
      await openOrder(
        org,
        'sale',
        hot.variantId,
        count,
        `PERF-${tag}-C${index}`,
      ),
    );
  }

  const before = await stockAt(org, hot);
  const shipped = counts.map(() => 0);

  const stats = await runLoad(
    async (worker) => {
      const index = worker % orderCount;
      const response = await org.session.send(
        'POST',
        `/orders/${orders[index].orderId}/shipments`,
        {
          fromLocationId: hot.locationId,
          lines: [{ lineId: orders[index].lineId, quantity: '1' }],
        },
      );

      if (response.status === 201) shipped[index]++;
      return response;
    },
    { connections, requests: attempted, warmup: 0 },
  );

  const after = await stockAt(org, hot);

  const fulfilled = await Promise.all(
    orders.map(async (order) => {
      const detail = await org.session.json<{
        lines: { id: string; quantityFulfilled: string }[];
      }>('GET', `/orders/${order.orderId}`);

      return detail.lines.find((line) => line.id === order.lineId)!
        .quantityFulfilled;
    }),
  );

  const totalShipped = shipped.reduce((sum, count) => sum + count, 0);
  const reasons: string[] = [];

  if (stats.errors > 0) {
    reasons.push(`${stats.errors} of ${attempted} shipments failed.`);
  }

  if (before - after !== toUnits(String(totalShipped))) {
    reasons.push(
      `Stock went from ${fromUnits(before)} to ${fromUnits(after)}, but ${totalShipped} shipped.`,
    );
  }

  orders.forEach((order, index) => {
    if (toUnits(fulfilled[index]) !== toUnits(String(shipped[index]))) {
      reasons.push(
        `${order.reference} says ${fulfilled[index]} shipped; ${shipped[index]} shipments succeeded.`,
      );
    }
  });

  return {
    passed: reasons.length === 0,
    connections,
    attempted,
    shipped: totalShipped,
    errors: stats.errors,
    errorSamples: stats.errorSamples,
    stockBefore: fromUnits(before),
    stockAfter: fromUnits(after),
    orders: orders.map((order, index) => ({
      reference: order.reference,
      shipped: shipped[index],
      fulfilled: fulfilled[index],
    })),
    reasons,
  };
}

// -----------------------------------------------------------------------------
// Set-up helpers

/**
 * Enough stock on each product's shelf for what perf will ship, received
 * if short. Free is what nobody holds; anything backordered is already
 * waiting for new stock and would take it first (ADR-045), so it is added
 * to the need. A tenth more on top, so a hold computed a moment later
 * never falls one unit short.
 */
async function ensureSupply(
  org: Org,
  demand: Map<Hot, number>,
  tag: string,
): Promise<void> {
  const availability = await org.session.json<
    { variantId: string; free: string; backordered: string }[]
  >('GET', '/stock/availability');

  const receipts: { hot: Hot; quantity: number }[] = [];

  for (const [hot, need] of demand) {
    const row = availability.find((entry) => entry.variantId === hot.variantId);
    const needed = toUnits(String(need));
    const free = row ? toUnits(row.free) : 0n;
    const backordered = row ? toUnits(row.backordered) : 0n;
    const onShelf = await stockAt(org, hot);

    const short = [needed + backordered - free, needed - onShelf].reduce(
      (a, b) => (a > b ? a : b),
    );

    if (short > 0n) {
      receipts.push({
        hot,
        quantity: wholeUnitsUp(short) + Math.ceil(need / 10),
      });
    }
  }

  if (receipts.length === 0) return;

  const { order } = await org.session.json<CreatedOrder>('POST', '/orders', {
    partnerId: org.anchors.supplierId,
    direction: 'purchase',
    reference: `PERF-${tag}-SUPPLY`,
    lines: receipts.map(({ hot, quantity }) => ({
      variantId: hot.variantId,
      quantityOrdered: String(quantity),
      unitPrice: '1.00',
      currency: 'CAD',
    })),
  });

  await org.session.json('PATCH', `/orders/${order.id}`, {
    status: 'confirmed',
  });

  for (const [index, { hot, quantity }] of receipts.entries()) {
    await org.session.json(
      'POST',
      `/orders/${order.id}/lines/${order.lines[index].id}/receipts`,
      {
        toLocationId: hot.locationId,
        quantity: String(quantity),
        lot: { code: `PS-${tag}-${index}`, expiresAt: calendarDay(400) },
      },
    );
  }
}

/** A confirmed one-line order, priced, ready to ship or receive against. */
async function openOrder(
  org: Org,
  direction: 'sale' | 'purchase',
  variantId: string,
  quantity: number,
  reference: string,
): Promise<OpenOrder> {
  const { order } = await org.session.json<CreatedOrder>('POST', '/orders', {
    partnerId:
      direction === 'sale' ? org.anchors.customerId : org.anchors.supplierId,
    direction,
    reference,
    lines: [
      {
        variantId,
        quantityOrdered: String(quantity),
        unitPrice: '10.00',
        currency: 'CAD',
      },
    ],
  });

  await org.session.json('PATCH', `/orders/${order.id}`, {
    status: 'confirmed',
  });

  return { orderId: order.id, lineId: order.lines[0].id, reference };
}

/** On hand for one product on one shelf, every lot, in exact units. */
async function stockAt(org: Org, hot: Hot): Promise<bigint> {
  const rows = await org.session.json<StockRow[]>(
    'GET',
    `/stock?variantId=${hot.variantId}&locationId=${hot.locationId}`,
  );
  return sumUnits(rows.map((row) => row.quantity));
}
