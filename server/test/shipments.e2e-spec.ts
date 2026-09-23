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
  lines: { id: string; variantId: string; quantityFulfilled: string }[];
}

interface ShipmentResponse {
  id: string;
  orderId: string;
}

interface ShipmentListItem {
  id: string;
  items: { sku: string; lotCode: string | null; quantity: string }[];
}

interface PlanResponse {
  lines: {
    lineId: string;
    sku: string;
    lots: { code: string; take: string; taken: boolean }[];
    shortBy: string | null;
    exceedsOutstanding: boolean;
  }[];
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * Shipping against sales orders (ADR-041). A shipment is a document: several
 * lines, several lots, one transaction. The assertions are about the ledger —
 * one movement per lot, earliest expiry first, oldest first where nothing
 * expires — and about all-or-nothing: a box that cannot be fully packed moves
 * nothing at all.
 */
describe('Shipments (e2e)', () => {
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

  async function variant(org: Org, sku: string, tracksLots: boolean) {
    const res = await org.agent
      .post('/v1/products')
      .send({ type: 'good', name: sku, variant: { sku, tracksLots } })
      .expect(201);

    return body<{ product: { variants: { id: string }[] } }>(res).product
      .variants[0].id;
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
   * A tracked supplement in three lots — one expiring soon, one later, one
   * that never expires — and an untracked accessory, both on one shelf, and a
   * confirmed sale for some of each.
   */
  async function scenario(
    org: Org,
    lines: { focus: string; bottle: string } = { focus: '25', bottle: '10' },
  ) {
    const partner = body<{ partner: { id: string } }>(
      await org.agent
        .post('/v1/partners')
        .send({ name: 'Northside Pharmacy', code: 'NORTH' })
        .expect(201),
    ).partner;

    const shelf = body<{ location: { id: string } }>(
      await org.agent
        .post('/v1/locations')
        .send({ type: 'site', name: 'Shelf' })
        .expect(201),
    ).location.id;

    const focus = await variant(org, 'FOCUS-60CT', true);
    const bottle = await variant(org, 'SCOOP', false);

    await receive(org, focus, shelf, '20', {
      code: 'LATE',
      expiresAt: '2027-06-01',
    });
    await receive(org, focus, shelf, '10', {
      code: 'EARLY',
      expiresAt: '2026-12-01',
    });
    await receive(org, focus, shelf, '50', { code: 'NEVER' });
    await receive(org, bottle, shelf, '100');

    const order = body<{ order: OrderResponse }>(
      await org.agent
        .post('/v1/orders')
        .send({
          partnerId: partner.id,
          direction: 'sale',
          lines: [
            { variantId: focus, quantityOrdered: lines.focus },
            { variantId: bottle, quantityOrdered: lines.bottle },
          ],
        })
        .expect(201),
    ).order;

    await org.agent
      .patch(`/v1/orders/${order.id}`)
      .send({ status: 'confirmed' })
      .expect(204);

    const lineOf = (variantId: string) =>
      order.lines.find((line) => line.variantId === variantId)!.id;

    return {
      partnerId: partner.id,
      shelf,
      focus,
      bottle,
      order,
      focusLine: lineOf(focus),
      bottleLine: lineOf(bottle),
    };
  }

  async function byLot(variantId: string, locationId: string) {
    const rows = await db
      .select({ code: lots.code, quantity: stockLevels.quantity })
      .from(stockLevels)
      .innerJoin(lots, eq(lots.id, stockLevels.lotId))
      .where(
        and(
          eq(stockLevels.variantId, variantId),
          eq(stockLevels.locationId, locationId),
        ),
      );

    return Object.fromEntries(rows.map((row) => [row.code, row.quantity]));
  }

  async function fulfilled(lineId: string) {
    const [line] = await db
      .select()
      .from(orderLines)
      .where(eq(orderLines.id, lineId));
    return line.quantityFulfilled;
  }

  async function shipmentMovements() {
    return db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.reason, 'shipment'));
  }

  describe('shipping', () => {
    it('ships several lines together, splitting a line across lots earliest expiry first', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const shipment = body<{ shipment: ShipmentResponse }>(
        await alpha.agent
          .post(`/v1/orders/${s.order.id}/shipments`)
          .send({
            fromLocationId: s.shelf,
            trackingNumber: 'CP123',
            lines: [
              { lineId: s.focusLine, quantity: '25' },
              { lineId: s.bottleLine, quantity: '10' },
            ],
          })
          .expect(201),
      ).shipment;

      // 25 needed: all 10 of EARLY, then 15 of LATE. NEVER is untouched.
      expect(await byLot(s.focus, s.shelf)).toEqual({
        EARLY: '0.0000',
        LATE: '5.0000',
        NEVER: '50.0000',
      });

      expect(await fulfilled(s.focusLine)).toBe('25.0000');
      expect(await fulfilled(s.bottleLine)).toBe('10.0000');

      // One movement per lot, plus one for the untracked line, each naming
      // the shipment — the forward half of the recall trail.
      const moved = await shipmentMovements();
      expect(moved).toHaveLength(3);
      expect(moved.every((row) => row.referenceId === shipment.id)).toBe(true);
    });

    /**
     * Oldest first where nothing expires: arrival order is the tie-breaker,
     * so non-perishable stock rotates without a setting.
     */
    it('takes lots without an expiry oldest first', async () => {
      const alpha = await registerOrg('alpha');

      const partner = body<{ partner: { id: string } }>(
        await alpha.agent
          .post('/v1/partners')
          .send({ name: 'Northside', code: 'N' })
          .expect(201),
      ).partner;
      const shelf = body<{ location: { id: string } }>(
        await alpha.agent
          .post('/v1/locations')
          .send({ type: 'site', name: 'Shelf' })
          .expect(201),
      ).location.id;
      const bolts = await variant(alpha, 'BOLT', true);

      await receive(alpha, bolts, shelf, '10', { code: 'FIRST' });
      await receive(alpha, bolts, shelf, '10', { code: 'SECOND' });

      const order = body<{ order: OrderResponse }>(
        await alpha.agent
          .post('/v1/orders')
          .send({
            partnerId: partner.id,
            direction: 'sale',
            lines: [{ variantId: bolts, quantityOrdered: '12' }],
          })
          .expect(201),
      ).order;
      await alpha.agent
        .patch(`/v1/orders/${order.id}`)
        .send({ status: 'confirmed' })
        .expect(204);

      await alpha.agent
        .post(`/v1/orders/${order.id}/shipments`)
        .send({
          fromLocationId: shelf,
          lines: [{ lineId: order.lines[0].id, quantity: '12' }],
        })
        .expect(201);

      expect(await byLot(bolts, shelf)).toEqual({
        FIRST: '0.0000',
        SECOND: '8.0000',
      });
    });

    it('ships a line in parts, and a second shipment continues it', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      for (const quantity of ['5', '5']) {
        await alpha.agent
          .post(`/v1/orders/${s.order.id}/shipments`)
          .send({
            fromLocationId: s.shelf,
            lines: [{ lineId: s.focusLine, quantity }],
          })
          .expect(201);
      }

      expect(await fulfilled(s.focusLine)).toBe('10.0000');
      // The bottle line was never sent, which is allowed.
      expect(await fulfilled(s.bottleLine)).toBe('0.0000');

      const listed = body<ShipmentListItem[]>(
        await alpha.agent.get(`/v1/orders/${s.order.id}/shipments`).expect(200),
      );
      expect(listed).toHaveLength(2);
      expect(
        listed[0].items.map(({ sku, lotCode, quantity }) => ({
          sku,
          lotCode,
          quantity,
        })),
      ).toEqual([{ sku: 'FOCUS-60CT', lotCode: 'EARLY', quantity: '5.0000' }]);
    });

    it('takes hand-picked lots instead of the default', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const [never] = await db
        .select()
        .from(lots)
        .where(eq(lots.code, 'NEVER'));

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/shipments`)
        .send({
          fromLocationId: s.shelf,
          lines: [
            {
              lineId: s.focusLine,
              quantity: '25',
              lots: [{ lotId: never.id, quantity: '25' }],
            },
          ],
        })
        .expect(201);

      expect((await byLot(s.focus, s.shelf)).NEVER).toBe('25.0000');
    });
  });

  describe('refusals', () => {
    /**
     * All or nothing. The bottle line can be covered, the supplement cannot —
     * so neither moves, and nothing is recorded as sent.
     */
    it('moves nothing when any line cannot be covered', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha, { focus: '500', bottle: '10' });

      const res = await alpha.agent
        .post(`/v1/orders/${s.order.id}/shipments`)
        .send({
          fromLocationId: s.shelf,
          lines: [
            { lineId: s.bottleLine, quantity: '10' },
            { lineId: s.focusLine, quantity: '500' },
          ],
        })
        .expect(409);

      expect((res.body as { message: string }).message).toContain('FOCUS-60CT');
      expect(await shipmentMovements()).toHaveLength(0);
      expect(await fulfilled(s.bottleLine)).toBe('0.0000');
    });

    it('refuses more than was ordered', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/shipments`)
        .send({
          fromLocationId: s.shelf,
          lines: [{ lineId: s.bottleLine, quantity: '11' }],
        })
        .expect(409);
    });

    it('refuses hand-picked lots that do not add up', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const [never] = await db
        .select()
        .from(lots)
        .where(eq(lots.code, 'NEVER'));

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/shipments`)
        .send({
          fromLocationId: s.shelf,
          lines: [
            {
              lineId: s.focusLine,
              quantity: '25',
              lots: [{ lotId: never.id, quantity: '5' }],
            },
          ],
        })
        .expect(400);
    });

    it('refuses a line sent twice in one shipment', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/shipments`)
        .send({
          fromLocationId: s.shelf,
          lines: [
            { lineId: s.bottleLine, quantity: '2' },
            { lineId: s.bottleLine, quantity: '3' },
          ],
        })
        .expect(400);
    });

    it('refuses to ship against a purchase', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const purchase = body<{ order: OrderResponse }>(
        await alpha.agent
          .post('/v1/orders')
          .send({
            partnerId: s.partnerId,
            direction: 'purchase',
            lines: [{ variantId: s.bottle, quantityOrdered: '5' }],
          })
          .expect(201),
      ).order;

      await alpha.agent
        .post(`/v1/orders/${purchase.id}/shipments`)
        .send({
          fromLocationId: s.shelf,
          lines: [{ lineId: purchase.lines[0].id, quantity: '1' }],
        })
        .expect(400);
    });

    it('does not find another organization order', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');
      const s = await scenario(beta);

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/shipments`)
        .send({
          fromLocationId: s.shelf,
          lines: [{ lineId: s.bottleLine, quantity: '1' }],
        })
        .expect(404);
    });
  });

  describe('preview', () => {
    it('shows the same pick without moving anything', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const plan = body<PlanResponse>(
        await alpha.agent
          .post(`/v1/orders/${s.order.id}/shipments/preview`)
          .send({
            fromLocationId: s.shelf,
            lines: [{ lineId: s.focusLine, quantity: '25' }],
          })
          .expect(200),
      );

      const [line] = plan.lines;
      expect(line.shortBy).toBeNull();
      expect(line.exceedsOutstanding).toBe(false);
      expect(
        line.lots.filter((lot) => lot.taken).map((lot) => [lot.code, lot.take]),
      ).toEqual([
        ['EARLY', '10.0000'],
        ['LATE', '15.0000'],
      ]);

      expect(await shipmentMovements()).toHaveLength(0);
    });

    it('flags a quantity beyond what is outstanding', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const plan = body<PlanResponse>(
        await alpha.agent
          .post(`/v1/orders/${s.order.id}/shipments/preview`)
          .send({
            fromLocationId: s.shelf,
            lines: [{ lineId: s.bottleLine, quantity: '11' }],
          })
          .expect(200),
      );

      expect(plan.lines[0].exceedsOutstanding).toBe(true);
    });
  });
});
