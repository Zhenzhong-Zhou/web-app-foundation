import type { INestApplication } from '@nestjs/common';

import { NotificationsService } from '../src/core/notifications/notifications.service';
import { LowStockNoticesService } from '../src/modules/stock/low-stock-notices.service';
import {
  addMember,
  addViewer,
  body,
  createE2eApp,
  customRole,
  registerOrganization,
} from './utils/fixtures';
import {
  item,
  order,
  partner,
  point,
  receive,
  site,
} from './utils/reorder-world';
import { resetDatabase } from './utils/reset-db';
import { KIRITIMATI } from './utils/time-zones';

type Agent = Awaited<ReturnType<typeof registerOrganization>>['agent'];

interface Notice {
  type: string;
  title: string;
  body: string | null;
  resourceType: string | null;
  resourceId: string | null;
}

/** What every role holds (ADR-080), beside what a test gives it. */
const EVERY_ROLE = ['users.view', 'roles.view', 'organizations.view'];

/**
 * Low stock in the bell (ADR-085): hourly, each fall below a reorder
 * point told once, to whoever can see stock and order the item or plan
 * its run, one notice per person per check, in their language.
 */
describe('Low stock notices (e2e)', () => {
  let app: INestApplication;
  let notices: LowStockNoticesService;
  const now = new Date('2026-10-31T12:00:00Z');

  beforeAll(async () => {
    app = await createE2eApp();
    notices = app.get(LowStockNoticesService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  async function bell(agent: Agent, language = 'en'): Promise<Notice[]> {
    const { entries } = body<{ entries: Notice[] }>(
      await agent
        .get('/v1/notifications')
        .set('Accept-Language', language)
        .expect(200),
    );
    return entries.filter((entry) => entry.type === 'stock.low');
  }

  /** An item with so much on the shelf and a point of 100: low below it. */
  async function stocked(
    agent: Agent,
    shelf: string,
    sku: string,
    onHand: string,
    source: 'bought' | 'made' = 'bought',
  ): Promise<string> {
    const id = await item(agent, sku);
    if (onHand !== '0') await receive(agent, id, shelf, onHand);
    await point(agent, id, '100', undefined, source);
    return id;
  }

  it('tells of a fall once, not again while low, and again after it recovers', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const shelf = await site(alpha.agent, 'SHELF');
    const focus = await stocked(alpha.agent, shelf, 'FOCUS-60CT', '50');

    expect(await notices.check(now)).toBe(1);
    expect(await notices.check(now)).toBe(0);
    expect(await bell(alpha.agent)).toEqual([
      expect.objectContaining({
        title: 'FOCUS-60CT is low on stock',
        body: 'FOCUS-60CT. Raise a purchase order from Reorder points.',
        // The list, which the bell opens filtered to Low.
        resourceType: 'reorder_points',
        resourceId: null,
      }),
    ]);

    // Back above its point: nobody is told, and the claim clears.
    await receive(alpha.agent, focus, shelf, '100');
    expect(await notices.check(now)).toBe(0);

    // A sale needs 100 of the 150: below again, and told again.
    const customer = await partner(alpha.agent, 'Customer');
    await order(alpha.agent, 'sale', customer, focus, '100');
    expect(await notices.check(now)).toBe(1);
    expect(await bell(alpha.agent)).toHaveLength(2);
  });

  it('tells each person once, of the items they can act on, and what to do with them', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const shelf = await site(alpha.agent, 'SHELF');
    // The furthest below their point first: out, then a tenth, a fifth.
    await stocked(alpha.agent, shelf, 'CALM-90', '0');
    await stocked(alpha.agent, shelf, 'CAP-38MM', '10');
    await stocked(alpha.agent, shelf, 'LID-38MM', '20');
    await stocked(alpha.agent, shelf, 'SAMPLE-BAG', '30', 'made');
    await stocked(alpha.agent, shelf, 'SCOOP-BAG', '40', 'made');

    await customRole(app, alpha.organizationId, 'Buyer', [
      ...EVERY_ROLE,
      'stock.view',
      'orders.create',
      'orders.view_prices',
      'orders.view',
      'partners.view',
      'products.view',
    ]);
    await customRole(app, alpha.organizationId, 'Maker', [
      ...EVERY_ROLE,
      'stock.view',
      'production.create',
      'production.view',
      'products.view',
      'locations.view',
    ]);
    // Raises orders, but cannot open the list the notice opens.
    await customRole(app, alpha.organizationId, 'Sales clerk', [
      ...EVERY_ROLE,
      'orders.create',
      'orders.view_prices',
      'orders.view',
      'partners.view',
      'products.view',
    ]);
    const buyer = await addMember(
      app,
      alpha,
      'buyer@alpha.example.com',
      'Buyer',
    );
    const maker = await addMember(
      app,
      alpha,
      'maker@alpha.example.com',
      'Maker',
    );
    const clerk = await addMember(
      app,
      alpha,
      'clerk@alpha.example.com',
      'Sales clerk',
    );
    const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');

    // Another organization's items, told to its own people alone.
    const beta = await registerOrganization(app, 'beta');
    const betaShelf = await site(beta.agent, 'SHELF');
    await stocked(beta.agent, betaShelf, 'BETA-1', '5');
    await stocked(beta.agent, betaShelf, 'BETA-2', '6');

    expect(await notices.check(now)).toBe(7);

    // Bought and made: either.
    expect(await bell(alpha.agent)).toEqual([
      expect.objectContaining({
        title: '5 items are low on stock',
        body: 'CALM-90, CAP-38MM and 3 more. Order or plan them from Reorder points.',
      }),
    ]);
    // Three are all named: "and 1 more" would be no shorter.
    expect(await bell(buyer)).toEqual([
      expect.objectContaining({
        title: '3 items are low on stock',
        body: 'CALM-90, CAP-38MM and LID-38MM. Order them from Reorder points.',
      }),
    ]);
    expect(await bell(maker)).toEqual([
      expect.objectContaining({
        title: '2 items are low on stock',
        body: 'SAMPLE-BAG and SCOOP-BAG. Plan them from Reorder points.',
      }),
    ]);
    expect(await bell(clerk)).toEqual([]);
    expect(await bell(viewer)).toEqual([]);
    // The Owner may plan runs too, but both items are bought.
    expect(await bell(beta.agent)).toEqual([
      expect.objectContaining({
        title: '2 items are low on stock',
        body: 'BETA-1 and BETA-2. Order them from Reorder points.',
      }),
    ]);
  });

  it('names the item in the reader’s language', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await alpha.agent
      .patch('/v1/account/profile')
      .send({ locale: 'zh-Hans' })
      .expect(204);
    const { product } = body<{
      product: { id: string; variants: { id: string }[] };
    }>(
      await alpha.agent
        .post('/v1/products')
        .send({
          type: 'good',
          name: 'Focus',
          variant: { sku: 'FOCUS-60CT', name: '60ct' },
        })
        .expect(201),
    );
    const variantId = product.variants[0].id;
    await alpha.agent
      .put(`/v1/products/${product.id}/translations`)
      .send({ translations: [{ locale: 'zh-Hans', name: '专注胶囊' }] })
      .expect(204);
    await alpha.agent
      .put(`/v1/products/${product.id}/variants/${variantId}/translations`)
      .send({ translations: [{ locale: 'zh-Hans', name: '60粒' }] })
      .expect(204);
    await point(alpha.agent, variantId, '100', undefined, 'made');

    expect(await notices.check(now)).toBe(1);
    expect(await bell(alpha.agent, 'zh-Hans')).toEqual([
      expect.objectContaining({
        title: 'FOCUS-60CT 库存不足',
        body: '专注胶囊 (60粒)。请在“库存下限”中计划生产订单。',
      }),
    ]);
  });

  /**
   * Claimed before telling, in a statement of its own: a telling that
   * fails leaves the fall claimed, and a missed notice is the lesser loss
   * than a repeated one (ADR-036, ADR-064).
   */
  it('does not tell again of a fall whose telling failed', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await stocked(
      alpha.agent,
      await site(alpha.agent, 'SHELF'),
      'D3-1000',
      '50',
    );
    vi.spyOn(app.get(NotificationsService), 'emit').mockRejectedValueOnce(
      new Error('The bell is down'),
    );

    expect(await notices.check(now)).toBe(0);
    expect(await notices.check(now)).toBe(0);
    expect(await bell(alpha.agent)).toEqual([]);
  });

  // One organization's failure is its own: the rest are still told.
  it('tells the other organizations when telling one fails', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const beta = await registerOrganization(app, 'beta');
    for (const org of [alpha, beta]) {
      await stocked(org.agent, await site(org.agent, 'SHELF'), 'D3-1000', '50');
    }
    const service = app.get(NotificationsService);
    const emit = vi.spyOn(service, 'emit').mockImplementation(async (rows) => {
      if (rows.some((row) => row.organizationId === alpha.organizationId))
        throw new Error('The bell is down');
      await NotificationsService.prototype.emit.call(service, rows);
    });

    try {
      expect(await notices.check(now)).toBe(1);
    } finally {
      emit.mockRestore();
    }
    expect(await bell(alpha.agent)).toEqual([]);
    expect(await bell(beta.agent)).toHaveLength(1);
  });

  /**
   * Usable stock leaves out the lots expired by the organization's today
   * (ADR-072). At noon UTC on 1 January 2030 it is already the 2nd in
   * Kiritimati: a lot whose last day is the 1st still counts in UTC, and
   * has expired there.
   */
  it('reads each organization’s position on its own day', async () => {
    const utc = await registerOrganization(app, 'alpha');
    const ahead = await registerOrganization(app, 'beta');
    await ahead.agent
      .patch('/v1/organization')
      .send({ timeZone: KIRITIMATI })
      .expect(204);
    for (const { agent } of [utc, ahead]) {
      const d3 = await item(agent, 'D3-1000', true);
      await receive(agent, d3, await site(agent, 'SHELF'), '500', {
        code: 'L-1',
        expiresAt: '2030-01-01',
      });
      await point(agent, d3, '100');
    }

    expect(await notices.check(new Date('2030-01-01T12:00:00Z'))).toBe(1);
    expect(await bell(utc.agent)).toEqual([]);
    expect(await bell(ahead.agent)).toHaveLength(1);
  });
});
