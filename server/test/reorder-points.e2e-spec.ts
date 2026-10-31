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
  createE2eApp,
  createVariant,
  customRole,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

type Org = Awaited<ReturnType<typeof registerOrganization>>;

interface Refusal {
  message: string;
  code?: string;
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
});
