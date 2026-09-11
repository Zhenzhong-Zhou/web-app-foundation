import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
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

interface RegisterResponse {
  user: { id: string; organizationId: string };
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
        .send({ status: 'received' })
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
      expect(body<OrderResponse[]>(res)).toHaveLength(0);
    });

    it('is readable by a Viewer, which holds orders.view', async () => {
      const ctx = await setup('alpha');
      await ctx.agent
        .post('/v1/orders')
        .send(purchase(ctx.partnerId, ctx.variant.id))
        .expect(201);

      const viewer = await addViewer(ctx, 'viewer@alpha.example.com');
      const res = await viewer.get('/v1/orders').expect(200);

      expect(body<OrderResponse[]>(res)).toHaveLength(1);
    });
  });
});
