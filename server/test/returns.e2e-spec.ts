import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  lots,
  orderLines,
  stockLevels,
  stockMovements,
} from '../src/database/schema';
import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './utils/create-test-app';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface OrderResponse {
  id: string;
  lines: { id: string; variantId: string }[];
}

interface ReturnableResponse {
  lineId: string;
  sku: string;
  lots: { code: string; shipped: string; returned: string }[];
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * Customer returns (ADR-043). The rules worth pinning: a lot can come back
 * only if it shipped on this order, never more of it than went, and "shipped"
 * is left as it was while "returned" rises beside it.
 */
describe('Returns (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  const PASSWORD = 'correct-horse-battery';

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(ThrottlerStorage)
        .useValue(unlimitedThrottler)
        .overrideProvider(MailService)
        .useValue(new RecordingMailService()),
    );

    db = app.get<Database>(UNSAFE_GLOBAL_DB);
    await seedPermissions(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  async function registerOrg(slugish: string) {
    const agent = authedAgent(app);

    await agent
      .post('/v1/auth/register')
      .send({
        email: `owner@${slugish}.example.com`,
        password: PASSWORD,
        name: 'Owner',
        organizationName: `${slugish} Co`,
      })
      .expect(201);

    return { agent };
  }

  type Org = Awaited<ReturnType<typeof registerOrg>>;

  async function location(org: Org, name: string) {
    return body<{ location: { id: string } }>(
      await org.agent
        .post('/v1/locations')
        .send({ type: 'site', name })
        .expect(201),
    ).location.id;
  }

  async function variant(org: Org, sku: string, tracksLots: boolean) {
    return body<{ product: { variants: { id: string }[] } }>(
      await org.agent
        .post('/v1/products')
        .send({ type: 'good', name: sku, variant: { sku, tracksLots } })
        .expect(201),
    ).product.variants[0].id;
  }

  async function receive(
    org: Org,
    variantId: string,
    locationId: string,
    quantity: string,
    lot?: { code: string; expiresAt?: string },
  ) {
    await org.agent
      .post('/v1/stock/movements')
      .send({
        variantId,
        toLocationId: locationId,
        quantity,
        reason: 'receipt',
        lot,
      })
      .expect(201);
  }

  /**
   * A tracked supplement in three lots and an untracked scoop, a sale for 25
   * and 10, shipped in full: EARLY 10 and LATE 15 go out, OTHER stays home.
   * A Returns bin marked unavailable is where things come back to.
   */
  async function shipped(org: Org, direction: 'sale' | 'purchase' = 'sale') {
    const shelf = await location(org, 'Shelf');
    const bin = await location(org, 'Returns');

    await org.agent
      .patch(`/v1/locations/${bin}`)
      .send({ isAvailable: false })
      .expect(204);

    const partner = body<{ partner: { id: string } }>(
      await org.agent
        .post('/v1/partners')
        .send({ name: 'Northside Pharmacy', code: 'NORTH' })
        .expect(201),
    ).partner.id;

    const focus = await variant(org, 'FOCUS-60CT', true);
    const scoop = await variant(org, 'SCOOP', false);

    await receive(org, focus, shelf, '10', {
      code: 'EARLY',
      expiresAt: '2026-12-01',
    });
    await receive(org, focus, shelf, '20', {
      code: 'LATE',
      expiresAt: '2027-06-01',
    });
    await receive(org, focus, shelf, '5', {
      code: 'OTHER',
      expiresAt: '2028-01-01',
    });
    await receive(org, scoop, shelf, '50');

    const order = body<{ order: OrderResponse }>(
      await org.agent
        .post('/v1/orders')
        .send({
          partnerId: partner,
          direction,
          lines: [
            { variantId: focus, quantityOrdered: '25' },
            { variantId: scoop, quantityOrdered: '10' },
          ],
        })
        .expect(201),
    ).order;

    const lineOf = (variantId: string) =>
      order.lines.find((line) => line.variantId === variantId)!.id;

    if (direction === 'sale') {
      await org.agent
        .patch(`/v1/orders/${order.id}`)
        .send({ status: 'confirmed' })
        .expect(204);

      await org.agent
        .post(`/v1/orders/${order.id}/shipments`)
        .send({
          fromLocationId: shelf,
          lines: [
            { lineId: lineOf(focus), quantity: '25' },
            { lineId: lineOf(scoop), quantity: '10' },
          ],
        })
        .expect(201);
    }

    const lotId = async (code: string) =>
      (await db.select().from(lots).where(eq(lots.code, code)))[0].id;

    return {
      order,
      shelf,
      bin,
      focus,
      scoop,
      focusLine: lineOf(focus),
      scoopLine: lineOf(scoop),
      lotId,
    };
  }

  async function atBin(variantId: string, binId: string) {
    const rows = await db
      .select({ lotId: stockLevels.lotId, quantity: stockLevels.quantity })
      .from(stockLevels)
      .where(
        and(
          eq(stockLevels.variantId, variantId),
          eq(stockLevels.locationId, binId),
        ),
      );
    return rows;
  }

  async function line(lineId: string) {
    const [row] = await db
      .select()
      .from(orderLines)
      .where(eq(orderLines.id, lineId));
    return row;
  }

  describe('receiving a return', () => {
    it('takes back shipped lots and untracked stock, into an unavailable bin', async () => {
      const alpha = await registerOrg('alpha');
      const s = await shipped(alpha);

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/returns`)
        .send({
          toLocationId: s.bin,
          reason: 'damaged in transit',
          lines: [
            {
              lineId: s.focusLine,
              lots: [
                { lotId: await s.lotId('EARLY'), quantity: '2' },
                { lotId: await s.lotId('LATE'), quantity: '3' },
              ],
            },
            { lineId: s.scoopLine, quantity: '4' },
          ],
        })
        .expect(201);

      // Shipped stays as it was; returned rises beside it.
      const focusLine = await line(s.focusLine);
      expect(focusLine.quantityFulfilled).toBe('25.0000');
      expect(focusLine.quantityReturned).toBe('5.0000');
      expect((await line(s.scoopLine)).quantityReturned).toBe('4.0000');

      // The stock is back, by lot, in the bin nothing ships from.
      expect(await atBin(s.focus, s.bin)).toHaveLength(2);

      const returns = await db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.reason, 'return'));
      expect(returns).toHaveLength(3);
      expect(returns.every((row) => row.referenceType === 'order_return')).toBe(
        true,
      );
    });

    it('offers only the lots that shipped on this order', async () => {
      const alpha = await registerOrg('alpha');
      const s = await shipped(alpha);

      const lines = body<ReturnableResponse[]>(
        await alpha.agent
          .get(`/v1/orders/${s.order.id}/returns/returnable`)
          .expect(200),
      );

      const focus = lines.find((row) => row.sku === 'FOCUS-60CT')!;
      expect(focus.lots.map((lot) => [lot.code, lot.shipped])).toEqual([
        ['EARLY', '10.0000'],
        ['LATE', '15.0000'],
      ]);
    });

    // A return most often arrives after the order is done.
    it('accepts a return against a fulfilled order', async () => {
      const alpha = await registerOrg('alpha');
      const s = await shipped(alpha);

      await alpha.agent
        .patch(`/v1/orders/${s.order.id}`)
        .send({ status: 'fulfilled' })
        .expect(204);

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/returns`)
        .send({
          toLocationId: s.bin,
          lines: [{ lineId: s.scoopLine, quantity: '1' }],
        })
        .expect(201);
    });
  });

  describe('refusals', () => {
    it('refuses a lot that never shipped on this order', async () => {
      const alpha = await registerOrg('alpha');
      const s = await shipped(alpha);

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/returns`)
        .send({
          toLocationId: s.bin,
          lines: [
            {
              lineId: s.focusLine,
              lots: [{ lotId: await s.lotId('OTHER'), quantity: '1' }],
            },
          ],
        })
        .expect(400);

      expect(await atBin(s.focus, s.bin)).toHaveLength(0);
    });

    it('refuses more of a lot than shipped, counting earlier returns', async () => {
      const alpha = await registerOrg('alpha');
      const s = await shipped(alpha);
      const late = await s.lotId('LATE');

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/returns`)
        .send({
          toLocationId: s.bin,
          lines: [
            { lineId: s.focusLine, lots: [{ lotId: late, quantity: '10' }] },
          ],
        })
        .expect(201);

      // 15 shipped, 10 back already: 6 more is one too many.
      await alpha.agent
        .post(`/v1/orders/${s.order.id}/returns`)
        .send({
          toLocationId: s.bin,
          lines: [
            { lineId: s.focusLine, lots: [{ lotId: late, quantity: '6' }] },
          ],
        })
        .expect(409);
    });

    it('refuses more untracked stock than shipped', async () => {
      const alpha = await registerOrg('alpha');
      const s = await shipped(alpha);

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/returns`)
        .send({
          toLocationId: s.bin,
          lines: [{ lineId: s.scoopLine, quantity: '11' }],
        })
        .expect(409);

      expect((await line(s.scoopLine)).quantityReturned).toBe('0.0000');
    });

    it('asks for lots on a tracked line, and a quantity on an untracked one', async () => {
      const alpha = await registerOrg('alpha');
      const s = await shipped(alpha);

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/returns`)
        .send({
          toLocationId: s.bin,
          lines: [{ lineId: s.focusLine, quantity: '1' }],
        })
        .expect(400);

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/returns`)
        .send({
          toLocationId: s.bin,
          lines: [
            {
              lineId: s.scoopLine,
              lots: [{ lotId: await s.lotId('EARLY'), quantity: '1' }],
            },
          ],
        })
        .expect(400);
    });

    it('refuses a return against a purchase', async () => {
      const alpha = await registerOrg('alpha');
      const s = await shipped(alpha, 'purchase');

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/returns`)
        .send({
          toLocationId: s.bin,
          lines: [{ lineId: s.scoopLine, quantity: '1' }],
        })
        .expect(400);
    });

    it('does not find another organization order', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');
      const s = await shipped(beta);

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/returns`)
        .send({
          toLocationId: s.bin,
          lines: [{ lineId: s.scoopLine, quantity: '1' }],
        })
        .expect(404);
    });
  });
});
