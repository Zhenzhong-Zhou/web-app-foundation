import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { auditLog, stockMovements } from '../src/database/schema';
import {
  addMember,
  body,
  createE2eApp,
  createLocation,
  createVariant,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

interface RunDetail {
  id: string;
  status: string;
  licenceId: string | null;
  licenceNumber: string | null;
  licenceStatusAtRelease: string | null;
  licenceOverriddenBy: string | null;
  licenceOverriddenByName: string | null;
  licenceOverrideReason: string | null;
  outputLots: string[];
}

interface IssuePlan {
  lines: unknown[];
  licenceCheck: {
    licence: { id: string; number: string; authority: string } | null;
    status: string;
    outcome: 'allow' | 'override' | 'block';
  };
}

interface LotTrace {
  sources: {
    kind: string;
    licenceId: string | null;
    licenceNumber: string | null;
    licenceStatusAtRelease: string | null;
    licenceOverriddenByName: string | null;
    licenceOverrideReason: string | null;
  }[];
}

/** What the licence on the recipe looks like; null for a recipe with none. */
interface LicenceShape {
  issuedAt?: string;
  expiresAt?: string;
  withdrawn?: boolean;
}

/**
 * A licence's state checked at release against the organization's policy
 * (ADR-050): each state under each setting, the override with and without
 * the permission, and the record a released run keeps.
 *
 * Every refusal is also checked for what it left behind — a draft run and
 * no movements — because a 409 after half a release would be worse than no
 * check at all.
 */
describe('Licence at release (e2e)', () => {
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

  type Org = Awaited<ReturnType<typeof registerOrganization>>;
  type Agent = Org['agent'];

  /** A calendar day relative to today, as the licence form sends it. */
  function day(offset: number): string {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
        offset * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);
  }

  /**
   * A recipe for a lot-tracked finished good from one untracked blend, the
   * licence as described, the blend on a shelf, and a run planned against
   * it. The licence is attached before the run, because a run locks the
   * recipe's licence (ADR-040); its dates can still change afterwards.
   */
  async function scenario(org: Org, licence: LicenceShape | null) {
    const site = await createLocation(org.agent, {
      name: 'SITE',
      code: 'SITE',
      type: 'site',
    });
    const shelf = await createLocation(org.agent, {
      name: 'SHELF',
      code: 'SHELF',
      type: 'bin',
      parentId: site,
    });
    const wip = await createLocation(org.agent, {
      name: 'WIP',
      code: 'WIP',
      type: 'bin',
      parentId: site,
    });

    const output = await createVariant(org.agent, {
      type: 'good',
      name: 'Focus',
      variant: { sku: 'FOCUS-60CT', unitOfMeasure: 'each', tracksLots: true },
    });
    const blend = await createVariant(org.agent, {
      type: 'material',
      name: 'Blend',
      variant: { sku: 'BLEND', unitOfMeasure: 'each', tracksLots: false },
    });

    let licenceId: string | undefined;

    if (licence) {
      licenceId = body<{ licence: { id: string } }>(
        await org.agent
          .post('/v1/product-licences')
          .send({
            number: '80012345',
            authority: 'Health Canada',
            issuedAt: licence.issuedAt,
            expiresAt: licence.expiresAt,
          })
          .expect(201),
      ).licence.id;

      if (licence.withdrawn) {
        await org.agent
          .patch(`/v1/product-licences/${licenceId}`)
          .send({ isActive: false })
          .expect(204);
      }
    }

    const bomId = body<{ bom: { id: string } }>(
      await org.agent
        .post('/v1/boms')
        .send({
          outputVariantId: output,
          outputQuantity: '1000',
          licenceId,
          lines: [{ componentVariantId: blend, quantity: '2400' }],
        })
        .expect(201),
    ).bom.id;
    await org.agent.post(`/v1/boms/${bomId}/promote`).expect(204);

    await org.agent
      .post('/v1/stock/movements')
      .send({
        variantId: blend,
        toLocationId: shelf,
        quantity: '10000',
        reason: 'receipt',
      })
      .expect(201);

    const runId = body<{ productionOrder: { id: string } }>(
      await org.agent
        .post('/v1/production-orders')
        .send({
          outputVariantId: output,
          bomId,
          locationId: wip,
          quantityPlanned: '500',
        })
        .expect(201),
    ).productionOrder.id;

    return { shelf, runId, licenceId };
  }

  function release(
    agent: Agent,
    s: { runId: string; shelf: string },
    extra: Record<string, unknown> = {},
  ) {
    return agent
      .post(`/v1/production-orders/${s.runId}/release`)
      .send({ sourceLocationId: s.shelf, ...extra });
  }

  async function detail(agent: Agent, runId: string) {
    return body<RunDetail>(
      await agent.get(`/v1/production-orders/${runId}`).expect(200),
    );
  }

  async function setPolicy(org: Org, policy: Record<string, unknown>) {
    await org.agent.patch('/v1/organization').send(policy).expect(204);
  }

  /** A refusal must leave the run planned and the shelf untouched. */
  async function expectNothingReleased(agent: Agent, runId: string) {
    expect((await detail(agent, runId)).status).toBe('draft');

    const moved = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.referenceId, runId));
    expect(moved).toHaveLength(0);
  }

  function message(res: { body: unknown }): string {
    return body<{ message: string }>(res).message;
  }

  const OVERRIDE = { licenceOverride: { reason: 'Renewal filed 3 Sept' } };

  describe('a licence in force', () => {
    it('releases under a current licence and records it', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, {});

      await release(org.agent, s).expect(200);

      const run = await detail(org.agent, s.runId);
      expect(run.licenceStatusAtRelease).toBe('current');
      expect(run.licenceId).toBe(s.licenceId);
      expect(run.licenceOverriddenBy).toBeNull();
      expect(run.licenceOverrideReason).toBeNull();
    });

    // "Expires today" on the Licences page; still usable today.
    it('treats a licence expiring today as current', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, { expiresAt: day(0) });

      await release(org.agent, s).expect(200);

      expect((await detail(org.agent, s.runId)).licenceStatusAtRelease).toBe(
        'current',
      );
    });

    /**
     * Renewed between opening the dialog and pressing Release: the override
     * changed nothing, so nothing says it did.
     */
    it('ignores an override sent for a current licence', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, {});

      await release(org.agent, s, OVERRIDE).expect(200);

      const run = await detail(org.agent, s.runId);
      expect(run.licenceStatusAtRelease).toBe('current');
      expect(run.licenceOverriddenBy).toBeNull();
      expect(run.licenceOverrideReason).toBeNull();
    });
  });

  describe('no licence on the recipe', () => {
    it('releases and records none, by default', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, null);

      await release(org.agent, s).expect(200);

      const run = await detail(org.agent, s.runId);
      expect(run.licenceStatusAtRelease).toBe('none');
      expect(run.licenceNumber).toBeNull();
    });

    // Required means refused outright: no override makes an unregistered
    // product registered.
    it('refuses when the organization requires a licence, override or not', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, null);
      await setPolicy(org, { licenceRequired: true });

      const res = await release(org.agent, s).expect(409);
      expect(message(res)).toMatch(/requires one/);

      await release(org.agent, s, OVERRIDE).expect(409);
      await expectNothingReleased(org.agent, s.runId);
    });
  });

  describe('a licence not yet in force', () => {
    it('is refused by default, with the day it takes effect', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, { issuedAt: day(1) });

      const res = await release(org.agent, s).expect(409);
      expect(message(res)).toContain(`not in force until ${day(1)}`);

      await release(org.agent, s, OVERRIDE).expect(409);
      await expectNothingReleased(org.agent, s.runId);
    });

    it('needs an override with a reason when the policy says so', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, { issuedAt: day(1) });
      await setPolicy(org, { licenceNotInForcePolicy: 'override' });

      await release(org.agent, s).expect(409);
      await release(org.agent, s, OVERRIDE).expect(200);

      const run = await detail(org.agent, s.runId);
      expect(run.licenceStatusAtRelease).toBe('not_in_force');
      expect(run.licenceOverrideReason).toBe('Renewal filed 3 Sept');
    });

    it('is released and recorded when the policy allows it', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, { issuedAt: day(1) });
      await setPolicy(org, { licenceNotInForcePolicy: 'allow' });

      await release(org.agent, s).expect(200);

      const run = await detail(org.agent, s.runId);
      expect(run.licenceStatusAtRelease).toBe('not_in_force');
      expect(run.licenceOverriddenBy).toBeNull();
    });
  });

  describe('an expired licence', () => {
    it('needs an override by default, and says who can give one', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, { expiresAt: day(-1) });

      const res = await release(org.agent, s).expect(409);
      expect(message(res)).toContain(`expired on ${day(-1)}`);
      expect(message(res)).toContain('production.override_licence');
      await expectNothingReleased(org.agent, s.runId);
    });

    it('records the override: the state, who, and why', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, { expiresAt: day(-1) });

      await release(org.agent, s, OVERRIDE).expect(200);

      const run = await detail(org.agent, s.runId);
      expect(run.status).toBe('released');
      expect(run.licenceStatusAtRelease).toBe('expired');
      expect(run.licenceOverriddenBy).toBe(org.userId);
      expect(run.licenceOverriddenByName).toBe('Owner');
      expect(run.licenceOverrideReason).toBe('Renewal filed 3 Sept');
    });

    it('is refused outright when the policy blocks, even with an override', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, { expiresAt: day(-1) });
      await setPolicy(org, { licenceExpiredPolicy: 'block' });

      const res = await release(org.agent, s, OVERRIDE).expect(409);
      expect(message(res)).not.toContain('production.override_licence');
      await expectNothingReleased(org.agent, s.runId);
    });

    it('is released when the policy allows, and an override sent anyway is ignored', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, { expiresAt: day(-1) });
      await setPolicy(org, { licenceExpiredPolicy: 'allow' });

      await release(org.agent, s, OVERRIDE).expect(200);

      const run = await detail(org.agent, s.runId);
      expect(run.licenceStatusAtRelease).toBe('expired');
      expect(run.licenceOverriddenBy).toBeNull();
      expect(run.licenceOverrideReason).toBeNull();
    });
  });

  describe('a withdrawn licence', () => {
    // Not configurable: an override would undo a withdrawal without saying so.
    it('is refused whatever the policy, override or not', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, { withdrawn: true });
      await setPolicy(org, {
        licenceNotInForcePolicy: 'allow',
        licenceExpiredPolicy: 'allow',
      });

      const res = await release(org.agent, s).expect(409);
      expect(message(res)).toContain('withdrawn');

      await release(org.agent, s, OVERRIDE).expect(409);
      await expectNothingReleased(org.agent, s.runId);
    });
  });

  describe('the override', () => {
    /**
     * An Admin can release (production.release) but not override: the
     * permission is Owner-only until an organization widens it.
     */
    it('is refused to someone without production.override_licence', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, { expiresAt: day(-1) });
      const admin = await addMember(
        app,
        org,
        'admin@alpha.example.com',
        'Admin',
      );

      await release(admin, s, OVERRIDE).expect(403);
      await release(admin, s).expect(409);
      await expectNothingReleased(org.agent, s.runId);
    });

    // The guard asks before the service knows whether one is needed.
    it('is refused to them even when the licence is current', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, {});
      const admin = await addMember(
        app,
        org,
        'admin@alpha.example.com',
        'Admin',
      );

      await release(admin, s, OVERRIDE).expect(403);
      await release(admin, s).expect(200);
    });

    it('needs a reason that is not blank', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, { expiresAt: day(-1) });

      await release(org.agent, s, {
        licenceOverride: { reason: '   ' },
      }).expect(400);
      await release(org.agent, s, { licenceOverride: {} }).expect(400);
      await expectNothingReleased(org.agent, s.runId);
    });

    /**
     * The audit row says an override happened and against what; the reason
     * is free text and stays on the run (ADR-018).
     */
    it('is in the audit log as a fact, without the reason', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, { expiresAt: day(-1) });

      await release(org.agent, s, OVERRIDE).expect(200);

      const [entry] = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'production_order.released'),
            eq(auditLog.resourceId, s.runId),
          ),
        );

      expect(entry.payload).toEqual({
        licenceStatus: 'expired',
        licenceOverridden: true,
      });
      expect(JSON.stringify(entry.payload)).not.toContain('Renewal');
    });
  });

  describe('reads', () => {
    it('previews in the issue plan what release would do', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, { expiresAt: day(-1) });

      const plan = body<IssuePlan>(
        await org.agent
          .get(
            `/v1/production-orders/${s.runId}/issue-plan?sourceLocationId=${s.shelf}`,
          )
          .expect(200),
      );

      expect(plan.licenceCheck.licence?.number).toBe('80012345');
      expect(plan.licenceCheck.status).toBe('expired');
      expect(plan.licenceCheck.outcome).toBe('override');

      await setPolicy(org, { licenceExpiredPolicy: 'block' });

      const blocked = body<IssuePlan>(
        await org.agent
          .get(
            `/v1/production-orders/${s.runId}/issue-plan?sourceLocationId=${s.shelf}`,
          )
          .expect(200),
      );
      expect(blocked.licenceCheck.outcome).toBe('block');
    });

    it('previews a recipe with no licence as none', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, null);

      const plan = body<IssuePlan>(
        await org.agent
          .get(
            `/v1/production-orders/${s.runId}/issue-plan?sourceLocationId=${s.shelf}`,
          )
          .expect(200),
      );

      expect(plan.licenceCheck).toEqual({
        licence: null,
        status: 'none',
        outcome: 'allow',
      });
    });

    // Where a recall starts: the batch, then what it was made under.
    it('shows the state and the override on the lot the run made', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await scenario(org, { expiresAt: day(-1) });

      await release(org.agent, s, OVERRIDE).expect(200);
      await org.agent
        .post(`/v1/production-orders/${s.runId}/output`)
        .send({ quantity: '480', lot: { code: 'FOC-TEST-01' } })
        .expect(201);

      const [lotId] = (await detail(org.agent, s.runId)).outputLots;

      const trace = body<LotTrace>(
        await org.agent.get(`/v1/stock/lots/${lotId}/trace`).expect(200),
      );
      const [source] = trace.sources.filter((row) => row.kind === 'production');

      expect(source.licenceId).toBe(s.licenceId);
      expect(source.licenceNumber).toBe('80012345');
      expect(source.licenceStatusAtRelease).toBe('expired');
      expect(source.licenceOverriddenByName).toBe('Owner');
      expect(source.licenceOverrideReason).toBe('Renewal filed 3 Sept');
    });
  });
});
