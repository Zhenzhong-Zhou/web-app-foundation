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
 * Date ranges on the lists (ADR-057, step 2): calendar days with `from` and
 * `to` both included, instants with `from` included and `until` excluded,
 * either end open, combined with the list's other filters.
 */
describe('Date ranges (e2e)', () => {
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

  async function refs(org: Org, query: string) {
    const page = body<Page<{ reference: string | null }>>(
      await org.agent.get(`/v1/orders?status=all&${query}`).expect(200),
    );
    return page.entries.map((row) => row.reference).sort();
  }

  it('narrows orders to an expected-date range, both days included', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const partner = await createPartner(alpha.agent, { name: 'Northside' });
    const variant = await createVariant(alpha.agent, {
      type: 'good',
      name: 'Focus 60ct',
      variant: { sku: 'FOCUS-60', tracksLots: false },
    });
    for (const [reference, expectedAt] of [
      ['PO-AUG', '2026-08-31'],
      ['PO-SEP-1', '2026-09-01'],
      ['PO-SEP-30', '2026-09-30'],
      ['PO-OCT', '2026-10-01'],
    ]) {
      await alpha.agent
        .post('/v1/orders')
        .send({
          partnerId: partner,
          direction: 'purchase',
          reference,
          expectedAt,
          lines: [{ variantId: variant, quantityOrdered: '1' }],
        })
        .expect(201);
    }

    expect(await refs(alpha, 'from=2026-09-01&to=2026-09-30')).toEqual([
      'PO-SEP-1',
      'PO-SEP-30',
    ]);
    // Open at either end.
    expect(await refs(alpha, 'from=2026-09-30')).toEqual([
      'PO-OCT',
      'PO-SEP-30',
    ]);
    expect(await refs(alpha, 'to=2026-08-31')).toEqual(['PO-AUG']);
    // With the search as well.
    expect(await refs(alpha, 'from=2026-09-01&search=sep-30')).toEqual([
      'PO-SEP-30',
    ]);
  });

  it('narrows movements to instants, until excluded', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const location = await createLocation(alpha.agent, {
      type: 'site',
      name: 'Main',
    });
    const variant = await createVariant(alpha.agent, {
      type: 'good',
      name: 'Focus 60ct',
      variant: { sku: 'FOCUS-60', tracksLots: false },
    });
    await alpha.agent
      .post('/v1/stock/movements')
      .send({
        variantId: variant,
        toLocationId: location,
        quantity: '5',
        reason: 'receipt',
      })
      .expect(201);

    const count = async (query: string) =>
      body<Page<unknown>>(
        await alpha.agent.get(`/v1/stock/movements?${query}`).expect(200),
      ).entries.length;

    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const inAnHour = new Date(Date.now() + 3_600_000).toISOString();

    expect(await count(`from=${hourAgo}&until=${inAnHour}`)).toBe(1);
    expect(await count(`from=${inAnHour}`)).toBe(0);
    expect(await count(`until=${hourAgo}`)).toBe(0);
  });

  it.each([
    ['/v1/orders?status=all', 'from=2026-09-01&to=2026-09-30', 'to=2026-02-30'],
    ['/v1/invoices', 'from=2026-09-01&to=2026-09-30', 'from=yesterday'],
    ['/v1/credit-notes', 'from=2026-07-01&to=2026-09-30', 'to=30/09/2026'],
    [
      '/v1/return-authorizations',
      'from=2026-09-01T00:00:00Z&until=2026-10-01T00:00:00Z',
      'until=soon',
    ],
    [
      '/v1/production-orders',
      'from=2026-09-01T00:00:00Z&until=2026-10-01T00:00:00Z',
      'from=2026-13-01T00:00:00Z',
    ],
  ])('reads and validates the range on %s', async (path, good, bad) => {
    const alpha = await registerOrganization(app, 'alpha');
    const join = path.includes('?') ? '&' : '?';

    await alpha.agent.get(`${path}${join}${good}`).expect(200);
    await alpha.agent.get(`${path}${join}${bad}`).expect(400);
  });
});
