import type { INestApplication } from '@nestjs/common';

import {
  body,
  createE2eApp,
  createLocation,
  createPartner,
  createVariant,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

interface Page<T> {
  entries: T[];
  nextCursor: string | null;
}

/**
 * Sorted lists (ADR-057, step 4): by the value, then id, rows with no value
 * last; paged by keyset after (value, id), so walking every page in either
 * order sees every row once. Columns not offered are refused.
 */
describe('Sorting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  type Org = Awaited<ReturnType<typeof registerOrganization>>;

  /** Every page of a list, two rows at a time, as the client walks it. */
  async function walk<T>(org: Org, path: string): Promise<T[]> {
    const rows: T[] = [];
    let before: string | null = null;
    for (let page = 0; page < 20; page++) {
      const join = path.includes('?') ? '&' : '?';
      const cursor: string = before ? `&before=${before}` : '';
      const res = body<Page<T>>(
        await org.agent.get(`${path}${join}limit=2${cursor}`).expect(200),
      );
      rows.push(...res.entries);
      if (!res.nextCursor) return rows;
      before = res.nextCursor;
    }
    throw new Error('more than twenty pages');
  }

  async function ordersExpected(org: Org) {
    const partner = await createPartner(org.agent, { name: 'Northside' });
    const variant = await createVariant(org.agent, {
      type: 'good',
      name: 'Focus 60ct',
      variant: { sku: 'FOCUS-60', tracksLots: false },
    });
    // Two share a date, one has none: ties and blanks both have to page.
    for (const [reference, expectedAt] of [
      ['PO-B', '2026-10-15'],
      ['PO-NONE', undefined],
      ['PO-A', '2026-10-01'],
      ['PO-C1', '2026-11-01'],
      ['PO-C2', '2026-11-01'],
    ] as const) {
      await org.agent
        .post('/v1/orders')
        .send({
          partnerId: partner,
          direction: 'purchase',
          reference,
          ...(expectedAt ? { expectedAt } : {}),
          lines: [{ variantId: variant, quantityOrdered: '1' }],
        })
        .expect(201);
    }
  }

  it('pages orders by expected date, ties by id, blanks last, either way', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await ordersExpected(alpha);

    type Row = { reference: string; expectedAt: string | null };

    const up = await walk<Row>(
      alpha,
      '/v1/orders?status=all&sort=expectedAt&order=asc',
    );
    expect(up.map((row) => row.reference)).toEqual([
      'PO-A',
      'PO-B',
      'PO-C1',
      'PO-C2',
      'PO-NONE',
    ]);

    const down = await walk<Row>(
      alpha,
      '/v1/orders?status=all&sort=expectedAt&order=desc',
    );
    expect(down.map((row) => row.reference)).toEqual([
      'PO-C2',
      'PO-C1',
      'PO-B',
      'PO-A',
      'PO-NONE',
    ]);
  });

  it('pages inventory by expiry, soonest first, stock without a lot last', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const location = await createLocation(alpha.agent, {
      type: 'site',
      name: 'Main',
    });
    const lotted = await createVariant(alpha.agent, {
      type: 'good',
      name: 'Focus 60ct',
      variant: { sku: 'FOCUS-60', tracksLots: true },
    });
    const plain = await createVariant(alpha.agent, {
      type: 'good',
      name: 'Boxes',
      variant: { sku: 'BOX', tracksLots: false },
    });
    for (const [code, expiresAt] of [
      ['LOT-LATE', '2027-06-01'],
      ['LOT-SOON', '2026-11-01'],
      ['LOT-MID', '2027-01-01'],
    ]) {
      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: lotted,
          toLocationId: location,
          quantity: '5',
          reason: 'receipt',
          lot: { code, expiresAt },
        })
        .expect(201);
    }
    await alpha.agent
      .post('/v1/stock/movements')
      .send({
        variantId: plain,
        toLocationId: location,
        quantity: '5',
        reason: 'receipt',
      })
      .expect(201);

    const rows = await walk<{ sku: string; lotCode: string | null }>(
      alpha,
      '/v1/stock?sort=expiry',
    );
    expect(rows.map((row) => row.lotCode ?? row.sku)).toEqual([
      'LOT-SOON',
      'LOT-MID',
      'LOT-LATE',
      'BOX',
    ]);
  });

  it.each([
    ['/v1/invoices?sort=invoiceDate&order=desc', '/v1/invoices?sort=number'],
    ['/v1/invoices?sort=total', '/v1/invoices?sort=total&order=sideways'],
    ['/v1/credit-notes?sort=creditDate', '/v1/credit-notes?sort=invoiceDate'],
    ['/v1/credit-notes?sort=total&order=desc', '/v1/credit-notes?sort=partner'],
    ['/v1/orders?status=all&sort=expectedAt', '/v1/orders?sort=reference'],
    ['/v1/stock?sort=expiry&order=desc', '/v1/stock?sort=quantity'],
  ])('reads %s and refuses an unoffered sort', async (good, bad) => {
    const alpha = await registerOrganization(app, 'alpha');

    await alpha.agent.get(good).expect(200);
    await alpha.agent.get(bad).expect(400);
  });

  it("refuses another organization's row as a sorted list's cursor", async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const beta = await registerOrganization(app, 'beta');
    await ordersExpected(alpha);
    const [first] = body<Page<{ id: string }>>(
      await alpha.agent.get('/v1/orders?status=all&limit=1').expect(200),
    ).entries;

    await beta.agent
      .get(`/v1/orders?status=all&sort=expectedAt&before=${first.id}`)
      .expect(400);
  });
});
