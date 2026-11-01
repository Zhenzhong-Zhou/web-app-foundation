import type { INestApplication } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { auditLog, reorderPoints } from '../src/database/schema';
import {
  addMember,
  addViewer,
  body,
  createE2eApp,
  createVariant,
  customRole,
  registerOrganization,
} from './utils/fixtures';
import {
  item,
  order,
  output,
  partner,
  point,
  receive,
  recipe,
  run,
  ship,
  site,
} from './utils/reorder-world';
import { resetDatabase } from './utils/reset-db';

type Org = Awaited<ReturnType<typeof registerOrganization>>;

interface Refusal {
  message: string;
  code?: string;
}

interface Row {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  status: string;
  position: string;
  suggestion: string;
  suggestedMultiples: string | null;
  drafts: {
    kind: string;
    id: string;
    number: string | null;
    quantity: string;
  }[];
}

interface Page {
  entries: Row[];
  nextCursor: string | null;
}

/**
 * Setting, changing and removing a reorder point (ADR-085): one per item,
 * by the item's id, with a rule for how much to order, and a permission
 * of its own.
 */
describe('Reorder points (e2e)', () => {
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

  const variant = (org: Org, sku: string) =>
    createVariant(org.agent, { type: 'good', name: sku, variant: { sku } });

  const path = (variantId: string) => `/v1/stock/reorder-points/${variantId}`;

  /** The point an item has, as kept. */
  async function pointOf(variantId: string) {
    const [row] = await db
      .select({
        source: reorderPoints.source,
        reorderPoint: reorderPoints.reorderPoint,
        rule: reorderPoints.rule,
        fixedQuantity: reorderPoints.fixedQuantity,
        maximumQuantity: reorderPoints.maximumQuantity,
        lowNotifiedAt: reorderPoints.lowNotifiedAt,
      })
      .from(reorderPoints)
      .where(eq(reorderPoints.variantId, variantId));
    return row;
  }

  const FIXED = {
    source: 'bought',
    reorderPoint: '2000',
    rule: 'fixed',
    fixedQuantity: '1000',
    maximumQuantity: null,
  };

  /** FIXED as a query string carries it: no quantity its rule does not use. */
  const FIXED_QUERY = {
    source: 'bought',
    reorderPoint: '2000',
    rule: 'fixed',
    fixedQuantity: '1000',
  };

  describe('adding', () => {
    it('keeps each rule with its own quantity alone', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await variant(alpha, 'D3-1000');
      const focus = await variant(alpha, 'FOCUS-60CT');
      const cap = await variant(alpha, 'CAP-38MM');

      await alpha.agent.post(path(d3)).send(FIXED).expect(204);
      await alpha.agent
        .post(path(focus))
        .send({ source: 'made', reorderPoint: '100', rule: 'just_enough' })
        .expect(204);
      // A quantity the rule does not use is not kept.
      await alpha.agent
        .post(path(cap))
        .send({
          source: 'bought',
          reorderPoint: '200',
          rule: 'maximum',
          fixedQuantity: '50',
          maximumQuantity: '600.5',
        })
        .expect(204);

      expect(await pointOf(d3)).toEqual({
        source: 'bought',
        reorderPoint: '2000.0000',
        rule: 'fixed',
        fixedQuantity: '1000.0000',
        maximumQuantity: null,
        lowNotifiedAt: null,
      });
      expect(await pointOf(focus)).toMatchObject({
        source: 'made',
        rule: 'just_enough',
        fixedQuantity: null,
        maximumQuantity: null,
      });
      expect(await pointOf(cap)).toMatchObject({
        rule: 'maximum',
        fixedQuantity: null,
        maximumQuantity: '600.5000',
      });
    });

    it('refuses a second point on an item, with a code for the dialog to offer the first', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await variant(alpha, 'D3-1000');
      await alpha.agent.post(path(d3)).send(FIXED).expect(204);

      const res = await alpha.agent
        .post(path(d3))
        .send({ ...FIXED, reorderPoint: '50' })
        .expect(409);

      expect(res.body as Refusal).toMatchObject({
        message: 'D3-1000 already has a reorder point. Change it instead.',
        code: 'reorder_point_exists',
      });
      expect((await pointOf(d3)).reorderPoint).toBe('2000.0000');
    });

    it('refuses a maximum at or below the point, with a code to mark its field', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const cap = await variant(alpha, 'CAP-38MM');
      const maximum = (maximumQuantity: string) => ({
        source: 'bought',
        reorderPoint: '200',
        rule: 'maximum',
        maximumQuantity,
      });

      for (const at of ['200', '199.9999']) {
        const res = await alpha.agent
          .post(path(cap))
          .send(maximum(at))
          .expect(400);
        expect(res.body as Refusal).toMatchObject({
          message: 'The maximum must be above the reorder point, 200.',
          code: 'reorder_maximum_not_above_point',
        });
      }
      expect(await pointOf(cap)).toBeUndefined();

      await alpha.agent.post(path(cap)).send(maximum('200.0001')).expect(204);
    });

    it('refuses a point or a quantity not above zero, and a rule without its quantity', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await variant(alpha, 'D3-1000');

      for (const refused of [
        { ...FIXED, reorderPoint: '0' },
        { ...FIXED, reorderPoint: '-5' },
        { ...FIXED, fixedQuantity: '0' },
        { ...FIXED, fixedQuantity: null },
        { ...FIXED, rule: 'maximum' },
        { ...FIXED, rule: 'whenever' },
        { ...FIXED, source: 'found' },
        // A JSON number has been through a double already (ADR-025).
        { ...FIXED, reorderPoint: 2000 },
      ]) {
        await alpha.agent.post(path(d3)).send(refused).expect(400);
      }
      expect(await pointOf(d3)).toBeUndefined();
    });

    it('refuses an item that is not there', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await alpha.agent
        .post(path('019a3a3c-0000-7000-8000-000000000000'))
        .send(FIXED)
        .expect(404);
      await alpha.agent.post(path('D3-1000')).send(FIXED).expect(400);
    });
  });

  describe('changing', () => {
    it('changes every part at once, the rule’s old quantity going', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await variant(alpha, 'D3-1000');
      await alpha.agent.post(path(d3)).send(FIXED).expect(204);

      await alpha.agent
        .put(path(d3))
        .send({
          source: 'made',
          reorderPoint: '150',
          rule: 'maximum',
          fixedQuantity: null,
          maximumQuantity: '400',
        })
        .expect(204);

      expect(await pointOf(d3)).toMatchObject({
        source: 'made',
        reorderPoint: '150.0000',
        rule: 'maximum',
        fixedQuantity: null,
        maximumQuantity: '400.0000',
      });
    });

    it('refuses a maximum at or below the point, and an item with no point', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await variant(alpha, 'D3-1000');
      const cap = await variant(alpha, 'CAP-38MM');
      await alpha.agent.post(path(d3)).send(FIXED).expect(204);

      const res = await alpha.agent
        .put(path(d3))
        .send({ ...FIXED, rule: 'maximum', maximumQuantity: '2000' })
        .expect(400);
      expect((res.body as Refusal).code).toBe(
        'reorder_maximum_not_above_point',
      );
      expect((await pointOf(d3)).rule).toBe('fixed');

      const none = await alpha.agent.put(path(cap)).send(FIXED).expect(404);
      expect((none.body as Refusal).message).toBe(
        'That item has no reorder point',
      );
    });
  });

  describe('removing', () => {
    it('removes the point, and then there is none to remove', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await variant(alpha, 'D3-1000');
      await alpha.agent.post(path(d3)).send(FIXED).expect(204);

      await alpha.agent.delete(path(d3)).expect(204);
      expect(await pointOf(d3)).toBeUndefined();

      await alpha.agent.delete(path(d3)).expect(404);
      // And it can be set again.
      await alpha.agent.post(path(d3)).send(FIXED).expect(204);
    });
  });

  it('finds no item of another organization, and changes nothing there', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const beta = await registerOrganization(app, 'beta');
    const theirs = await variant(beta, 'D3-1000');
    await beta.agent.post(path(theirs)).send(FIXED).expect(204);

    await alpha.agent.post(path(theirs)).send(FIXED).expect(404);
    await alpha.agent
      .put(path(theirs))
      .send({ ...FIXED, reorderPoint: '1' })
      .expect(404);
    await alpha.agent.delete(path(theirs)).expect(404);

    expect((await pointOf(theirs)).reorderPoint).toBe('2000.0000');
  });

  it('is the Owner’s alone until a made role gives it', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const d3 = await variant(alpha, 'D3-1000');
    await alpha.agent.post(path(d3)).send(FIXED).expect(204);

    const admin = await addMember(
      app,
      alpha,
      'admin@alpha.example.com',
      'Admin',
    );
    const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');
    for (const member of [admin, viewer]) {
      await member.post(path(d3)).send(FIXED).expect(403);
      await member.put(path(d3)).send(FIXED).expect(403);
      await member.delete(path(d3)).expect(403);
      await member
        .get(`${path(d3)}/preview`)
        .query(FIXED_QUERY)
        .expect(403);
    }

    await customRole(app, alpha.organizationId, 'Buyer', [
      'users.view',
      'roles.view',
      'organizations.view',
      'stock.view',
      'products.view',
      'stock.reorder',
    ]);
    const buyer = await addMember(
      app,
      alpha,
      'buyer@alpha.example.com',
      'Buyer',
    );
    await buyer
      .get(`${path(d3)}/preview`)
      .query(FIXED_QUERY)
      .expect(200);
    await buyer
      .put(path(d3))
      .send({ ...FIXED, reorderPoint: '2500' })
      .expect(204);
    await buyer.delete(path(d3)).expect(204);
  });

  describe('the audit log', () => {
    async function entries(variantId: string) {
      return db
        .select({
          action: auditLog.action,
          resourceType: auditLog.resourceType,
          resourceId: auditLog.resourceId,
          resourceLabel: auditLog.resourceLabel,
          payload: auditLog.payload,
        })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.resourceType, 'reorder_point'),
            eq(auditLog.resourceId, variantId),
          ),
        )
        .orderBy(asc(auditLog.id));
    }

    it('records its numbers, its rule, and bought or made, by its item', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await variant(alpha, 'D3-1000');

      await alpha.agent.post(path(d3)).send(FIXED).expect(204);
      await alpha.agent
        .put(path(d3))
        .send({
          source: 'bought',
          reorderPoint: '2000',
          rule: 'maximum',
          fixedQuantity: null,
          maximumQuantity: '5000',
        })
        .expect(204);
      await alpha.agent.delete(path(d3)).expect(204);

      expect(await entries(d3)).toEqual([
        {
          action: 'reorder_point.created',
          resourceType: 'reorder_point',
          resourceId: d3,
          resourceLabel: 'D3-1000',
          payload: {
            source: 'bought',
            reorderPoint: '2000',
            rule: 'fixed',
            fixedQuantity: '1000',
          },
        },
        {
          action: 'reorder_point.updated',
          resourceType: 'reorder_point',
          resourceId: d3,
          resourceLabel: 'D3-1000',
          payload: {
            source: { from: 'bought', to: 'bought' },
            reorderPoint: { from: '2000', to: '2000' },
            rule: { from: 'fixed', to: 'maximum' },
            fixedQuantity: { from: '1000', to: null },
            maximumQuantity: { from: null, to: '5000' },
          },
        },
        // The point that went, named by its item, which stays.
        {
          action: 'reorder_point.removed',
          resourceType: 'reorder_point',
          resourceId: d3,
          resourceLabel: 'D3-1000',
          payload: {
            source: 'bought',
            reorderPoint: '2000',
            rule: 'maximum',
            maximumQuantity: '5000',
          },
        },
      ]);
    });

    it('writes nothing for a change that changes nothing', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await variant(alpha, 'D3-1000');
      await alpha.agent.post(path(d3)).send(FIXED).expect(204);

      await alpha.agent.put(path(d3)).send(FIXED).expect(204);

      expect((await entries(d3)).map((entry) => entry.action)).toEqual([
        'reorder_point.created',
      ]);
    });
  });

  /** A page of the list, as the screen asks for it. */
  async function listed(org: Org, query = ''): Promise<Page> {
    return body<Page>(
      await org.agent.get(`/v1/stock/reorder-points${query}`).expect(200),
    );
  }

  const skus = (page: Page) => page.entries.map((row) => row.sku);

  /**
   * Six items with a point, each with all its stock on one shelf, so each
   * position is its stock: out, three low at different shares of their
   * point, and two with enough.
   */
  async function sixItems(org: Org) {
    const shelf = await site(org.agent, 'SHELF');
    const items: [string, string, string][] = [
      ['A-ENOUGH', '300', '100'],
      ['B-HALF', '50', '100'],
      ['C-OUT', '0', '10'],
      ['D-NEAR', '90', '100'],
      ['E-AT', '100', '100'],
      ['F-QUARTER', '250', '1000'],
    ];
    for (const [sku, onHand, reorderPoint] of items) {
      const id = await item(org.agent, sku);
      if (onHand !== '0') await receive(org.agent, id, shelf, onHand);
      await point(org.agent, id, reorderPoint);
    }
    return shelf;
  }

  describe('the list', () => {
    it('puts the low first, the furthest below its point as a share of it first, then the rest by SKU', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await sixItems(alpha);

      const page = await listed(alpha);

      expect(skus(page)).toEqual([
        'C-OUT',
        'F-QUARTER',
        'B-HALF',
        'D-NEAR',
        'A-ENOUGH',
        'E-AT',
      ]);
      expect(page.entries.map((row) => row.status)).toEqual([
        'out',
        'low',
        'low',
        'low',
        'enough',
        'enough',
      ]);
      expect(page.entries[1]).toMatchObject({
        sku: 'F-QUARTER',
        productName: 'F-QUARTER',
        position: '250.0000',
        suggestion: '750.0000',
        suggestedMultiples: null,
      });
      expect(page.nextCursor).toBeNull();
    });

    it('filters to the low, the out among them, or the out alone, and counts each', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await sixItems(alpha);

      expect(skus(await listed(alpha, '?status=low'))).toEqual([
        'C-OUT',
        'F-QUARTER',
        'B-HALF',
        'D-NEAR',
      ]);
      expect(skus(await listed(alpha, '?status=out'))).toEqual(['C-OUT']);
      expect(
        body(
          await alpha.agent
            .get('/v1/stock/reorder-points/counts?status=out')
            .expect(200),
        ),
      ).toEqual({ all: 6, low: 4, out: 1 });

      await alpha.agent
        .get('/v1/stock/reorder-points?status=enough')
        .expect(400);
    });

    it('searches as every list does, its counts with it', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await sixItems(alpha);

      expect(skus(await listed(alpha, '?search=half'))).toEqual(['B-HALF']);
      expect(skus(await listed(alpha, '?status=low&search=-'))).toHaveLength(4);
      expect(
        body(
          await alpha.agent
            .get('/v1/stock/reorder-points/counts?search=out')
            .expect(200),
        ),
      ).toEqual({ all: 1, low: 1, out: 1 });
    });

    it('pages in its order, each page after the last, and refuses a cursor not in it', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');
      await sixItems(alpha);

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string = cursor ? `?limit=4&before=${cursor}` : '?limit=4';
        const page = await listed(alpha, query);
        seen.push(...skus(page));
        cursor = page.nextCursor;
      } while (cursor);

      expect(seen).toEqual([
        'C-OUT',
        'F-QUARTER',
        'B-HALF',
        'D-NEAR',
        'A-ENOUGH',
        'E-AT',
      ]);

      const theirs = await item(beta.agent, 'THEIRS');
      await point(beta.agent, theirs, '5');
      const [their] = (await listed(beta)).entries;
      await alpha.agent
        .get(`/v1/stock/reorder-points?before=${their.id}`)
        .expect(400);
    });

    it('shows each draft on its row, newest first, and suggests what they leave', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await item(alpha.agent, 'D3-1000');
      const bottle = await item(alpha.agent, 'BOTTLE');
      const shelf = await site(alpha.agent, 'SHELF');
      const supplier = await partner(alpha.agent, 'Nordic Supply');
      await point(alpha.agent, d3, '2000', {
        rule: 'fixed',
        fixedQuantity: '1000',
      });

      const purchase = await order(
        alpha.agent,
        'purchase',
        supplier,
        d3,
        '500',
        {
          draft: true,
        },
      );
      const bomId = await recipe(alpha.agent, d3, bottle, '1');
      const runId = await run(alpha.agent, {
        outputId: d3,
        bomId,
        locationId: shelf,
        quantityPlanned: '250',
        reference: 'B-0042',
      });

      const [row] = (await listed(alpha)).entries;

      expect(row).toMatchObject({
        status: 'out',
        suggestion: '2000.0000',
        suggestedMultiples: '2',
        // 750 in draft leaves two cases to order: not drafted.
        drafted: false,
        drafts: [
          { kind: 'run', id: runId, number: 'B-0042', quantity: '250.0000' },
          {
            kind: 'purchase',
            id: purchase.id,
            number: purchase.number,
            quantity: '500.0000',
          },
        ],
      });
    });

    it('lists only its own organization’s points', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');
      await point(alpha.agent, await item(alpha.agent, 'OURS'), '5');
      await point(beta.agent, await item(beta.agent, 'THEIRS'), '5');

      expect(skus(await listed(alpha))).toEqual(['OURS']);
      expect(
        body(
          await alpha.agent.get('/v1/stock/reorder-points/counts').expect(200),
        ),
      ).toEqual({ all: 1, low: 1, out: 1 });
    });

    it('is read with stock.view alone, as a Viewer holds it', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await item(alpha.agent, 'D3-1000');
      await point(alpha.agent, d3, '5');
      const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');

      for (const path of [
        '/v1/stock/reorder-points',
        '/v1/stock/reorder-points/counts',
        '/v1/stock/reorder-points/export',
        `/v1/stock/reorder-points/${d3}`,
      ]) {
        await viewer.get(path).expect(200);
      }

      await customRole(app, alpha.organizationId, 'Sales', [
        'users.view',
        'roles.view',
        'organizations.view',
        'orders.view',
      ]);
      const sales = await addMember(
        app,
        alpha,
        'sales@alpha.example.com',
        'Sales',
      );
      await sales.get('/v1/stock/reorder-points').expect(403);
      await sales.get(`/v1/stock/reorder-points/${d3}`).expect(403);
    });
  });

  describe('an item’s detail', () => {
    interface Detail {
      point: {
        source: string;
        reorderPoint: string;
        rule: string;
        fixedQuantity: string | null;
        maximumQuantity: string | null;
      };
      usable: {
        locationName: string;
        usable: string;
        expired: string;
        issued: string;
      }[];
      expired: string;
      issued: string;
      coming: {
        kind: string;
        number: string | null;
        partnerName: string | null;
        quantity: string;
        expectedAt: string | null;
        late: boolean;
      }[];
      stillNeeded: {
        number: string;
        partnerName: string;
        quantity: string;
      }[];
      drafts: { kind: string; quantity: string }[];
    }

    async function detailOf(org: Org, variantId: string) {
      return body<Detail>(await org.agent.get(path(variantId)).expect(200));
    }

    it('lists usable stock by location marked available, with what was left out', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const bottle = await item(alpha.agent, 'BOTTLE', true);
      const focus = await item(alpha.agent, 'FOCUS-60CT');
      const shelf = await site(alpha.agent, 'SHELF');
      const kitchen = await site(alpha.agent, 'KITCHEN');
      const quarantine = await site(alpha.agent, 'QUARANTINE', false);
      await receive(alpha.agent, bottle, shelf, '40', {
        code: 'L-OLD',
        expiresAt: '2020-01-01',
      });
      await receive(alpha.agent, bottle, shelf, '500', {
        code: 'L-NEW',
        expiresAt: '2099-01-01',
      });
      await receive(alpha.agent, bottle, quarantine, '30', {
        code: 'L-NEW',
      });
      await point(alpha.agent, bottle, '100');
      const bomId = await recipe(alpha.agent, focus, bottle, '1');
      // Earliest expiry first takes the expired lot first, then 60 more.
      await run(
        alpha.agent,
        { outputId: focus, bomId, locationId: kitchen, quantityPlanned: '100' },
        shelf,
      );

      const detail = await detailOf(alpha, bottle);

      expect(detail).toMatchObject({
        usable: [
          {
            locationName: 'KITCHEN',
            usable: '0.0000',
            expired: '40.0000',
            issued: '60.0000',
          },
          {
            locationName: 'SHELF',
            usable: '440.0000',
            expired: '0.0000',
            issued: '0.0000',
          },
        ],
        expired: '40.0000',
        issued: '60.0000',
      });
      // The row's usable is what the lines add up to.
      const [row] = (await listed(alpha)).entries;
      expect(row.position).toBe('440.0000');
    });

    it('lists each purchase and run coming, a purchase late once its day has passed, and each sale still needing it', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const focus = await item(alpha.agent, 'FOCUS-60CT');
      const bottle = await item(alpha.agent, 'BOTTLE');
      const shelf = await site(alpha.agent, 'SHELF');
      const supplier = await partner(alpha.agent, 'Nordic Supply');
      const customer = await partner(alpha.agent, 'Northside Pharmacy');
      await receive(alpha.agent, bottle, shelf, '1000');
      await receive(alpha.agent, focus, shelf, '50');
      await point(alpha.agent, focus, '100');

      const late = await order(alpha.agent, 'purchase', supplier, focus, '60', {
        expectedAt: '2020-01-01',
      });
      const due = await order(alpha.agent, 'purchase', supplier, focus, '40', {
        expectedAt: '2099-01-01',
      });
      const bomId = await recipe(alpha.agent, focus, bottle, '1');
      const runId = await run(
        alpha.agent,
        {
          outputId: focus,
          bomId,
          locationId: shelf,
          quantityPlanned: '30',
          reference: 'B-0007',
        },
        shelf,
      );
      await output(alpha.agent, runId, '10');
      const sale = await order(alpha.agent, 'sale', customer, focus, '45');
      await ship(alpha.agent, sale, shelf, '5');

      const detail = await detailOf(alpha, focus);

      expect(detail.coming).toEqual([
        {
          kind: 'purchase',
          id: late.id,
          number: late.number,
          partnerName: 'Nordic Supply',
          quantity: '60.0000',
          expectedAt: '2020-01-01',
          late: true,
        },
        {
          kind: 'purchase',
          id: due.id,
          number: due.number,
          partnerName: 'Nordic Supply',
          quantity: '40.0000',
          expectedAt: '2099-01-01',
          late: false,
        },
        {
          kind: 'run',
          id: runId,
          number: 'B-0007',
          partnerName: null,
          quantity: '20.0000',
          expectedAt: null,
          late: false,
        },
      ]);
      expect(detail.stillNeeded).toEqual([
        {
          orderId: sale.id,
          number: sale.number,
          partnerName: 'Northside Pharmacy',
          quantity: '40.0000',
          expectedAt: null,
        },
      ]);
      // 55 usable, 120 coming, 40 still needed.
      const [row] = (await listed(alpha)).entries;
      expect(row).toMatchObject({ position: '135.0000', status: 'enough' });
    });

    it('carries the point itself, as Edit opens with it', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await variant(alpha, 'D3-1000');
      await alpha.agent.post(path(d3)).send(FIXED).expect(204);

      expect((await detailOf(alpha, d3)).point).toEqual({
        source: 'bought',
        reorderPoint: '2000.0000',
        rule: 'fixed',
        fixedQuantity: '1000.0000',
        maximumQuantity: null,
      });
    });

    it('finds no item without a point, nor another organization’s', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');
      const none = await item(alpha.agent, 'NONE');
      const theirs = await item(beta.agent, 'THEIRS');
      await point(beta.agent, theirs, '5');

      const res = await alpha.agent.get(path(none)).expect(404);
      expect((res.body as Refusal).message).toBe(
        'That item has no reorder point',
      );
      await alpha.agent.get(path(theirs)).expect(404);
      await alpha.agent.get(path('NONE')).expect(400);
    });
  });

  describe('the preview', () => {
    interface Preview {
      position: string;
      status: string;
      suggestion: string;
      suggestedMultiples: string | null;
      drafted: boolean;
      after: string;
      afterStatus: string;
    }

    const preview = (org: Org, variantId: string, query: object) =>
      org.agent.get(`${path(variantId)}/preview`).query(query);

    it('works an item out against the values typed, with no point yet, and saves nothing', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await item(alpha.agent, 'D3-1000');
      const shelf = await site(alpha.agent, 'SHELF');
      await receive(alpha.agent, d3, shelf, '800');

      const fixed = await preview(alpha, d3, FIXED_QUERY).expect(200);
      expect(fixed.body as Preview).toEqual({
        position: '800.0000',
        status: 'low',
        suggestion: '2000.0000',
        suggestedMultiples: '2',
        drafted: false,
        after: '2800.0000',
        afterStatus: 'enough',
      });

      const upTo = await preview(alpha, d3, {
        source: 'bought',
        reorderPoint: '1000',
        rule: 'maximum',
        maximumQuantity: '1500',
      }).expect(200);
      expect(upTo.body as Preview).toMatchObject({
        status: 'low',
        suggestion: '700.0000',
        suggestedMultiples: null,
        after: '1500.0000',
        afterStatus: 'enough',
      });

      const enough = await preview(alpha, d3, {
        source: 'bought',
        reorderPoint: '500',
        rule: 'just_enough',
      }).expect(200);
      expect(enough.body as Preview).toMatchObject({
        status: 'enough',
        suggestion: '0.0000',
        after: '800.0000',
        afterStatus: 'enough',
      });

      expect(await pointOf(d3)).toBeUndefined();
    });

    it('follows the values typed, not the point kept', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await item(alpha.agent, 'D3-1000');
      const shelf = await site(alpha.agent, 'SHELF');
      await receive(alpha.agent, d3, shelf, '800');
      await point(alpha.agent, d3, '100');

      const res = await preview(alpha, d3, {
        source: 'bought',
        reorderPoint: '1000',
        rule: 'just_enough',
      }).expect(200);
      expect(res.body as Preview).toMatchObject({
        status: 'low',
        suggestion: '200.0000',
        after: '1000.0000',
      });
      expect((await pointOf(d3)).reorderPoint).toBe('100.0000');
    });

    it('refuses as saving refuses', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');
      const cap = await item(alpha.agent, 'CAP-38MM');
      const theirs = await item(beta.agent, 'THEIRS');

      const atPoint = await preview(alpha, cap, {
        source: 'bought',
        reorderPoint: '200',
        rule: 'maximum',
        maximumQuantity: '200',
      }).expect(400);
      expect(atPoint.body as Refusal).toMatchObject({
        message: 'The maximum must be above the reorder point, 200.',
        code: 'reorder_maximum_not_above_point',
      });

      for (const refused of [
        { ...FIXED_QUERY, reorderPoint: '0' },
        { ...FIXED_QUERY, fixedQuantity: '-5' },
        { ...FIXED_QUERY, fixedQuantity: undefined },
        { ...FIXED_QUERY, rule: 'whenever' },
      ]) {
        await preview(alpha, cap, refused).expect(400);
      }

      await preview(alpha, theirs, FIXED_QUERY).expect(404);
      await preview(
        alpha,
        '019a3a3c-0000-7000-8000-000000000000',
        FIXED_QUERY,
      ).expect(404);
      await preview(alpha, 'CAP-38MM', FIXED_QUERY).expect(400);
    });
  });

  describe('the export', () => {
    it('writes the list as CSV, filtered as asked, with headers in the reader’s language, and records it', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await sixItems(alpha);

      const res = await alpha.agent
        .get('/v1/stock/reorder-points/export?status=out')
        .set('Accept-Language', 'zh-Hans')
        .expect(200);
      const lines = res.text
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\r\n');

      expect(lines).toEqual([
        'SKU,物品,规格,状态,采购或自制,现有可用,在途,待发,预计可用,再订货点,订货量,固定订货量,最高库存,草稿中,建议订货,单位',
        'C-OUT,C-OUT,,out,bought,0.0000,0.0000,0.0000,0.0000,10.0000,just_enough,,,0.0000,10.0000,each',
      ]);
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="reorder-points-\d{4}-\d{2}-\d{2}\.csv"$/,
      );

      const [entry] = await db
        .select({
          resourceType: auditLog.resourceType,
          payload: auditLog.payload,
        })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.organizationId, alpha.organizationId),
            eq(auditLog.action, 'list.exported'),
          ),
        );
      expect(entry).toEqual({
        resourceType: 'reorder_points',
        payload: {
          list: 'reorder_points',
          filters: { status: 'out' },
          rows: 1,
        },
      });
    });
  });
});
