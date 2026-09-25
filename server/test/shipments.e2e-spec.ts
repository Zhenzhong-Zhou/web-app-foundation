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
  shipments,
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

interface TraceResponse {
  recipients: { partnerName: string | null; shipped: string }[];
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
            {
              variantId: focus,
              quantityOrdered: lines.focus,
              unitPrice: '10',
              currency: 'CAD',
            },
            {
              variantId: bottle,
              quantityOrdered: lines.bottle,
              unitPrice: '10',
              currency: 'CAD',
            },
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
            lines: [
              {
                variantId: bolts,
                quantityOrdered: '12',
                unitPrice: '10',
                currency: 'CAD',
              },
            ],
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

    it('returns everything a packing slip prints', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const shipment = body<{ shipment: ShipmentResponse }>(
        await alpha.agent
          .post(`/v1/orders/${s.order.id}/shipments`)
          .send({
            fromLocationId: s.shelf,
            carrier: 'Canada Post',
            lines: [
              { lineId: s.focusLine, quantity: '25' },
              { lineId: s.bottleLine, quantity: '10' },
            ],
          })
          .expect(201),
      ).shipment;

      const slip = body<{
        organizationName: string;
        carrier: string | null;
        order: { partnerName: string };
        items: { sku: string; lotCode: string | null; quantity: string }[];
      }>(
        await alpha.agent
          .get(`/v1/orders/${s.order.id}/shipments/${shipment.id}`)
          .expect(200),
      );

      expect(slip.organizationName).toBe('alpha Co');
      expect(slip.order.partnerName).toBe('Northside Pharmacy');
      expect(slip.carrier).toBe('Canada Post');

      // One row per SKU and lot; the untracked line has none.
      expect(
        slip.items.map((item) => [item.sku, item.lotCode, item.quantity]),
      ).toEqual([
        ['FOCUS-60CT', 'EARLY', '10.0000'],
        ['FOCUS-60CT', 'LATE', '15.0000'],
        ['SCOOP', null, '10.0000'],
      ]);
    });

    it('does not print another organization shipment', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');
      const s = await scenario(beta);

      const shipment = body<{ shipment: ShipmentResponse }>(
        await beta.agent
          .post(`/v1/orders/${s.order.id}/shipments`)
          .send({
            fromLocationId: s.shelf,
            lines: [{ lineId: s.bottleLine, quantity: '1' }],
          })
          .expect(201),
      ).shipment;

      await alpha.agent
        .get(`/v1/orders/${s.order.id}/shipments/${shipment.id}`)
        .expect(404);
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

  /**
   * Void undoes a shipment recorded before the box left (ADR-041). Nothing is
   * deleted: the shipment and its movements stay, adjustments put each lot
   * back where it left, and the lines reopen.
   */
  describe('voiding', () => {
    const REASON = 'Customer cancelled before pickup';

    /** 15 of the supplement (EARLY 10, LATE 5) and all 10 of the scoop. */
    async function shipSome(org: Org, s: Awaited<ReturnType<typeof scenario>>) {
      return body<{ shipment: ShipmentResponse }>(
        await org.agent
          .post(`/v1/orders/${s.order.id}/shipments`)
          .send({
            fromLocationId: s.shelf,
            lines: [
              { lineId: s.focusLine, quantity: '15' },
              { lineId: s.bottleLine, quantity: '10' },
            ],
          })
          .expect(201),
      ).shipment;
    }

    function voidOf(orderId: string, shipmentId: string) {
      return `/v1/orders/${orderId}/shipments/${shipmentId}/void`;
    }

    async function untracked(variantId: string, locationId: string) {
      const [row] = await db
        .select({ quantity: stockLevels.quantity })
        .from(stockLevels)
        .where(
          and(
            eq(stockLevels.variantId, variantId),
            eq(stockLevels.locationId, locationId),
          ),
        );
      return row.quantity;
    }

    it('puts every lot back where it left and reopens the lines', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);
      const shipment = await shipSome(alpha, s);

      await alpha.agent
        .post(voidOf(s.order.id, shipment.id))
        .send({ reason: REASON })
        .expect(204);

      expect(await byLot(s.focus, s.shelf)).toEqual({
        EARLY: '10.0000',
        LATE: '20.0000',
        NEVER: '50.0000',
      });
      expect(await untracked(s.bottle, s.shelf)).toBe('100.0000');

      expect(await fulfilled(s.focusLine)).toBe('0.0000');
      expect(await fulfilled(s.bottleLine)).toBe('0.0000');

      // The record stays, and its correction sits beside it.
      expect(await shipmentMovements()).toHaveLength(3);

      const reversals = await db
        .select()
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.reason, 'adjustment'),
            eq(stockMovements.referenceId, shipment.id),
          ),
        );

      expect(reversals).toHaveLength(3);
      expect(reversals.every((row) => row.note === REASON)).toBe(true);

      const [row] = await db
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipment.id));

      expect(row.voidedAt).not.toBeNull();
      expect(row.voidReason).toBe(REASON);
    });

    it('still lists what the voided shipment carried, once', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);
      const shipment = await shipSome(alpha, s);

      await alpha.agent
        .post(voidOf(s.order.id, shipment.id))
        .send({ reason: REASON })
        .expect(204);

      // The adjustments reference the same shipment. Counting them would
      // show 20 of EARLY on a slip that carried 10.
      const [listed] = body<ShipmentListItem[]>(
        await alpha.agent.get(`/v1/orders/${s.order.id}/shipments`).expect(200),
      );

      expect(
        listed.items.map(({ sku, lotCode, quantity }) => ({
          sku,
          lotCode,
          quantity,
        })),
      ).toEqual([
        { sku: 'FOCUS-60CT', lotCode: 'EARLY', quantity: '10.0000' },
        { sku: 'FOCUS-60CT', lotCode: 'LATE', quantity: '5.0000' },
        { sku: 'SCOOP', lotCode: null, quantity: '10.0000' },
      ]);
    });

    it('lets the order ship again', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);
      const shipment = await shipSome(alpha, s);

      await alpha.agent
        .post(voidOf(s.order.id, shipment.id))
        .send({ reason: REASON })
        .expect(204);

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/shipments`)
        .send({
          fromLocationId: s.shelf,
          lines: [{ lineId: s.bottleLine, quantity: '10' }],
        })
        .expect(201);

      expect(await fulfilled(s.bottleLine)).toBe('10.0000');
    });

    it('drops the customer from the lot trace', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);
      const shipment = await shipSome(alpha, s);

      const [early] = await db
        .select()
        .from(lots)
        .where(eq(lots.code, 'EARLY'));

      const trace = async () =>
        body<TraceResponse>(
          await alpha.agent.get(`/v1/stock/lots/${early.id}/trace`).expect(200),
        ).recipients;

      expect(await trace()).toHaveLength(1);

      await alpha.agent
        .post(voidOf(s.order.id, shipment.id))
        .send({ reason: REASON })
        .expect(204);

      // Nothing left, so a recall letter to Northside would be wrong.
      expect(await trace()).toHaveLength(0);
    });

    it('no longer counts as shipped for returns', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);
      const shipment = await shipSome(alpha, s);

      await alpha.agent
        .post(voidOf(s.order.id, shipment.id))
        .send({ reason: REASON })
        .expect(204);

      const [early] = await db
        .select()
        .from(lots)
        .where(eq(lots.code, 'EARLY'));

      // Refused as never shipped, not merely as too much: the returns check
      // reads only shipments that stand.
      await alpha.agent
        .post(`/v1/orders/${s.order.id}/returns`)
        .send({
          toLocationId: s.shelf,
          lines: [
            { lineId: s.focusLine, lots: [{ lotId: early.id, quantity: '1' }] },
          ],
        })
        .expect(400);
    });

    it('refuses to void the same shipment twice', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);
      const shipment = await shipSome(alpha, s);

      await alpha.agent
        .post(voidOf(s.order.id, shipment.id))
        .send({ reason: REASON })
        .expect(204);

      await alpha.agent
        .post(voidOf(s.order.id, shipment.id))
        .send({ reason: REASON })
        .expect(409);

      // Put back once, not twice.
      expect(await byLot(s.focus, s.shelf)).toMatchObject({
        EARLY: '10.0000',
      });
    });

    it('requires a reason', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);
      const shipment = await shipSome(alpha, s);

      await alpha.agent
        .post(voidOf(s.order.id, shipment.id))
        .send({ reason: '   ' })
        .expect(400);
    });

    /**
     * Goods that came back did leave. Voiding would leave the order saying
     * more was returned than shipped.
     */
    it('refuses once a lot from it has been returned, and moves nothing', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);
      const shipment = await shipSome(alpha, s);

      const [early] = await db
        .select()
        .from(lots)
        .where(eq(lots.code, 'EARLY'));

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/returns`)
        .send({
          toLocationId: s.shelf,
          lines: [
            { lineId: s.focusLine, lots: [{ lotId: early.id, quantity: '2' }] },
          ],
        })
        .expect(201);

      await alpha.agent
        .post(voidOf(s.order.id, shipment.id))
        .send({ reason: REASON })
        .expect(409);

      expect(await fulfilled(s.focusLine)).toBe('15.0000');
      expect(await byLot(s.focus, s.shelf)).toMatchObject({
        EARLY: '2.0000',
        LATE: '15.0000',
      });
    });

    it('refuses once an untracked item from it has been returned', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);
      const shipment = await shipSome(alpha, s);

      await alpha.agent
        .post(`/v1/orders/${s.order.id}/returns`)
        .send({
          toLocationId: s.shelf,
          lines: [{ lineId: s.bottleLine, quantity: '4' }],
        })
        .expect(201);

      // No lot to compare, so the line constraint is what refuses it.
      await alpha.agent
        .post(voidOf(s.order.id, shipment.id))
        .send({ reason: REASON })
        .expect(409);

      expect(await untracked(s.bottle, s.shelf)).toBe('94.0000');
    });

    it('refuses on a closed order', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);
      const shipment = await shipSome(alpha, s);

      await alpha.agent
        .patch(`/v1/orders/${s.order.id}`)
        .send({ status: 'fulfilled' })
        .expect(204);

      // A closed order is a finished document; voiding must not reopen it
      // by the back door (ADR-023).
      await alpha.agent
        .post(voidOf(s.order.id, shipment.id))
        .send({ reason: REASON })
        .expect(409);
    });

    it('does not find another organization shipment', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');
      const s = await scenario(alpha);
      const shipment = await shipSome(alpha, s);

      await beta.agent
        .post(voidOf(s.order.id, shipment.id))
        .send({ reason: REASON })
        .expect(404);
    });
  });
});
