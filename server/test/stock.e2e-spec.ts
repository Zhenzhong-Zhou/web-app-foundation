import type { INestApplication } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

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
  users,
} from '../src/database/schema';
import {
  addMember,
  addViewer,
  body,
  createE2eApp,
  createPartner,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';
import { buy, cad, expectBooksToReconcile } from './utils/valuation';

interface ProductResponse {
  product: { id: string; variants: { id: string; sku: string }[] };
}

interface LocationResponse {
  location: { id: string };
}

/** A pile: a code at one place, in one lot when it tracks lots. */
interface Pile {
  id: string;
  variantId: string;
  sku: string;
  /** Read here by an Owner, who may see places. */
  locationName: string;
  lotId: string | null;
  lotCode: string | null;
  quantity: string;
}

/** A row per code (ADR-093). */
interface CodeRow {
  sku: string;
  productName: string;
  variantName: string | null;
  places: number;
}

interface Page<Row> {
  entries: Row[];
  nextCursor: string | null;
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

  beforeAll(async () => {
    app = await createE2eApp();
    db = app.get<Database>(UNSAFE_GLOBAL_DB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  type Agent = Awaited<ReturnType<typeof registerOrganization>>['agent'];

  async function createVariant(
    agent: Agent,
    options: { sku?: string; tracksLots?: boolean; name?: string } = {},
  ) {
    const res = await agent
      .post('/v1/products')
      .send({
        type: 'good',
        name: options.name ?? `Product ${options.sku ?? 'WIDGET'}`,
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

  /** A code's piles, every place's, as its row opens on Inventory. */
  async function piles(agent: Pick<Agent, 'get'>, variantId: string) {
    const res = await agent
      .get(`/v1/stock/by-code/${variantId}/places`)
      .expect(200);
    return body<{ places: { lots: Pile[] }[] }>(res).places.flatMap(
      (place) => place.lots,
    );
  }

  /** Inventory's first page, a row per code, which here is all of it. */
  async function codeRows(agent: Pick<Agent, 'get'>, query = '') {
    const res = await agent.get(`/v1/stock/by-code${query}`).expect(200);
    return body<Page<CodeRow>>(res).entries;
  }

  /** The Lot view's first page, a lot at each place: here, all of it. */
  async function lotRows(agent: Pick<Agent, 'get'>, query = '') {
    const res = await agent.get(`/v1/stock/by-lot${query}`).expect(200);
    return body<Page<Pile>>(res).entries;
  }

  /** A variant and a leaf location in one organization — the usual starting point. */
  async function setup(
    slugish: string,
    options: { tracksLots?: boolean } = {},
  ) {
    const org = await registerOrganization(app, slugish);
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
   * Inserted directly, holding these two alone: POST /v1/roles would add
   * the three every role holds and refuse stock.move without what it needs
   * (ADR-080), and this is testing the guard rather than role management.
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

      const rows = await piles(agent, variant.id);

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

      const rows = await piles(agent, variant.id);

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

      const rows = await piles(agent, variant.id);
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
              lot: { code: 'L2024-A', expiresAt: '2027-01-01' },
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

        // Its stock goes to another location, since none can be added
        // inside it while it holds some (#148), in each language.
        const refusals: [string, string][] = [
          [
            'en',
            'This location holds stock. Move its stock to another location first.',
          ],
          [
            'fr-CA',
            'Cet emplacement contient du stock. Déplacez d’abord son stock vers un autre emplacement.',
          ],
          ['zh-Hans', '此库位存有库存。请先将其库存移至另一个库位。'],
        ];
        for (const [language, message] of refusals) {
          const refused = await agent
            .post('/v1/locations')
            .set('Accept-Language', language)
            .send({ type: 'bin', name: 'Bin 1', parentId: locationId })
            .expect(409);
          expect(body<{ message: string }>(refused).message).toBe(message);
        }
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

    /**
     * Stock found where the item never was, counted in by Correct the
     * count (ADR-093, R26, 84a and 90a): any leaf place, one of its lots or
     * a new one made with the count, and the write saying whether it
     * waits for a cost.
     */
    describe('found stock (#628)', () => {
      /** A found count of 12 into a place, its lot as given. */
      function found(
        variantId: string,
        toLocationId: string,
        lot: { lotId: string } | { lot: { code: string; expiresAt?: string } },
      ) {
        return {
          variantId,
          toLocationId,
          ...lot,
          quantity: '12',
          reason: 'adjustment',
          reasonDetail: 'found',
          note: 'A box found behind the cartons at the count',
        };
      }

      it('makes a new lot with the count, at a place the item never was, and says it waits for a cost', async () => {
        const { agent, variant, locationId } = await setup('alpha', {
          tracksLots: true,
        });
        await agent
          .post('/v1/stock/movements')
          .send({
            ...receipt(variant.id, locationId, '40'),
            lot: { code: 'VC-0305' },
          })
          .expect(201);
        const shelf = await createLocation(agent, { name: 'Shelf C3' });

        const res = await agent
          .post('/v1/stock/movements')
          .send(
            found(variant.id, shelf, {
              lot: { code: 'vc-0310', expiresAt: '2027-06-30' },
            }),
          )
          .expect(201);

        const made = await db
          .select()
          .from(lots)
          .where(eq(lots.code, 'VC-0310'));
        expect(made).toHaveLength(1);
        expect(made[0].expiresAt).toBe('2027-06-30');
        expect(
          body<{ movement: { lotId: string }; needsCost: boolean }>(res),
        ).toMatchObject({ movement: { lotId: made[0].id }, needsCost: true });
        expect(
          (await piles(agent, variant.id)).map((pile) => [
            pile.locationName,
            pile.lotCode,
            pile.quantity,
          ]),
        ).toEqual(
          expect.arrayContaining([
            ['Main', 'VC-0305', '40.0000'],
            ['Shelf C3', 'VC-0310', '12.0000'],
          ]),
        );
      });

      it('counts into a lot the item has at its average, not waiting for a cost', async () => {
        const { agent, variant, locationId } = await setup('alpha', {
          tracksLots: true,
        });
        await agent
          .patch('/v1/organization')
          .send({ baseCurrency: 'CAD' })
          .expect(204);
        const supplier = await createPartner(agent, {
          name: 'Cascade Botanicals',
          code: 'CASC',
        });
        await buy(
          { agent, supplier, shelf: locationId },
          variant.id,
          '40',
          cad('2'),
          { code: 'VC-0305' },
        );
        const [lot] = await db.select().from(lots);
        const shelf = await createLocation(agent, { name: 'Shelf C3' });

        const res = await agent
          .post('/v1/stock/movements')
          .send(found(variant.id, shelf, { lotId: lot.id }))
          .expect(201);

        expect(body<{ needsCost: boolean }>(res).needsCost).toBe(false);
        expect(await db.select().from(lots)).toHaveLength(1);
        await expectBooksToReconcile(db);
      });

      it('refuses a new lot whose code the item has, naming it at its field, and writes nothing', async () => {
        const { agent, variant, locationId } = await setup('alpha', {
          tracksLots: true,
        });
        await agent
          .post('/v1/stock/movements')
          .send({
            ...receipt(variant.id, locationId, '40'),
            lot: { code: 'VC-0305' },
          })
          .expect(201);
        const shelf = await createLocation(agent, { name: 'Shelf C3' });

        const refused = await agent
          .post('/v1/stock/movements')
          .send(found(variant.id, shelf, { lot: { code: 'vc-0305' } }))
          .expect(409);

        expect(body<{ message: string; code: string }>(refused)).toEqual(
          expect.objectContaining({
            message:
              'WIDGET-1 already has lot VC-0305. Choose it among its lots, or give the new lot another code.',
            code: 'lot_code_in_use',
          }),
        );
        expect(await db.select().from(lots)).toHaveLength(1);
        expect(await db.select().from(stockMovements)).toHaveLength(1);
        expect(
          await db
            .select()
            .from(stockLevels)
            .where(eq(stockLevels.locationId, shelf)),
        ).toEqual([]);
      });

      it('refuses a place that is not a leaf, as every movement, and makes no lot', async () => {
        const { agent, variant } = await setup('alpha', { tracksLots: true });
        const warehouse = await createLocation(agent, { name: 'Warehouse' });
        await createLocation(agent, { name: 'Bin 1', parentId: warehouse });

        await agent
          .post('/v1/stock/movements')
          .send(found(variant.id, warehouse, { lot: { code: 'VC-0310' } }))
          .expect(409);

        expect(await db.select().from(lots)).toEqual([]);
        expect(await db.select().from(stockMovements)).toEqual([]);
      });
    });
  });

  describe('GET /v1/stock/by-code and by-lot', () => {
    it('does not show another organization stock', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await setup('beta');

      await beta.agent
        .post('/v1/stock/movements')
        .send(receipt(beta.variant.id, beta.locationId, '40'))
        .expect(201);

      const rows = await codeRows(alpha.agent);

      expect(rows).toHaveLength(0);
    });

    it('refuses a variant or a location from another organization, saying to choose one from the list, and moves nothing', async () => {
      const alpha = await setup('alpha');
      const beta = await setup('beta');

      await alpha.agent
        .post('/v1/stock/movements')
        .send(receipt(alpha.variant.id, alpha.locationId, '40'))
        .expect(201);

      const item =
        'That item is not in this organization. Choose one from the list.';
      const location =
        'That location is not in this organization. Choose one from the list.';

      // Ids from a body, so unknown, a 400, as one that does not exist is:
      // neither a 403 nor a 404 says beta's exists (engineering.md, Server).
      for (const [movement, message] of [
        [receipt(beta.variant.id, alpha.locationId, '40'), item],
        [receipt(alpha.variant.id, beta.locationId, '40'), location],
        [
          {
            variantId: alpha.variant.id,
            fromLocationId: alpha.locationId,
            toLocationId: beta.locationId,
            quantity: '10',
            reason: 'transfer',
          },
          location,
        ],
      ] as const) {
        const refused = await alpha.agent
          .post('/v1/stock/movements')
          .send(movement)
          .expect(400);
        expect(body<{ message: string }>(refused).message).toBe(message);
      }

      const levels = await db.select().from(stockLevels);
      expect(levels.map((level) => level.quantity)).toEqual(['40.0000']);
      expect(await db.select().from(stockMovements)).toHaveLength(1);
    });

    it('is readable by a Viewer, which holds stock.view', async () => {
      const alpha = await setup('alpha');

      await alpha.agent
        .post('/v1/stock/movements')
        .send(receipt(alpha.variant.id, alpha.locationId, '40'))
        .expect(201);

      const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');
      const rows = await codeRows(viewer);

      expect(rows).toHaveLength(1);
    });

    it('refuses a Viewer recording a movement, which needs stock.move', async () => {
      const alpha = await setup('alpha');
      const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');

      await viewer
        .post('/v1/stock/movements')
        .send(receipt(alpha.variant.id, alpha.locationId, '40'))
        .expect(403);
    });

    it('refuses an adjustment without stock.adjust', async () => {
      const ctx = await setup('alpha');

      await moverRole(ctx.organizationId);
      const mover = await addMember(
        app,
        ctx,
        'mover@alpha.example.com',
        'Mover',
      );

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
      const refused = await mover
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
      // In their words, as the route's own guard refuses (#148).
      expect(body<{ message: string }>(refused).message).toBe(
        'Your role, Mover, doesn’t include “Correct a count when the system is wrong”. Owner can change your roles.',
      );

      // And nothing was written by the attempt.
      expect(await db.select().from(stockMovements)).toHaveLength(1);
    });

    // ADR-051: the list read a whole organization per call, 520 ms at scale.
    // The Lot view lists lots alone: stock with no lot is a code's row.
    it('pages the Lot view by lot and place, without repeating or skipping a row', async () => {
      const org = await registerOrganization(app, 'alpha');
      const aisleB = await createLocation(org.agent, { name: 'Aisle B' });
      const aisleA = await createLocation(org.agent, { name: 'Aisle A' });
      const zeta = await createVariant(org.agent, { sku: 'ZETA' });
      const alpha = await createVariant(org.agent, {
        sku: 'ALPHA',
        tracksLots: true,
      });

      // Received out of order, so the order on the page is the list's own.
      for (const shelf of [aisleB, aisleA]) {
        for (const code of ['L2', 'L1']) {
          await org.agent
            .post('/v1/stock/movements')
            .send({ ...receipt(alpha.id, shelf, '3'), lot: { code } })
            .expect(201);
        }
        await org.agent
          .post('/v1/stock/movements')
          .send(receipt(zeta.id, shelf, '5'))
          .expect(201);
      }

      const seen: string[] = [];
      let cursor: string | null = null;

      do {
        const after: string = cursor ? `&before=${cursor}` : '';
        const page = body<Page<Pile>>(
          await org.agent.get(`/v1/stock/by-lot?limit=2${after}`).expect(200),
        );

        expect(page.entries.length).toBeLessThanOrEqual(2);
        seen.push(
          ...page.entries.map(
            (row) => `${row.locationName} ${row.sku} ${row.lotCode}`,
          ),
        );
        cursor = page.nextCursor;
      } while (cursor);

      expect(seen).toEqual([
        'Aisle A ALPHA L1',
        'Aisle B ALPHA L1',
        'Aisle A ALPHA L2',
        'Aisle B ALPHA L2',
      ]);
    });

    it('refuses a cursor from another organization', async () => {
      const alpha = await setup('alpha');
      const beta = await setup('beta');

      await beta.agent
        .post('/v1/stock/movements')
        .send(receipt(beta.variant.id, beta.locationId, '40'))
        .expect(201);

      const [theirs] = await piles(beta.agent, beta.variant.id);

      // A 400, not a 404: the answer must not confirm the row exists.
      await alpha.agent.get(`/v1/stock/by-lot?before=${theirs.id}`).expect(400);
    });

    it('searches the SKU, the product name and the lot code', async () => {
      const org = await registerOrganization(app, 'alpha');
      const shelf = await createLocation(org.agent);
      const focus = await createVariant(org.agent, { sku: 'FOCUS-60' });
      const calm = await createVariant(org.agent, {
        sku: 'CALM-30',
        tracksLots: true,
      });

      await org.agent
        .post('/v1/stock/movements')
        .send(receipt(focus.id, shelf, '10'))
        .expect(201);
      await org.agent
        .post('/v1/stock/movements')
        .send({ ...receipt(calm.id, shelf, '10'), lot: { code: 'BF-2609' } })
        .expect(201);

      const skus = async (search: string) => {
        const rows = await codeRows(org.agent, `?search=${search}`);
        return rows.map((row) => row.sku);
      };

      expect(await skus('cus')).toEqual(['FOCUS-60']);
      expect(await skus('Product%20CALM')).toEqual(['CALM-30']);
      expect(await skus('2609')).toEqual(['CALM-30']);
      // % matches itself, not everything.
      expect(await skus('%25')).toEqual([]);
    });

    /**
     * The inventory's "Expiring soon" (ADR-055): lots within the days asked,
     * and a count of them with the same filters, so the number beside the
     * button is the rows pressing it shows.
     */
    it('narrows to lots expiring soon, and counts them alike', async () => {
      const org = await registerOrganization(app, 'alpha');
      const shelf = await createLocation(org.agent);
      const focus = await createVariant(org.agent, { sku: 'FOCUS-60' });
      const calm = await createVariant(org.agent, {
        sku: 'CALM-30',
        tracksLots: true,
      });

      // Far enough from both ends of 90 days that the clock cannot matter.
      const inDays = (days: number) =>
        new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

      await org.agent
        .post('/v1/stock/movements')
        .send(receipt(focus.id, shelf, '10'))
        .expect(201);
      await org.agent
        .post('/v1/stock/movements')
        .send({
          ...receipt(calm.id, shelf, '10'),
          lot: { code: 'SOON', expiresAt: inDays(20) },
        })
        .expect(201);
      await org.agent
        .post('/v1/stock/movements')
        .send({
          ...receipt(calm.id, shelf, '10'),
          lot: { code: 'LATER', expiresAt: inDays(400) },
        })
        .expect(201);

      const rows = await lotRows(org.agent, '?expiringWithin=90');
      expect(rows.map((row) => row.lotCode)).toEqual(['SOON']);

      const counts = async (filters: string) =>
        body<{ expiring: number; needsCost: number }>(
          await org.agent.get(`/v1/stock/by-lot/counts${filters}`).expect(200),
        );

      // 90 days unless asked, the chips' amber threshold.
      expect(await counts('')).toMatchObject({ expiring: 1 });
      expect(await counts('?expiringWithin=500')).toMatchObject({
        expiring: 2,
      });
      // The list's other filters apply to the count too.
      expect(await counts('?search=FOCUS')).toMatchObject({ expiring: 0 });

      await org.agent.get('/v1/stock/by-lot?expiringWithin=0').expect(400);
    });

    /**
     * "Needs a cost" (ADR-055): stock whose cost is still waiting, exactly
     * what Stock value lists. A receipt with no price waits; the count
     * agrees with the rows, under the list's other filters.
     */
    it('narrows to stock waiting for a cost, and counts it alike', async () => {
      const org = await registerOrganization(app, 'alpha');
      const shelf = await createLocation(org.agent);
      const focus = await createVariant(org.agent, { sku: 'FOCUS-60' });
      const calm = await createVariant(org.agent, { sku: 'CALM-30' });

      // Received with no price: both wait for a cost.
      for (const variant of [focus, calm]) {
        await org.agent
          .post('/v1/stock/movements')
          .send(receipt(variant.id, shelf, '10'))
          .expect(201);
      }

      const waiting = await codeRows(org.agent, '?needsCost=true');
      expect(waiting.map((row) => row.sku).sort()).toEqual([
        'CALM-30',
        'FOCUS-60',
      ]);

      const counts = async (filters: string) =>
        body<{ expiring: number; needsCost: number }>(
          await org.agent.get(`/v1/stock/by-code/counts${filters}`).expect(200),
        );

      expect(await counts('')).toMatchObject({ needsCost: 2 });
      expect(await counts('?search=FOCUS')).toMatchObject({ needsCost: 1 });
      expect(
        await codeRows(org.agent, '?needsCost=true&search=FOCUS'),
      ).toHaveLength(1);

      await org.agent.get('/v1/stock/by-code?needsCost=maybe').expect(400);
    });

    /**
     * A lot's stock waits on that lot's cost alone: costing one lot leaves
     * its row, and the other lot of the same item stays, as does stock with
     * no lot (#276 matches the pool by its lot, or the nil uuid for none).
     */
    it('narrows by the lot whose cost is waiting, not the item', async () => {
      const org = await registerOrganization(app, 'alpha');
      // A cost is set in the base currency, which a new organization lacks.
      await org.agent
        .patch('/v1/organization')
        .send({ baseCurrency: 'CAD' })
        .expect(204);
      const shelf = await createLocation(org.agent);
      const scoop = await createVariant(org.agent, { sku: 'SCOOP' });
      const calm = await createVariant(org.agent, {
        sku: 'CALM-30',
        tracksLots: true,
      });

      await org.agent
        .post('/v1/stock/movements')
        .send(receipt(scoop.id, shelf, '10'))
        .expect(201);
      for (const code of ['C-1', 'C-2']) {
        await org.agent
          .post('/v1/stock/movements')
          .send({ ...receipt(calm.id, shelf, '10'), lot: { code } })
          .expect(201);
      }

      // The lots on the Lot view, and the codes, SCOOP's with no lot.
      const waiting = async () =>
        (await lotRows(org.agent, '?needsCost=true'))
          .map((row) => `${row.sku} ${row.lotCode}`)
          .sort();
      const codes = async () =>
        (await codeRows(org.agent, '?needsCost=true'))
          .map((row) => row.sku)
          .sort();
      expect(await waiting()).toEqual(['CALM-30 C-1', 'CALM-30 C-2']);
      expect(await codes()).toEqual(['CALM-30', 'SCOOP']);

      const toCost = body<{
        entries: { id: string; lotCode: string | null }[];
      }>(await org.agent.get('/v1/costs/needs-cost').expect(200)).entries.find(
        (entry) => entry.lotCode === 'C-1',
      );
      await org.agent
        .put(`/v1/costs/valuations/${toCost!.id}`)
        .send({ unitPrice: '2', currency: 'CAD' })
        .expect(200);

      expect(await waiting()).toEqual(['CALM-30 C-2']);
      expect(await codes()).toEqual(['CALM-30', 'SCOOP']);
      expect(
        body<{ needsCost: number }>(
          await org.agent.get('/v1/stock/by-lot/counts').expect(200),
        ),
      ).toMatchObject({ needsCost: 1 });
      expect(
        body<{ needsCost: number }>(
          await org.agent.get('/v1/stock/by-code/counts').expect(200),
        ),
      ).toMatchObject({ needsCost: 2 });
    });

    /**
     * The search matches as every search does (ADR-056): a name without its
     * accents, a Chinese name by its pinyin and initials, by characters, and
     * % as itself, not a wildcard.
     */
    it('finds names without accents, Chinese by pinyin, and % as itself', async () => {
      const org = await registerOrganization(app, 'alpha');
      const shelf = await createLocation(org.agent);
      const herb = await createVariant(org.agent, {
        sku: 'ELEU-30',
        name: 'Éleuthéro racine',
      });
      const oil = await createVariant(org.agent, {
        sku: 'OIL-90',
        name: '深海鱼油',
      });
      const sale = await createVariant(org.agent, {
        sku: 'PROMO-50%',
        name: 'Promotion',
      });
      for (const variant of [herb, oil, sale]) {
        await org.agent
          .post('/v1/stock/movements')
          .send(receipt(variant.id, shelf, '5'))
          .expect(201);
      }

      const skus = async (search: string) =>
        (
          await codeRows(org.agent, `?search=${encodeURIComponent(search)}`)
        ).map((row) => row.sku);

      expect(await skus('eleuthero')).toEqual(['ELEU-30']);
      expect(await skus('yuyou')).toEqual(['OIL-90']);
      expect(await skus('shyy')).toEqual(['OIL-90']);
      expect(await skus('鱼油')).toEqual(['OIL-90']);
      // One Chinese character, as the lookup takes it; a list takes any.
      expect(await skus('鱼')).toEqual(['OIL-90']);
      expect(await skus('50%')).toEqual(['PROMO-50%']);
    });

    it('names the product, since most variants have no name of their own', async () => {
      const ctx = await setup('alpha');

      await ctx.agent
        .post('/v1/stock/movements')
        .send(receipt(ctx.variant.id, ctx.locationId, '40'))
        .expect(201);

      const [row] = await codeRows(ctx.agent);

      expect(row.productName).toBe('Product WIDGET');
      expect(row.variantName).toBeNull();
    });

    it('lists one item alone, every variant in every location, its counts and export following', async () => {
      const ctx = await setup('alpha');
      const shelf = await createLocation(ctx.agent, { name: 'Back room' });
      const item = body<ProductResponse>(
        await ctx.agent
          .post('/v1/products')
          .send({ type: 'good', name: 'Fish oil', variant: { sku: 'OIL-90' } })
          .expect(201),
      ).product;
      const second = body<{ variant: { id: string } }>(
        await ctx.agent
          .post(`/v1/products/${item.id}/variants`)
          .send({ sku: 'OIL-180' })
          .expect(201),
      ).variant;

      for (const movement of [
        receipt(item.variants[0].id, ctx.locationId, '10'),
        receipt(second.id, shelf, '5'),
        receipt(ctx.variant.id, ctx.locationId, '40'),
      ]) {
        await ctx.agent.post('/v1/stock/movements').send(movement).expect(201);
      }

      const rows = await codeRows(ctx.agent, `?productId=${item.id}`);
      expect(rows.map((row) => [row.sku, row.places]).sort()).toEqual([
        ['OIL-180', 1],
        ['OIL-90', 1],
      ]);

      // Received with no cost, so each waits for one (ADR-048): the item's
      // two codes, and not the widget.
      const counts = async (filters: string) =>
        body<{ needsCost: number }>(
          await ctx.agent.get(`/v1/stock/by-code/counts${filters}`).expect(200),
        );
      expect(await counts('')).toMatchObject({ needsCost: 3 });
      expect(await counts(`?productId=${item.id}`)).toMatchObject({
        needsCost: 2,
      });

      const file = await ctx.agent
        .get(`/v1/stock/by-code/export?productId=${item.id}`)
        .expect(200);
      expect(file.text).toContain('OIL-90');
      expect(file.text).not.toContain('WIDGET-1');
    });

    it('refuses another organization item with a 400, on the list, its counts and its export', async () => {
      const alpha = await setup('alpha');
      const beta = await setup('beta');
      const betaItem = body<ProductResponse>(
        await beta.agent
          .post('/v1/products')
          .send({ type: 'good', name: 'Beta oil', variant: { sku: 'BETA-1' } })
          .expect(201),
      ).product;

      await beta.agent
        .post('/v1/stock/movements')
        .send(receipt(betaItem.variants[0].id, beta.locationId, '40'))
        .expect(201);

      for (const path of [
        '/v1/stock/by-code',
        '/v1/stock/by-code/counts',
        '/v1/stock/by-code/export',
        '/v1/stock/by-lot',
        '/v1/stock/by-lot/counts',
        '/v1/stock/by-lot/export',
      ]) {
        const refused = await alpha.agent
          .get(`${path}?productId=${betaItem.id}`)
          .expect(400);
        expect(body<{ message: string }>(refused).message).toBe(
          'That item is not in this organization. Remove it from the filter to see every item.',
        );
      }
    });

    /**
     * The list of piles and the promised table's read went once nothing
     * called them, the API's revision raised from 4 with them (ADR-081;
     * ADR-093, R22): a tab built before still sends 4, and is told to
     * reload rather than shown a route that is not there.
     */
    it('tells a tab on the revision before, asking for a read that went, to reload', async () => {
      const { agent } = await setup('alpha');

      for (const path of [
        '/v1/stock',
        '/v1/stock/counts',
        '/v1/stock/export',
        '/v1/stock/availability?promised=true',
      ]) {
        await agent.get(path).expect(404);
        const refused = await agent
          .get(path)
          .set('X-Api-Revision', '4')
          .expect(409);
        expect(body<{ code?: string }>(refused).code).toBe('client_outdated');
      }
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
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await setup('beta');

      await beta.agent
        .post('/v1/stock/movements')
        .send(receipt(beta.variant.id, beta.locationId, '5'))
        .expect(201);

      const res = await alpha.agent.get('/v1/stock/movements').expect(200);
      expect(body<{ entries: unknown[] }>(res).entries).toHaveLength(0);
    });

    it('names the item beside its SKU and who by name, with no address once their account is anonymised, and so does its CSV', async () => {
      const ctx = await setup('alpha');
      const member = await addMember(
        app,
        ctx,
        'admin@alpha.example.com',
        'Admin',
      );

      await ctx.agent
        .post('/v1/stock/movements')
        .send(receipt(ctx.variant.id, ctx.locationId, '5'))
        .expect(201);
      await member
        .post('/v1/stock/movements')
        .send(receipt(ctx.variant.id, ctx.locationId, '3'))
        .expect(201);

      // As account deletion leaves the row (ADR-012): a tombstone, its name
      // Deleted User and its address a placeholder.
      const [admin] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, 'admin@alpha.example.com'));
      await db
        .update(users)
        .set({
          name: 'Deleted User',
          email: `deleted-${admin.id}@invalid`,
          deletedAt: new Date(),
        })
        .where(eq(users.id, admin.id));

      const page = body<{
        entries: {
          sku: string;
          productName: string;
          variantName: string | null;
          actorName: string | null;
          actorEmail: string | null;
        }[];
      }>(await ctx.agent.get('/v1/stock/movements').expect(200));

      // Newest first: the member's, then the Owner's.
      expect(page.entries).toEqual([
        expect.objectContaining({
          sku: 'WIDGET-1',
          productName: 'Product WIDGET',
          variantName: null,
          actorName: 'Deleted User',
          actorEmail: null,
        }),
        expect.objectContaining({
          sku: 'WIDGET-1',
          productName: 'Product WIDGET',
          variantName: null,
          actorName: 'Owner',
          actorEmail: 'owner@alpha.example.com',
        }),
      ]);

      const csv = (
        await ctx.agent.get('/v1/stock/movements/export').expect(200)
      ).text;
      const [header, ...rows] = csv
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n')
        .map((line) => line.split(','));
      const column = (name: string) =>
        rows.map((row) => row[header.indexOf(name)]);

      // The screen's columns, one value to each, oldest first (ADR-093,
      // 87a): several items, so each row's Change.
      expect(header).toEqual([
        'When',
        'Code',
        'Item',
        'Change',
        'Unit',
        'Reason',
        'From',
        'To',
        'Lot',
        'Expiry',
        'For',
        'By',
      ]);
      expect(column('Item')).toEqual(['Product WIDGET', 'Product WIDGET']);
      expect(column('By')).toEqual(['Owner', 'Deleted User']);
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
      expect(updated.expiresAt).toBe('2027-06-30');
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
      const viewer = await addViewer(app, ctx, 'viewer@alpha.example.com');

      await viewer
        .patch(`/v1/stock/lots/${lot.id}`)
        .send({ expiresAt: '2027-06-30' })
        .expect(403);
    });
  });
});
