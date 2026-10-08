import type { INestApplication } from '@nestjs/common';

import {
  body,
  createE2eApp,
  createPartner,
  createVariant,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

interface Page<T> {
  entries: T[];
  nextCursor: string | null;
}

interface OrderRow {
  reference: string | null;
  partnerName: string;
}

/**
 * Search on the lists (ADR-056, step 4): each list narrowed by `search`,
 * matched as every search is (common/search.ts), with its other filters
 * and paging unchanged. The orders list carries the cases that need data;
 * the rest prove the parameter is read, validated and runs.
 */
describe('List search (e2e)', () => {
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

  async function order(
    org: Org,
    partnerId: string,
    variantId: string,
    reference: string,
  ) {
    await org.agent
      .post('/v1/orders')
      .send({
        partnerId,
        direction: 'purchase',
        reference,
        lines: [{ variantId, quantityOrdered: '10' }],
      })
      .expect(201);
  }

  async function orderRefs(org: Org, search: string) {
    const page = body<Page<OrderRow>>(
      await org.agent
        .get(`/v1/orders?status=all&search=${encodeURIComponent(search)}`)
        .expect(200),
    );
    return page.entries.map((row) => row.reference).sort();
  }

  it('finds orders by part of their reference or their partner, in any script', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const variant = await createVariant(alpha.agent, {
      type: 'good',
      name: 'Focus 60ct',
      variant: { sku: 'FOCUS-60', tracksLots: false },
    });
    const northside = await createPartner(alpha.agent, {
      name: 'Northside Pharmacy',
    });
    const mingde = await createPartner(alpha.agent, { name: '明德药房' });
    const laurent = await createPartner(alpha.agent, {
      name: 'Pharmacie Saint-Laurent',
    });

    await order(alpha, northside, variant, 'PO-1001');
    await order(alpha, mingde, variant, 'PO-2002');
    await order(alpha, laurent, variant, 'PO-3003');

    // Part of the reference, case ignored.
    expect(await orderRefs(alpha, 'po-100')).toEqual(['PO-1001']);
    // The partner's name, without its accents or capitals.
    expect(await orderRefs(alpha, 'saint laurent')).toEqual(['PO-3003']);
    // A Chinese partner by characters, by pinyin and by initials.
    expect(await orderRefs(alpha, '明德')).toEqual(['PO-2002']);
    expect(await orderRefs(alpha, 'mingde')).toEqual(['PO-2002']);
    expect(await orderRefs(alpha, 'mdyf')).toEqual(['PO-2002']);
    // Nothing matches: an empty page, not an error.
    expect(await orderRefs(alpha, 'nothing-like-this')).toEqual([]);
  });

  it("never finds another organization's orders", async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const beta = await registerOrganization(app, 'beta');
    const variant = await createVariant(alpha.agent, {
      type: 'good',
      name: 'Focus 60ct',
      variant: { sku: 'FOCUS-60', tracksLots: false },
    });
    const partner = await createPartner(alpha.agent, { name: 'Northside' });
    await order(alpha, partner, variant, 'PO-1001');

    expect(await orderRefs(beta, '1001')).toEqual([]);
    expect(await orderRefs(beta, 'northside')).toEqual([]);
  });

  it.each([
    '/v1/orders?status=all',
    '/v1/invoices',
    '/v1/return-authorizations',
    '/v1/production-orders',
    '/v1/credit-notes',
  ])('reads and validates search on %s', async (path) => {
    const alpha = await registerOrganization(app, 'alpha');

    const page = body<Page<unknown>>(
      await alpha.agent
        .get(`${path}${path.includes('?') ? '&' : '?'}search=zz%25_top`)
        .expect(200),
    );
    expect(page.entries).toEqual([]);

    await alpha.agent
      .get(`${path}${path.includes('?') ? '&' : '?'}search=${'x'.repeat(101)}`)
      .expect(400);
  });
});
