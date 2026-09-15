import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq, inArray } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  lots,
  permissions,
  rolePermissions,
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

interface RegisterResponse {
  user: { id: string; organizationId: string };
}

interface ProductResponse {
  product: { id: string; variants: { id: string; sku: string }[] };
}

interface LocationResponse {
  location: { id: string };
}

interface StockRow {
  variantId: string;
  sku: string;
  locationId: string;
  locationName: string;
  lotId: string | null;
  lotCode: string | null;
  quantity: string;
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * The ledger is the point of this module, so most of these tests are about
 * what must *not* happen: stock at a branch, a lotted variant with a lotless
 * row, a shelf driven negative by two requests that each saw enough.
 *
 * Quantities are compared as strings throughout. numeric(18, 4) round-trips as
 * '40.0000', and a test that parsed it would be doing the exact conversion
 * ADR-025 forbids in production code.
 */
describe('Stock (e2e)', () => {
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

  type Agent = Awaited<ReturnType<typeof registerOrg>>['agent'];

  async function createVariant(
    agent: Agent,
    options: { sku?: string; tracksLots?: boolean } = {},
  ) {
    const res = await agent
      .post('/v1/products')
      .send({
        type: 'good',
        name: `Product ${options.sku ?? 'WIDGET'}`,
        variant: {
          sku: options.sku ?? 'WIDGET-1',
          tracksLots: options.tracksLots ?? false,
        },
      })
      .expect(201);

    return body<ProductResponse>(res).product.variants[0];
  }

  async function createLocation(
    agent: Agent,
    options: { name?: string; parentId?: string } = {},
  ) {
    const res = await agent
      .post('/v1/locations')
      .send({
        type: options.parentId ? 'bin' : 'site',
        name: options.name ?? 'Main',
        parentId: options.parentId,
      })
      .expect(201);

    return body<LocationResponse>(res).location.id;
  }

  /** A variant and a leaf location in one organization — the usual starting point. */
  async function setup(
    slugish: string,
    options: { tracksLots?: boolean } = {},
  ) {
    const org = await registerOrg(slugish);
    const variant = await createVariant(org.agent, options);
    const locationId = await createLocation(org.agent);
    return { ...org, variant, locationId };
  }

  function receipt(variantId: string, locationId: string, quantity: string) {
    return {
      variantId,
      toLocationId: locationId,
      quantity,
      reason: 'receipt',
    };
  }

  /**
   * A role with stock.move but not stock.adjust, which no seeded role has.
   * Inserted directly because roles are read-only over HTTP — the API has no
   * way to make one, and this is testing the guard rather than role
   * management.
   */
  async function moverRole(organizationId: string) {
    const [role] = await db
      .insert(roles)
      .values({ organizationId, name: 'Mover', isSystem: false })
      .returning();

    const keys = ['stock.view', 'stock.move'];
    const rows = await db
      .select()
      .from(permissions)
      .where(inArray(permissions.key, keys));

    await db.insert(rolePermissions).values(
      rows.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
    );

    return role.id;
  }

  describe('POST /v1/stock/movements', () => {
    it('receives stock and reflects it in the cache', async () => {
      const { agent, variant, locationId } = await setup('alpha');

      await agent
        .post('/v1/stock/movements')
        .send(receipt(variant.id, locationId, '40'))
        .expect(201);

      const rows = body<StockRow[]>(await agent.get('/v1/stock').expect(200));

      expect(rows).toHaveLength(1);
      expect(rows[0].quantity).toBe('40.0000');
      expect(rows[0].sku).toBe(variant.sku);
      expect(rows[0].lotId).toBeNull();
    });

    it('accumulates rather than replacing, and the ledger keeps both', async () => {
      const { agent, variant, locationId } = await setup('alpha');

      await agent
        .post('/v1/stock/movements')
        .send(receipt(variant.id, locationId, '40'))
        .expect(201);
      await agent
        .post('/v1/stock/movements')
        .send(receipt(variant.id, locationId, '2.5'))
        .expect(201);

      const rows = body<StockRow[]>(await agent.get('/v1/stock').expect(200));

      // One cache row, two ledger rows. A second cache row would mean the
      // NULLS NOT DISTINCT constraint is not doing its job (ADR-025).
      expect(rows).toHaveLength(1);
      expect(rows[0].quantity).toBe('42.5000');

      const ledger = await db.select().from(stockMovements);
      expect(ledger).toHaveLength(2);
    });

    it('sums the ledger to the same total as the cache', async () => {
      const { agent, variant, locationId } = await setup('alpha');

      await agent
        .post('/v1/stock/movements')
        .send(receipt(variant.id, locationId, '40'))
        .expect(201);
      await agent
        .post('/v1/stock/movements')
        .send({
          variantId: variant.id,
          fromLocationId: locationId,
          quantity: '15.25',
          reason: 'shipment',
        })
        .expect(201);

      /**
       * The assertion ADR-023 promises. Computed here rather than through the
       * service, because a reconciliation that reuses the code under test
       * agrees with itself while both are wrong.
       */
      const ledger = await db.select().from(stockMovements);
      const total = ledger.reduce(
        (sum, row) =>
          sum +
          (row.toLocationId ? Number(row.quantity) : -Number(row.quantity)),
        0,
      );

      const [cached] = await db.select().from(stockLevels);
      expect(Number(cached.quantity)).toBe(total);
      expect(cached.quantity).toBe('24.7500');
    });

    it('refuses to ship more than the shelf holds', async () => {
      const { agent, variant, locationId } = await setup('alpha');

      await agent
        .post('/v1/stock/movements')
        .send(receipt(variant.id, locationId, '5'))
        .expect(201);

      await agent
        .post('/v1/stock/movements')
        .send({
          variantId: variant.id,
          fromLocationId: locationId,
          quantity: '6',
          reason: 'shipment',
        })
        .expect(409);

      // The whole movement is rolled back, not just the cache update: a ledger
      // row for a shipment that did not happen is worse than no row.
      const ledger = await db.select().from(stockMovements);
      expect(ledger).toHaveLength(1);

      const [cached] = await db.select().from(stockLevels);
      expect(cached.quantity).toBe('5.0000');
    });

    it('holds under two shipments racing for the same units', async () => {
      const { agent, variant, locationId } = await setup('alpha');

      await agent
        .post('/v1/stock/movements')
        .send(receipt(variant.id, locationId, '10'))
        .expect(201);

      const ship = () =>
        agent.post('/v1/stock/movements').send({
          variantId: variant.id,
          fromLocationId: locationId,
          quantity: '8',
          reason: 'shipment',
        });

      /**
       * Both read a balance of 10 and both believe they can take 8. Without the
       * row lock from ADR-025 both would commit and the shelf would sit at −6,
       * with the ledger faithfully recording a shipment that could not have
       * happened.
       */
      const results = await Promise.all([ship(), ship()]);
      const statuses = results.map((res) => res.status).sort();

      expect(statuses).toEqual([201, 409]);

      const [cached] = await db.select().from(stockLevels);
      expect(cached.quantity).toBe('2.0000');
    });

    it('moves units between locations without changing the total', async () => {
      const { agent, variant } = await setup('alpha');
      const from = await createLocation(agent, { name: 'Shelf A' });
      const to = await createLocation(agent, { name: 'Shelf B' });

      await agent
        .post('/v1/stock/movements')
        .send(receipt(variant.id, from, '40'))
        .expect(201);

      await agent
        .post('/v1/stock/movements')
        .send({
          variantId: variant.id,
          fromLocationId: from,
          toLocationId: to,
          quantity: '15',
          reason: 'transfer',
        })
        .expect(201);

      const rows = body<StockRow[]>(await agent.get('/v1/stock').expect(200));
      const byLocation = Object.fromEntries(
        rows.map((row) => [row.locationName, row.quantity]),
      );

      expect(byLocation['Shelf A']).toBe('25.0000');
      expect(byLocation['Shelf B']).toBe('15.0000');
    });

    it('refuses a direction that contradicts the reason', async () => {
      const { agent, variant, locationId } = await setup('alpha');

      // Structurally a valid row — has_location_check passes — and means the
      // opposite of what was asked for. Only the service can catch this.
      await agent
        .post('/v1/stock/movements')
        .send({
          variantId: variant.id,
          toLocationId: locationId,
          quantity: '5',
          reason: 'shipment',
        })
        .expect(400);

      expect(await db.select().from(stockMovements)).toHaveLength(0);
    });

    it('requires a note on an adjustment', async () => {
      const { agent, variant, locationId } = await setup('alpha');

      await agent
        .post('/v1/stock/movements')
        .send({
          variantId: variant.id,
          toLocationId: locationId,
          quantity: '3',
          reason: 'adjustment',
        })
        .expect(400);
    });

    it('rejects a quantity sent as a number', async () => {
      const { agent, variant, locationId } = await setup('alpha');

      // A JSON number has already been through a double before any validator
      // sees it, which is the precision loss numeric exists to prevent.
      await agent
        .post('/v1/stock/movements')
        .send({
          variantId: variant.id,
          toLocationId: locationId,
          quantity: 40,
          reason: 'receipt',
        })
        .expect(400);
    });

    it('rejects a zero and a negative quantity', async () => {
      const { agent, variant, locationId } = await setup('alpha');

      for (const quantity of ['0', '0.0000', '-5']) {
        await agent
          .post('/v1/stock/movements')
          .send(receipt(variant.id, locationId, quantity))
          .expect(400);
      }
    });

    describe('lot tracking', () => {
      it('refuses a lotless movement for a lot-tracked variant', async () => {
        const { agent, variant, locationId } = await setup('alpha', {
          tracksLots: true,
        });

        await agent
          .post('/v1/stock/movements')
          .send(receipt(variant.id, locationId, '40'))
          .expect(400);
      });

      it('refuses a lot on a variant that does not track lots', async () => {
        const { agent, variant, locationId } = await setup('alpha');

        await agent
          .post('/v1/stock/movements')
          .send({
            ...receipt(variant.id, locationId, '40'),
            lot: { code: 'L-001' },
          })
          .expect(400);
      });

      it('reuses a lot when the same code arrives twice', async () => {
        const { agent, variant, locationId } = await setup('alpha', {
          tracksLots: true,
        });

        for (const quantity of ['40', '10']) {
          await agent
            .post('/v1/stock/movements')
            .send({
              ...receipt(variant.id, locationId, quantity),
              lot: { code: 'L2024-A', expiresAt: '2027-01-01T00:00:00.000Z' },
            })
            .expect(201);
        }

        // One lot, one cache row, 50 units — not two lots of the same code and
        // not a unique-violation on the second receipt.
        expect(await db.select().from(lots)).toHaveLength(1);

        const [cached] = await db.select().from(stockLevels);
        expect(cached.quantity).toBe('50.0000');
      });
    });

    describe('locations', () => {
      it('refuses stock at a location that has children', async () => {
        const { agent, variant } = await setup('alpha');
        const warehouse = await createLocation(agent, { name: 'Warehouse' });
        await createLocation(agent, { name: 'Bin 1', parentId: warehouse });

        await agent
          .post('/v1/stock/movements')
          .send(receipt(variant.id, warehouse, '40'))
          .expect(409);
      });

      it('refuses a child under a location holding stock', async () => {
        const { agent, variant, locationId } = await setup('alpha');

        await agent
          .post('/v1/stock/movements')
          .send(receipt(variant.id, locationId, '40'))
          .expect(201);

        await agent
          .post('/v1/locations')
          .send({ type: 'bin', name: 'Bin 1', parentId: locationId })
          .expect(409);
      });

      it('allows a child once the stock is gone', async () => {
        const { agent, variant, locationId } = await setup('alpha');

        await agent
          .post('/v1/stock/movements')
          .send(receipt(variant.id, locationId, '40'))
          .expect(201);
        await agent
          .post('/v1/stock/movements')
          .send({
            variantId: variant.id,
            fromLocationId: locationId,
            quantity: '40',
            reason: 'shipment',
          })
          .expect(201);

        // The row still exists at zero. A leaf that once held something is
        // still a leaf, so this must not be blocked by a stale row.
        await agent
          .post('/v1/locations')
          .send({ type: 'bin', name: 'Bin 1', parentId: locationId })
          .expect(201);
      });
    });
  });

  describe('GET /v1/stock', () => {
    it('does not show another organization stock', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await setup('beta');

      await beta.agent
        .post('/v1/stock/movements')
        .send(receipt(beta.variant.id, beta.locationId, '40'))
        .expect(201);

      const rows = body<StockRow[]>(
        await alpha.agent.get('/v1/stock').expect(200),
      );

      expect(rows).toHaveLength(0);
    });

    it('refuses a variant from another organization', async () => {
      const alpha = await setup('alpha');
      const beta = await setup('beta');

      // Scoped, so beta's variant is simply not found rather than forbidden —
      // a 403 would confirm the id exists somewhere.
      await alpha.agent
        .post('/v1/stock/movements')
        .send(receipt(beta.variant.id, alpha.locationId, '40'))
        .expect(404);
    });

    it('is readable by a Viewer, which holds stock.view', async () => {
      const alpha = await setup('alpha');

      await alpha.agent
        .post('/v1/stock/movements')
        .send(receipt(alpha.variant.id, alpha.locationId, '40'))
        .expect(201);

      const viewer = await addViewer(alpha, 'viewer@alpha.example.com');
      const rows = body<StockRow[]>(await viewer.get('/v1/stock').expect(200));

      expect(rows).toHaveLength(1);
    });

    it('refuses a Viewer recording a movement, which needs stock.move', async () => {
      const alpha = await setup('alpha');
      const viewer = await addViewer(alpha, 'viewer@alpha.example.com');

      await viewer
        .post('/v1/stock/movements')
        .send(receipt(alpha.variant.id, alpha.locationId, '40'))
        .expect(403);
    });

    it('refuses an adjustment without stock.adjust', async () => {
      const ctx = await setup('alpha');

      await ctx.agent
        .post('/v1/users')
        .send({
          email: 'mover@alpha.example.com',
          name: 'Mover',
          password: PASSWORD,
          roleId: await moverRole(ctx.organizationId),
        })
        .expect(201);

      const mover = authedAgent(app);
      await mover
        .post('/v1/auth/login')
        .send({ email: 'mover@alpha.example.com', password: PASSWORD })
        .expect(200);

      // Receiving is what happened in the world, and stock.move covers it.
      await mover
        .post('/v1/stock/movements')
        .send({
          variantId: ctx.variant.id,
          toLocationId: ctx.locationId,
          quantity: '10',
          reason: 'receipt',
        })
        .expect(201);

      /**
       * The same person, the same route, refused — because an adjustment
       * overrides the record itself rather than recording an event. The guard
       * reads the body: a route-level decorator could not express this, and
       * splitting /adjustments out to get one would put a second write path
       * into the ledger (ADR-023).
       */
      await mover
        .post('/v1/stock/movements')
        .send({
          variantId: ctx.variant.id,
          fromLocationId: ctx.locationId,
          quantity: '3',
          reason: 'adjustment',
          reasonDetail: 'miscount',
          note: 'Three missing from the shelf',
        })
        .expect(403);

      // And nothing was written by the attempt.
      expect(await db.select().from(stockMovements)).toHaveLength(1);
    });
  });

  describe('GET /v1/stock/movements', () => {
    it('pages without repeating or skipping a row', async () => {
      const { agent, variant, locationId } = await setup('alpha');

      // Three movements, paged two at a time: the boundary where limit + 1
      // either works or is off by one.
      for (const quantity of ['1', '2', '3']) {
        await agent
          .post('/v1/stock/movements')
          .send(receipt(variant.id, locationId, quantity))
          .expect(201);
      }

      const first = body<{
        entries: { id: string }[];
        nextCursor: string | null;
      }>(await agent.get('/v1/stock/movements?limit=2').expect(200));

      expect(first.entries).toHaveLength(2);
      expect(first.nextCursor).toBe(first.entries[1].id);

      const second = body<{
        entries: { id: string }[];
        nextCursor: string | null;
      }>(
        await agent
          .get(`/v1/stock/movements?limit=2&before=${first.nextCursor}`)
          .expect(200),
      );

      // One row left, and the log says so rather than offering another page.
      expect(second.entries).toHaveLength(1);
      expect(second.nextCursor).toBeNull();

      // Every movement seen exactly once. Newest first, so the quantities
      // come back reversed.
      const seen = [...first.entries, ...second.entries].map((e) => e.id);
      expect(new Set(seen).size).toBe(3);
    });

    it('does not show another organization movements', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await setup('beta');

      await beta.agent
        .post('/v1/stock/movements')
        .send(receipt(beta.variant.id, beta.locationId, '5'))
        .expect(201);

      const res = await alpha.agent.get('/v1/stock/movements').expect(200);
      expect(body<{ entries: unknown[] }>(res).entries).toHaveLength(0);
    });
  });

  describe('GET /v1/stock/lots', () => {
    it('returns only the lots for the variant asked for', async () => {
      const ctx = await setup('alpha', { tracksLots: true });

      const other = body<{
        product: { variants: { id: string }[] };
      }>(
        await ctx.agent
          .post('/v1/products')
          .send({
            type: 'good',
            name: 'Other Widget',
            variant: { sku: 'WIDGET-2', tracksLots: true },
          })
          .expect(201),
      ).product.variants[0];

      await ctx.agent
        .post('/v1/stock/movements')
        .send({
          variantId: ctx.variant.id,
          toLocationId: ctx.locationId,
          quantity: '10',
          reason: 'receipt',
          lot: { code: 'L2024-A' },
        })
        .expect(201);

      await ctx.agent
        .post('/v1/stock/movements')
        .send({
          variantId: other.id,
          toLocationId: ctx.locationId,
          quantity: '10',
          reason: 'receipt',
          lot: { code: 'L2024-B' },
        })
        .expect(201);

      /**
       * The contract, and why variantId is required rather than optional: a
       * picker offering another product's codes is the mistake this endpoint
       * exists to prevent.
       */
      const res = await ctx.agent
        .get(`/v1/stock/lots?variantId=${ctx.variant.id}`)
        .expect(200);

      const rows = body<{ code: string }[]>(res);
      expect(rows).toHaveLength(1);
      expect(rows[0].code).toBe('L2024-A');
    });

    it('does not show another organization lots', async () => {
      const alpha = await setup('alpha', { tracksLots: true });
      const beta = await setup('beta', { tracksLots: true });

      await beta.agent
        .post('/v1/stock/movements')
        .send({
          variantId: beta.variant.id,
          toLocationId: beta.locationId,
          quantity: '10',
          reason: 'receipt',
          lot: { code: 'L2024-A' },
        })
        .expect(201);

      /**
       * Empty rather than 404: the scoping filters rather than checks, the
       * same as GET /stock. "No rows" and "not yours" look identical from
       * outside, which is the point — a 404 would confirm the id exists
       * somewhere.
       */
      const res = await alpha.agent
        .get(`/v1/stock/lots?variantId=${beta.variant.id}`)
        .expect(200);

      expect(body<unknown[]>(res)).toHaveLength(0);
    });
  });

  describe('PATCH /v1/stock/lots/:id', () => {
    /** Receives stock and returns the lot row it created. */
    async function receiveWithLot(
      ctx: Awaited<ReturnType<typeof setup>>,
      lot: { code: string; expiresAt?: string; isAssigned?: boolean },
    ) {
      await ctx.agent
        .post('/v1/stock/movements')
        .send({
          variantId: ctx.variant.id,
          toLocationId: ctx.locationId,
          quantity: '10',
          reason: 'receipt',
          lot,
        })
        .expect(201);

      // By code, not "the first row" — a test with two lots would otherwise
      // get the same one twice and pass for the wrong reason.
      const [row] = await db
        .select()
        .from(lots)
        .where(eq(lots.code, lot.code.toUpperCase()));

      return row;
    }

    it('corrects the expiry on any lot', async () => {
      const ctx = await setup('alpha', { tracksLots: true });
      const lot = await receiveWithLot(ctx, {
        code: 'L2026-A',
        expiresAt: '2027-01-01',
        isAssigned: false,
      });

      /**
       * Editable even on a supplier-printed lot, and not only for typos:
       * stability testing extends a shelf life and suppliers reissue
       * certificates. Nothing physical contradicts a corrected date.
       */
      await ctx.agent
        .patch(`/v1/stock/lots/${lot.id}`)
        .send({ expiresAt: '2027-06-30' })
        .expect(204);

      const [updated] = await db.select().from(lots);
      expect(updated.expiresAt?.toISOString()).toContain('2027-06-30');
    });

    it('renames a code this organization invented', async () => {
      const ctx = await setup('alpha', { tracksLots: true });
      const lot = await receiveWithLot(ctx, {
        code: '2062A',
        isAssigned: true,
      });

      // No label exists, so there is no external truth the row is disagreeing
      // with. A typo is a typo.
      await ctx.agent
        .patch(`/v1/stock/lots/${lot.id}`)
        .send({ code: '2026A' })
        .expect(204);

      const [updated] = await db.select().from(lots);
      expect(updated.code).toBe('2026A');
    });

    it('refuses to rename a supplier-printed code', async () => {
      const ctx = await setup('alpha', { tracksLots: true });
      const lot = await receiveWithLot(ctx, {
        code: 'L2026-A',
        isAssigned: false,
      });

      /**
       * The code is on the boxes. Renaming the row would make the record
       * disagree with the warehouse — the honest correction is moving stock
       * between two lots, which leaves a trail.
       */
      const res = await ctx.agent
        .patch(`/v1/stock/lots/${lot.id}`)
        .send({ code: 'L2026-B' })
        .expect(409);

      expect(JSON.stringify(res.body)).toContain('L2026-A');

      const [unchanged] = await db.select().from(lots);
      expect(unchanged.code).toBe('L2026-A');
    });

    it('refuses a rename onto a code that already exists', async () => {
      const ctx = await setup('alpha', { tracksLots: true });
      await receiveWithLot(ctx, { code: 'L2026-A', isAssigned: true });
      const second = await receiveWithLot(ctx, {
        code: 'L2026-B',
        isAssigned: true,
      });

      // Merging two lots is a different operation with its own rules, not a
      // rename that happens to collide.
      await ctx.agent
        .patch(`/v1/stock/lots/${second.id}`)
        .send({ code: 'L2026-A' })
        .expect(409);
    });

    it('uppercases a corrected code', async () => {
      const ctx = await setup('alpha', { tracksLots: true });
      const lot = await receiveWithLot(ctx, {
        code: '2062A',
        isAssigned: true,
      });

      await ctx.agent
        .patch(`/v1/stock/lots/${lot.id}`)
        .send({ code: '2026a' })
        .expect(204);

      // Same normalization as on creation, or the unique index sees two lots
      // for one run.
      const [updated] = await db.select().from(lots);
      expect(updated.code).toBe('2026A');
    });

    it('refuses a lot in another organization', async () => {
      const alpha = await setup('alpha', { tracksLots: true });
      const beta = await setup('beta', { tracksLots: true });
      const lot = await receiveWithLot(beta, {
        code: 'L2026-A',
        isAssigned: true,
      });

      await alpha.agent
        .patch(`/v1/stock/lots/${lot.id}`)
        .send({ code: 'HIJACKED' })
        .expect(404);
    });

    it('refuses a Viewer, which lacks stock.move', async () => {
      const ctx = await setup('alpha', { tracksLots: true });
      const lot = await receiveWithLot(ctx, {
        code: 'L2026-A',
        isAssigned: true,
      });
      const viewer = await addViewer(ctx, 'viewer@alpha.example.com');

      await viewer
        .patch(`/v1/stock/lots/${lot.id}`)
        .send({ expiresAt: '2027-06-30' })
        .expect(403);
    });
  });
});
