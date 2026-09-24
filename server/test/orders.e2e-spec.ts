import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  auditLog,
  notifications,
  orderLines,
  orders,
  roles,
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
  direction: string;
  status: string;
  lines: {
    id: string;
    sku: string;
    quantityOrdered: string;
    quantityFulfilled: string;
  }[];
}

interface OrderPage {
  entries: OrderResponse[];
  nextCursor: string | null;
}

interface RegisterResponse {
  user: { id: string; organizationId: string };
}

interface OrderResponse {
  id: string;
  partnerId: string;
  direction: string;
  status: string;
  reference: string | null;
  expectedAt: string | null;
  duplicatedFromId: string | null;
  lines: {
    id: string;
    sku: string;
    quantityOrdered: string;
    quantityFulfilled: string;
  }[];
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * The receipt path is what this module exists to prove: a movement with a
 * reference and a fulfilment increment, in one transaction (ADR-027). Most of
 * the rest is the transition table and the invariants around it.
 */
describe('Orders (e2e)', () => {
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

  async function roleIdNamed(organizationId: string, name: string) {
    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(eq(roles.organizationId, organizationId), eq(roles.name, name)),
      );

    return role.id;
  }

  async function registerOrg(slugish: string) {
    const agent = authedAgent(app);

    const res = await agent
      .post('/v1/auth/register')
      .send({
        email: `owner@${slugish}.example.com`,
        password: PASSWORD,
        name: 'Owner',
        organizationName: `${slugish} Co`,
      })
      .expect(201);

    return {
      agent,
      organizationId: body<RegisterResponse>(res).user.organizationId,
    };
  }

  async function addViewer(
    owner: Awaited<ReturnType<typeof registerOrg>>,
    email: string,
  ) {
    await owner.agent
      .post('/v1/users')
      .send({
        email,
        name: 'Viewer',
        password: PASSWORD,
        roleId: await roleIdNamed(owner.organizationId, 'Viewer'),
      })
      .expect(201);

    const viewer = authedAgent(app);
    await viewer
      .post('/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return viewer;
  }

  /** A partner, a variant, and a leaf location — everything an order needs. */
  async function setup(
    slugish: string,
    options: { tracksLots?: boolean } = {},
  ) {
    const org = await registerOrg(slugish);

    const partner = body<{ partner: { id: string } }>(
      await org.agent
        .post('/v1/partners')
        .send({ name: 'Acme Supplies', code: 'ACME-01' })
        .expect(201),
    ).partner;

    const product = body<{
      product: { variants: { id: string; sku: string }[] };
    }>(
      await org.agent
        .post('/v1/products')
        .send({
          type: 'good',
          name: 'Widget',
          variant: { sku: 'WIDGET-1', tracksLots: options.tracksLots ?? false },
        })
        .expect(201),
    ).product;

    const location = body<{ location: { id: string } }>(
      await org.agent
        .post('/v1/locations')
        .send({ type: 'site', name: 'Main' })
        .expect(201),
    ).location;

    return {
      ...org,
      partnerId: partner.id,
      variant: product.variants[0],
      locationId: location.id,
    };
  }

  function purchase(partnerId: string, variantId: string, quantity = '40') {
    return {
      partnerId,
      direction: 'purchase',
      lines: [{ variantId, quantityOrdered: quantity }],
    };
  }

  async function confirmed(ctx: Awaited<ReturnType<typeof setup>>) {
    const order = body<{ order: OrderResponse }>(
      await ctx.agent
        .post('/v1/orders')
        .send(purchase(ctx.partnerId, ctx.variant.id))
        .expect(201),
    ).order;

    await ctx.agent
      .patch(`/v1/orders/${order.id}`)
      .send({ status: 'confirmed' })
      .expect(204);

    return order;
  }

  describe('POST /v1/orders', () => {
    it('creates the order and its lines together, snapshotting the SKU', async () => {
      const ctx = await setup('alpha');

      const res = await ctx.agent
        .post('/v1/orders')
        .send(purchase(ctx.partnerId, ctx.variant.id))
        .expect(201);

      const order = body<{ order: OrderResponse }>(res).order;

      expect(order.status).toBe('draft');
      expect(order.lines).toHaveLength(1);
      expect(order.lines[0].quantityFulfilled).toBe('0.0000');

      // Snapshotted, so a rename affects the catalogue and nothing historical
      // (ADR-023).
      expect(order.lines[0].sku).toBe('WIDGET-1');
    });

    it('rejects an order with no lines', async () => {
      const ctx = await setup('alpha');

      // A document that orders nothing. The header and lines are one
      // transaction for the same reason (ADR-027).
      await ctx.agent
        .post('/v1/orders')
        .send({ partnerId: ctx.partnerId, direction: 'purchase', lines: [] })
        .expect(400);

      expect(await db.select().from(orders)).toHaveLength(0);
    });

    it('rejects the same variant twice and leaves no order behind', async () => {
      const ctx = await setup('alpha');

      await ctx.agent
        .post('/v1/orders')
        .send({
          partnerId: ctx.partnerId,
          direction: 'purchase',
          lines: [
            { variantId: ctx.variant.id, quantityOrdered: '10' },
            { variantId: ctx.variant.id, quantityOrdered: '5' },
          ],
        })
        .expect(409);

      // The rollback. Two lines for one item make "how much did we order"
      // ambiguous, and amending the quantity is what editing is for.
      expect(await db.select().from(orders)).toHaveLength(0);
    });

    it('refuses a retired partner', async () => {
      const ctx = await setup('alpha');

      await ctx.agent
        .patch(`/v1/partners/${ctx.partnerId}`)
        .send({ isActive: false })
        .expect(204);

      // Retired partners stay in the directory and take no new orders — the
      // whole point of retiring rather than deleting (ADR-026).
      await ctx.agent
        .post('/v1/orders')
        .send(purchase(ctx.partnerId, ctx.variant.id))
        .expect(409);
    });

    it('refuses a partner from another organization', async () => {
      const alpha = await setup('alpha');
      const beta = await setup('beta');

      await alpha.agent
        .post('/v1/orders')
        .send(purchase(beta.partnerId, alpha.variant.id))
        .expect(400);
    });

    it('refuses a Viewer, which lacks orders.create', async () => {
      const ctx = await setup('alpha');
      const viewer = await addViewer(ctx, 'viewer@alpha.example.com');

      await viewer
        .post('/v1/orders')
        .send(purchase(ctx.partnerId, ctx.variant.id))
        .expect(403);
    });
  });

  describe('POST /v1/orders/:id/duplicate', () => {
    it('copies the lines into a fresh draft and links back', async () => {
      const ctx = await setup('alpha');

      const original = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send({
            ...purchase(ctx.partnerId, ctx.variant.id),
            reference: 'PO-1234',
            expectedAt: '2026-01-01T00:00:00.000Z',
          })
          .expect(201),
      ).order;

      await ctx.agent
        .patch(`/v1/orders/${original.id}`)
        .send({ status: 'confirmed' })
        .expect(204);

      const copy = body<{ order: OrderResponse }>(
        await ctx.agent.post(`/v1/orders/${original.id}/duplicate`).expect(201),
      ).order;

      expect(copy.id).not.toBe(original.id);
      expect(copy.status).toBe('draft');
      expect(copy.duplicatedFromId).toBe(original.id);

      // Reset, not copied: a supplier's PO number belongs to the order it was
      // issued against, and last month's date is wrong on a new one.
      expect(copy.reference).toBeNull();
      expect(copy.expectedAt).toBeNull();

      expect(copy.lines).toHaveLength(1);
      expect(copy.lines[0].quantityOrdered).toBe('40.0000');
      expect(copy.lines[0].quantityFulfilled).toBe('0.0000');
    });

    /**
     * The flow ADR-031 is for: duplicate first, then cancel. The original
     * keeps its own state, so a failure anywhere leaves something behind.
     */
    it('leaves the original untouched', async () => {
      const ctx = await setup('alpha');
      const original = await confirmed(ctx);

      await ctx.agent.post(`/v1/orders/${original.id}/duplicate`).expect(201);

      const [row] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, original.id));

      expect(row.status).toBe('confirmed');
    });

    it('refuses an order that has already been partly received', async () => {
      const ctx = await setup('alpha');
      const original = await confirmed(ctx);

      await ctx.agent
        .post(
          `/v1/orders/${original.id}/lines/${original.lines[0].id}/receipts`,
        )
        .send({ toLocationId: ctx.locationId, quantity: '10' })
        .expect(201);

      // Copying the whole thing re-orders what arrived; copying the shortfall
      // is a backorder, which is a different operation (ADR-031).
      await ctx.agent.post(`/v1/orders/${original.id}/duplicate`).expect(409);
    });

    it('refuses to duplicate onto a retired partner', async () => {
      const ctx = await setup('alpha');
      const original = await confirmed(ctx);

      await ctx.agent
        .patch(`/v1/partners/${ctx.partnerId}`)
        .send({ isActive: false })
        .expect(204);

      // Retiring a partner is exactly what should stop a new order reaching
      // them, and a duplicate is a new order (ADR-026).
      await ctx.agent.post(`/v1/orders/${original.id}/duplicate`).expect(409);
    });

    it('does not duplicate another organization order', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await setup('beta');
      const theirs = await confirmed(beta);

      await alpha.agent.post(`/v1/orders/${theirs.id}/duplicate`).expect(404);
    });

    it('refuses a Viewer, which lacks orders.create', async () => {
      const ctx = await setup('alpha');
      const original = await confirmed(ctx);
      const viewer = await addViewer(ctx, 'viewer@alpha.example.com');

      await viewer.post(`/v1/orders/${original.id}/duplicate`).expect(403);
    });
  });

  describe('PATCH /v1/orders/:id', () => {
    it('confirms a draft', async () => {
      const ctx = await setup('alpha');
      const order = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send(purchase(ctx.partnerId, ctx.variant.id))
          .expect(201),
      ).order;

      await ctx.agent
        .patch(`/v1/orders/${order.id}`)
        .send({ status: 'confirmed' })
        .expect(204);

      const [row] = await db.select().from(orders);
      expect(row.status).toBe('confirmed');
    });

    it('refuses a transition that skips confirmation', async () => {
      const ctx = await setup('alpha');
      const order = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send(purchase(ctx.partnerId, ctx.variant.id))
          .expect(201),
      ).order;

      // The table, not a chain of ifs — an illegal transition is a lookup that
      // fails rather than a branch someone forgot to write.
      await ctx.agent
        .patch(`/v1/orders/${order.id}`)
        .send({ status: 'fulfilled' })
        .expect(409);
    });

    it('treats cancelled as terminal', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      await ctx.agent
        .patch(`/v1/orders/${order.id}`)
        .send({ status: 'cancelled' })
        .expect(204);

      /**
       * A cancelled order that turns out to be wrong is corrected by an
       * adjustment movement, not by reopening the document (ADR-023).
       */
      await ctx.agent
        .patch(`/v1/orders/${order.id}`)
        .send({ status: 'confirmed' })
        .expect(409);
    });

    /**
     * Cancelling says the order never happened. Once goods have moved
     * against it that is untrue, so it is closed instead (ADR-023). The
     * status is read back rather than inferred from the 409: a check placed
     * after the write returns 409 and leaves the order cancelled.
     */
    it('refuses to cancel once anything has been received, and changes nothing', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
        .send({ toLocationId: ctx.locationId, quantity: '10' })
        .expect(201);

      await ctx.agent
        .patch(`/v1/orders/${order.id}`)
        .send({ status: 'cancelled' })
        .expect(409);

      const [row] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, order.id));

      expect(row.status).toBe('confirmed');
    });

    it('still closes a partly received order', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
        .send({ toLocationId: ctx.locationId, quantity: '10' })
        .expect(201);

      // The path the refusal points to.
      await ctx.agent
        .patch(`/v1/orders/${order.id}`)
        .send({ status: 'fulfilled' })
        .expect(204);
    });
  });

  describe('order lines', () => {
    it('adds, amends, and removes on a draft', async () => {
      const ctx = await setup('alpha');

      const second = body<{ product: { variants: { id: string }[] } }>(
        await ctx.agent
          .post('/v1/products')
          .send({
            type: 'good',
            name: 'Second',
            variant: { sku: 'WIDGET-2' },
          })
          .expect(201),
      ).product.variants[0];

      const order = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send(purchase(ctx.partnerId, ctx.variant.id))
          .expect(201),
      ).order;

      const added = body<{ line: { id: string } }>(
        await ctx.agent
          .post(`/v1/orders/${order.id}/lines`)
          .send({ variantId: second.id, quantityOrdered: '5' })
          .expect(201),
      ).line;

      await ctx.agent
        .patch(`/v1/orders/${order.id}/lines/${added.id}`)
        .send({ quantityOrdered: '8' })
        .expect(204);

      const [amended] = await db
        .select()
        .from(orderLines)
        .where(eq(orderLines.id, added.id));
      expect(amended.quantityOrdered).toBe('8.0000');

      await ctx.agent
        .delete(`/v1/orders/${order.id}/lines/${added.id}`)
        .expect(204);

      expect(await db.select().from(orderLines)).toHaveLength(1);
    });

    it('refuses the same item twice', async () => {
      const ctx = await setup('alpha');
      const order = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send(purchase(ctx.partnerId, ctx.variant.id))
          .expect(201),
      ).order;

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines`)
        .send({ variantId: ctx.variant.id, quantityOrdered: '5' })
        .expect(409);
    });

    /**
     * An order with no lines is a document that orders nothing (ADR-027), so
     * removal cannot produce what creation refuses.
     */
    it('refuses to remove the only item', async () => {
      const ctx = await setup('alpha');
      const order = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send(purchase(ctx.partnerId, ctx.variant.id))
          .expect(201),
      ).order;

      await ctx.agent
        .delete(`/v1/orders/${order.id}/lines/${order.lines[0].id}`)
        .expect(409);
    });

    it('amends a confirmed order but will not remove from one', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      // A supplier saying they can only do 30 is an ordinary amendment.
      await ctx.agent
        .patch(`/v1/orders/${order.id}/lines/${order.lines[0].id}`)
        .send({ quantityOrdered: '30' })
        .expect(204);

      // Removing an item from an order already sent is a partial
      // cancellation, which ADR-027 left open.
      await ctx.agent
        .delete(`/v1/orders/${order.id}/lines/${order.lines[0].id}`)
        .expect(409);
    });

    it('freezes a line once anything has been received against it', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
        .send({ toLocationId: ctx.locationId, quantity: '10' })
        .expect(201);

      await ctx.agent
        .patch(`/v1/orders/${order.id}/lines/${order.lines[0].id}`)
        .send({ quantityOrdered: '50' })
        .expect(409);
    });

    it('refuses a line belonging to another order', async () => {
      const ctx = await setup('alpha');
      const first = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send(purchase(ctx.partnerId, ctx.variant.id))
          .expect(201),
      ).order;
      const second = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send(purchase(ctx.partnerId, ctx.variant.id))
          .expect(201),
      ).order;

      await ctx.agent
        .patch(`/v1/orders/${second.id}/lines/${first.lines[0].id}`)
        .send({ quantityOrdered: '1' })
        .expect(404);
    });

    it('refuses a Viewer, which lacks orders.update', async () => {
      const ctx = await setup('alpha');
      const order = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send(purchase(ctx.partnerId, ctx.variant.id))
          .expect(201),
      ).order;

      const viewer = await addViewer(ctx, 'viewer@alpha.example.com');

      await viewer
        .patch(`/v1/orders/${order.id}/lines/${order.lines[0].id}`)
        .send({ quantityOrdered: '1' })
        .expect(403);
    });
  });

  describe('pricing', () => {
    /**
     * Amounts are asserted as numbers, not strings.
     *
     * numeric(18,4) times numeric(18,4) is scale 8, and sum() keeps it — so a
     * line total comes back as 50.00000000 while the unit price is 1.2500.
     * Both are exact; only the scale differs, and pinning the query to four
     * places would throw away digits on a line like 1,000,000 × 0.000125.
     * Formatting rounds at display, where it knows the currency (ADR-035).
     */
    it('records a price and its currency, and totals by currency', async () => {
      const ctx = await setup('alpha');

      const order = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send({
            partnerId: ctx.partnerId,
            direction: 'purchase',
            lines: [
              {
                variantId: ctx.variant.id,
                quantityOrdered: '40',
                unitPrice: '1.25',
                currency: 'CAD',
              },
            ],
          })
          .expect(201),
      ).order;

      const detail = body<{
        totals: { currency: string; amount: string }[];
        totalsComplete: boolean;
        lines: { unitPrice: string; currency: string; lineTotal: string }[];
      }>(await ctx.agent.get(`/v1/orders/${order.id}`).expect(200));

      expect(detail.lines[0].unitPrice).toBe('1.2500');
      expect(detail.lines[0].currency).toBe('CAD');
      expect(Number(detail.lines[0].lineTotal)).toBe(50);

      expect(detail.totals).toHaveLength(1);
      expect(detail.totals[0].currency).toBe('CAD');
      expect(Number(detail.totals[0].amount)).toBe(50);
      expect(detail.totalsComplete).toBe(true);
    });

    /**
     * One group per currency. Same currency sums, different currencies list —
     * CAD plus USD is not a quantity until a rate and a date are chosen
     * (ADR-035).
     */
    it('subtotals a mixed-currency order rather than summing it', async () => {
      const ctx = await setup('alpha');

      const second = body<{ product: { variants: { id: string }[] } }>(
        await ctx.agent
          .post('/v1/products')
          .send({ type: 'good', name: 'Second', variant: { sku: 'WIDGET-2' } })
          .expect(201),
      ).product.variants[0];

      const order = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send({
            partnerId: ctx.partnerId,
            direction: 'purchase',
            lines: [
              {
                variantId: ctx.variant.id,
                quantityOrdered: '10',
                unitPrice: '2',
                currency: 'CAD',
              },
              {
                variantId: second.id,
                quantityOrdered: '10',
                unitPrice: '3',
                currency: 'USD',
              },
            ],
          })
          .expect(201),
      ).order;

      const detail = body<{
        totals: { currency: string; amount: string }[];
      }>(await ctx.agent.get(`/v1/orders/${order.id}`).expect(200));

      // Ordered by currency, so the list does not reshuffle between requests.
      expect(detail.totals.map((total) => total.currency)).toEqual([
        'CAD',
        'USD',
      ]);
      expect(detail.totals.map((total) => Number(total.amount))).toEqual([
        20, 30,
      ]);
    });

    it('withholds totals when any line is unpriced', async () => {
      const ctx = await setup('alpha');

      const second = body<{ product: { variants: { id: string }[] } }>(
        await ctx.agent
          .post('/v1/products')
          .send({ type: 'good', name: 'Second', variant: { sku: 'WIDGET-2' } })
          .expect(201),
      ).product.variants[0];

      const order = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send({
            partnerId: ctx.partnerId,
            direction: 'purchase',
            lines: [
              {
                variantId: ctx.variant.id,
                quantityOrdered: '10',
                unitPrice: '2',
                currency: 'CAD',
              },
              { variantId: second.id, quantityOrdered: '10' },
            ],
          })
          .expect(201),
      ).order;

      const detail = body<{
        totals: { currency: string; amount: string }[];
        totalsComplete: boolean;
      }>(await ctx.agent.get(`/v1/orders/${order.id}`).expect(200));

      /**
       * The subtotal is real but partial, which is the number somebody
       * reconciles against — hence a flag saying so rather than a smaller
       * figure with nothing to explain it (ADR-035).
       */
      expect(detail.totals).toHaveLength(1);
      expect(Number(detail.totals[0].amount)).toBe(20);
      expect(detail.totalsComplete).toBe(false);
    });

    it('allows a free line at zero', async () => {
      const ctx = await setup('alpha');

      // A replacement or a sample on a purchase order is real, and recording
      // it at zero is more honest than leaving the price blank (ADR-035).
      await ctx.agent
        .post('/v1/orders')
        .send({
          partnerId: ctx.partnerId,
          direction: 'purchase',
          lines: [
            {
              variantId: ctx.variant.id,
              quantityOrdered: '5',
              unitPrice: '0',
              currency: 'CAD',
            },
          ],
        })
        .expect(201);
    });

    it('refuses a price without a currency, or the reverse', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      // A price with no currency is a number with no unit; a currency with no
      // price says nothing. The check constraint refuses both, but the service
      // says which half is missing.
      await ctx.agent
        .patch(`/v1/orders/${order.id}/lines/${order.lines[0].id}`)
        .send({ quantityOrdered: '40', unitPrice: '1.25' })
        .expect(400);

      await ctx.agent
        .patch(`/v1/orders/${order.id}/lines/${order.lines[0].id}`)
        .send({ quantityOrdered: '40', currency: 'CAD' })
        .expect(400);
    });

    it('amends a price while nothing has been received', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      await ctx.agent
        .patch(`/v1/orders/${order.id}/lines/${order.lines[0].id}`)
        .send({ quantityOrdered: '40', unitPrice: '1.50', currency: 'CAD' })
        .expect(204);

      const [line] = await db.select().from(orderLines);
      expect(line.unitPrice).toBe('1.5000');
      expect(line.currency).toBe('CAD');
    });

    /**
     * A price freezes when the line does. By then it has been matched against
     * a supplier invoice, and changing it afterwards breaks that link
     * silently — the argument that froze the order reference (ADR-035).
     */
    it('refuses a price change once anything has been received', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
        .send({ toLocationId: ctx.locationId, quantity: '10' })
        .expect(201);

      await ctx.agent
        .patch(`/v1/orders/${order.id}/lines/${order.lines[0].id}`)
        .send({ quantityOrdered: '40', unitPrice: '9.99', currency: 'CAD' })
        .expect(409);
    });

    it('carries prices into a duplicate', async () => {
      const ctx = await setup('alpha');

      const order = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send({
            partnerId: ctx.partnerId,
            direction: 'purchase',
            lines: [
              {
                variantId: ctx.variant.id,
                quantityOrdered: '40',
                unitPrice: '1.25',
                currency: 'CAD',
              },
            ],
          })
          .expect(201),
      ).order;

      const copy = body<{ order: OrderResponse }>(
        await ctx.agent.post(`/v1/orders/${order.id}/duplicate`).expect(201),
      ).order;

      /**
       * Unlike the reference and expected date, which belong to the original
       * order, the price agreed with this supplier is the best available
       * starting point (ADR-031, ADR-035).
       */
      const detail = body<{ lines: { unitPrice: string; currency: string }[] }>(
        await ctx.agent.get(`/v1/orders/${copy.id}`).expect(200),
      );

      expect(detail.lines[0].unitPrice).toBe('1.2500');
      expect(detail.lines[0].currency).toBe('CAD');
    });
  });

  describe('closing a line short', () => {
    it('leaves the quantities alone and settles what is outstanding', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
        .send({ toLocationId: ctx.locationId, quantity: '10' })
        .expect(201);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/close`)
        .send({ reason: 'Supplier discontinued the item' })
        .expect(204);

      const detail = body<{
        fullyFulfilled: boolean;
        lines: {
          quantityOrdered: string;
          quantityFulfilled: string;
          quantityOutstanding: string;
          isComplete: boolean;
          isClosedShort: boolean;
          closedReason: string | null;
        }[];
      }>(await ctx.agent.get(`/v1/orders/${order.id}`).expect(200));

      const [line] = detail.lines;

      // The variance survives: 40 was ordered, 10 came (ADR-034).
      expect(line.quantityOrdered).toBe('40.0000');
      expect(line.quantityFulfilled).toBe('10.0000');

      // But nothing is outstanding, and the order can be closed.
      expect(line.quantityOutstanding).toBe('0.0000');
      expect(line.isComplete).toBe(true);
      expect(line.isClosedShort).toBe(true);
      expect(line.closedReason).toBe('Supplier discontinued the item');
      expect(detail.fullyFulfilled).toBe(true);
    });

    it('closes a line nothing ever arrived against', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      // The other half of ADR-027's deferral: cancelling a whole line and
      // cancelling its remainder differ only in the number.
      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/close`)
        .send({ reason: 'Ordered by mistake' })
        .expect(204);

      const [row] = await db.select().from(orderLines);
      expect(row.quantityFulfilled).toBe('0.0000');
      expect(row.isClosedShort).toBe(true);
    });

    it('requires a reason', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/close`)
        .send({ reason: '   ' })
        .expect(400);
    });

    it('refuses a line that is already complete', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
        .send({ toLocationId: ctx.locationId, quantity: '40' })
        .expect(201);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/close`)
        .send({ reason: 'Nothing left to close' })
        .expect(409);
    });

    it('refuses a receipt against a closed line until it is reopened', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/close`)
        .send({ reason: 'Backordered indefinitely' })
        .expect(204);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
        .send({ toLocationId: ctx.locationId, quantity: '5' })
        .expect(409);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/reopen`)
        .expect(204);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
        .send({ toLocationId: ctx.locationId, quantity: '5' })
        .expect(201);
    });

    it('refuses on a draft', async () => {
      const ctx = await setup('alpha');
      const order = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send(purchase(ctx.partnerId, ctx.variant.id))
          .expect(201),
      ).order;

      // A draft has promised nothing, so there is no shortfall — remove the
      // line instead (ADR-033).
      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/close`)
        .send({ reason: 'Changed my mind' })
        .expect(409);
    });

    it('tells everyone who maintains orders about a short close', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/close`)
        .send({ reason: 'Supplier discontinued the item' })
        .expect(204);

      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.type, 'order.line_closed_short'));

      expect(rows).toHaveLength(1);
      // 'order', not 'order_line': clicking a notification should land on a
      // page that exists, and lines do not have one.
      expect(rows[0].resourceType).toBe('order');
      expect(rows[0].resourceId).toBe(order.id);
      expect(rows[0].body).toContain('Supplier discontinued the item');
    });
  });

  describe('POST /v1/orders/:id/lines/:lineId/receipts', () => {
    it('writes a referenced movement and raises the fulfilment together', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
        .send({ toLocationId: ctx.locationId, quantity: '15' })
        .expect(201);

      /**
       * One ledger, no receipts table. The reference columns on the movement
       * are what ADR-023 left nullable for exactly this — a movement entered by
       * hand and one raised by an order are the same row.
       */
      const [movement] = await db.select().from(stockMovements);
      expect(movement.reason).toBe('receipt');
      expect(movement.referenceType).toBe('purchase_order');
      expect(movement.referenceId).toBe(order.id);
      expect(movement.quantity).toBe('15.0000');

      const [line] = await db.select().from(orderLines);
      expect(line.quantityFulfilled).toBe('15.0000');

      // And the stock actually moved.
      const [level] = await db.select().from(stockLevels);
      expect(level.quantity).toBe('15.0000');
    });

    // The order's History link must include receipts, which are what the
    // receiving dock gets asked about.
    it('files the receipt under the order', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
        .send({ toLocationId: ctx.locationId, quantity: '15' })
        .expect(201);

      const [entry] = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'order.line_received'));

      expect(entry.resourceType).toBe('order');
      expect(entry.resourceId).toBe(order.id);

      // What and how much, so the History drawer can say "WIDGET-1, 15"
      // rather than "Order line received".
      expect(entry.payload).toEqual({
        sku: order.lines[0].sku,
        quantity: '15',
      });
    });

    /**
     * A Save that changed nothing writes no audit row. The service recorded
     * the previous values, so it can prove nothing moved; the row would only
     * put "40 → 40" in the order's History.
     */
    it('records no audit row for an update that changed nothing', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);
      const line = `/v1/orders/${order.id}/lines/${order.lines[0].id}`;

      await ctx.agent
        .patch(line)
        .send({ quantityOrdered: '40.0000' })
        .expect(204);

      await ctx.agent.patch(line).send({ quantityOrdered: '41' }).expect(204);

      const rows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'order.line_updated'));

      expect(rows).toHaveLength(1);
      expect(rows[0].payload).toEqual({
        quantityOrdered: { from: '40.0000', to: '41' },
      });
    });

    it('does not advance the status on a full receipt', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
        .send({ toLocationId: ctx.locationId, quantity: '40' })
        .expect(201);

      /**
       * `received` is a person saying the order is done, which can be true of a
       * short shipment nobody expects to complete (ADR-027). Arithmetic does
       * not get to make that call.
       */
      const [row] = await db.select().from(orders);
      expect(row.status).toBe('confirmed');
    });

    it('refuses more than was ordered, and moves nothing', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
        .send({ toLocationId: ctx.locationId, quantity: '41' })
        .expect(409);

      /**
       * The whole transaction rolls back — a movement recorded against a
       * fulfilment that was refused would leave the two disagreeing, which is
       * the thing one transaction exists to prevent.
       */
      expect(await db.select().from(stockMovements)).toHaveLength(0);
      expect(await db.select().from(stockLevels)).toHaveLength(0);
    });

    it('refuses a draft order', async () => {
      const ctx = await setup('alpha');
      const order = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send(purchase(ctx.partnerId, ctx.variant.id))
          .expect(201),
      ).order;

      // Stock arriving against a draft is a real event and belongs in the
      // ledger — as a movement with no reference, which is what an
      // unreferenced receipt is for.
      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
        .send({ toLocationId: ctx.locationId, quantity: '10' })
        .expect(409);
    });

    it('refuses a line belonging to another order', async () => {
      const ctx = await setup('alpha');
      const first = await confirmed(ctx);

      const second = await confirmed(ctx);

      // Both ids together: without that, any line in the organization could be
      // received through any order's URL. Both orders are confirmed so the
      // status check cannot be what refuses this.
      await ctx.agent
        .post(`/v1/orders/${second.id}/lines/${first.lines[0].id}/receipts`)
        .send({ toLocationId: ctx.locationId, quantity: '1' })
        .expect(404);
    });

    it('refuses a Viewer, which lacks orders.receive', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);
      const viewer = await addViewer(ctx, 'viewer@alpha.example.com');

      await viewer
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
        .send({ toLocationId: ctx.locationId, quantity: '10' })
        .expect(403);
    });
  });

  describe('GET /v1/orders', () => {
    it('does not show another organization orders', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await setup('beta');

      await beta.agent
        .post('/v1/orders')
        .send(purchase(beta.partnerId, beta.variant.id))
        .expect(201);

      const res = await alpha.agent.get('/v1/orders').expect(200);
      expect(body<OrderPage>(res).entries).toHaveLength(0);
    });

    it('is readable by a Viewer, which holds orders.view', async () => {
      const ctx = await setup('alpha');
      await ctx.agent
        .post('/v1/orders')
        .send(purchase(ctx.partnerId, ctx.variant.id))
        .expect(201);

      const viewer = await addViewer(ctx, 'viewer@alpha.example.com');
      const res = await viewer.get('/v1/orders').expect(200);

      expect(body<OrderPage>(res).entries).toHaveLength(1);
    });

    it('hides received and cancelled orders by default', async () => {
      const ctx = await setup('alpha');

      const open = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send(purchase(ctx.partnerId, ctx.variant.id))
          .expect(201),
      ).order;

      const closed = await confirmed(ctx);
      await ctx.agent
        .patch(`/v1/orders/${closed.id}`)
        .send({ status: 'cancelled' })
        .expect(204);

      /**
       * The default is the filter, not a convenience on top of one. An order
       * list answers "what is still outstanding", and a year of closed
       * documents buries that — so `open` is what you get by doing nothing,
       * and the archive takes a deliberate ?status=all.
       */
      const res = await ctx.agent.get('/v1/orders').expect(200);
      const entries = body<OrderPage>(res).entries;

      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe(open.id);
    });

    it('returns the archive when asked', async () => {
      const ctx = await setup('alpha');

      await ctx.agent
        .post('/v1/orders')
        .send(purchase(ctx.partnerId, ctx.variant.id))
        .expect(201);

      const closed = await confirmed(ctx);
      await ctx.agent
        .patch(`/v1/orders/${closed.id}`)
        .send({ status: 'cancelled' })
        .expect(204);

      const res = await ctx.agent.get('/v1/orders?status=all').expect(200);
      expect(body<OrderPage>(res).entries).toHaveLength(2);
    });

    it('pages without repeating or skipping a row', async () => {
      const ctx = await setup('alpha');

      for (let i = 0; i < 3; i += 1) {
        await ctx.agent
          .post('/v1/orders')
          .send({
            partnerId: ctx.partnerId,
            direction: 'purchase',
            reference: `REF-${i}`,
            lines: [{ variantId: ctx.variant.id, quantityOrdered: '10' }],
          })
          .expect(201);
      }

      const first = body<OrderPage>(
        await ctx.agent.get('/v1/orders?limit=2').expect(200),
      );

      expect(first.entries).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();

      const second = body<OrderPage>(
        await ctx.agent
          .get(`/v1/orders?limit=2&before=${first.nextCursor}`)
          .expect(200),
      );

      /**
       * Keyset, so the second page is "older than this id" rather than "skip
       * two" — a row inserted between the requests cannot shift the window and
       * make the reader miss one.
       */
      expect(second.entries).toHaveLength(1);
      expect(second.nextCursor).toBeNull();

      const ids = [...first.entries, ...second.entries].map((row) => row.id);
      expect(new Set(ids).size).toBe(3);
    });
  });

  describe('GET /v1/orders/:id', () => {
    it('reports what is outstanding and when a line is done', async () => {
      const ctx = await setup('alpha');
      const order = await confirmed(ctx);

      const before = body<{
        partnerName: string;
        fullyFulfilled: boolean;
        lines: { quantityOutstanding: string; isComplete: boolean }[];
      }>(await ctx.agent.get(`/v1/orders/${order.id}`).expect(200));

      // Joined, because a detail page headed by a UUID is unreadable.
      expect(before.partnerName).toBe('Acme Supplies');
      expect(before.lines[0].quantityOutstanding).toBe('40.0000');
      expect(before.lines[0].isComplete).toBe(false);
      expect(before.fullyFulfilled).toBe(false);

      await ctx.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
        .send({ toLocationId: ctx.locationId, quantity: '40' })
        .expect(201);

      const after = body<{
        fullyFulfilled: boolean;
        status: string;
        lines: { quantityOutstanding: string; isComplete: boolean }[];
      }>(await ctx.agent.get(`/v1/orders/${order.id}`).expect(200));

      /**
       * All three computed in Postgres. The client could subtract the two
       * quantities itself, but only by parsing numeric(18,4) into doubles —
       * the precision loss ADR-025 exists to prevent.
       */
      expect(after.lines[0].quantityOutstanding).toBe('0.0000');
      expect(after.lines[0].isComplete).toBe(true);
      expect(after.fullyFulfilled).toBe(true);

      // The status has not moved. Arithmetic does not close a document
      // (ADR-027) — that stays a person's decision.
      expect(after.status).toBe('confirmed');
    });

    it('refuses an order in another organization', async () => {
      const alpha = await setup('alpha');
      const beta = await setup('beta');
      const theirs = await confirmed(beta);

      // Scoped, so not found rather than forbidden — a 403 would confirm the
      // id exists somewhere.
      await alpha.agent.get(`/v1/orders/${theirs.id}`).expect(404);
    });
  });

  describe('audit payload', () => {
    it('records only the fields a route named', async () => {
      const ctx = await setup('alpha');
      const order = body<{ order: OrderResponse }>(
        await ctx.agent
          .post('/v1/orders')
          .send(purchase(ctx.partnerId, ctx.variant.id))
          .expect(201),
      ).order;

      await ctx.agent
        .patch(`/v1/orders/${order.id}`)
        .send({ reference: 'PO-1234', note: 'call the warehouse first' })
        .expect(204);

      const [entry] = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'order.updated'));

      // The allow-list is a retention promise, and without this it is a
      // comment. note is absent deliberately: free text is where people put
      // what should not sit in a two-year table (ADR-018).
      expect(entry.payload).toEqual({
        // null from, because the order was raised without a reference.
        reference: { from: null, to: 'PO-1234' },
      });
    });
  });
});
