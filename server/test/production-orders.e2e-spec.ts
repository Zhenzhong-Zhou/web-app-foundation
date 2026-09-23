import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  lots,
  notifications,
  productionOrderLines,
  productionOrders,
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

interface RunResponse {
  id: string;
  status: 'draft' | 'released' | 'completed' | 'cancelled';
  quantityPlanned: string;
  quantityProduced: string;
  reference: string | null;
  licenceNumber: string | null;
}

interface RunDetailResponse extends RunResponse {
  lines: {
    id: string;
    componentVariantId: string;
    quantityPlanned: string;
    quantityConsumed: string;
    supplyType: 'stocked' | 'external';
    sourceLocationId: string | null;
  }[];
  outputLots: string[];
}

interface CreatedRun {
  productionOrder: RunResponse;
}

interface CloseResponse {
  variances: { lineId: string; variance: number }[];
  outputVariance: {
    quantityPlanned: string;
    quantityProduced: string;
    variance: number;
  } | null;
}

interface CancelResponse {
  strandedLines: { id: string }[];
}

interface ProductResponse {
  product: { id: string; variants: { id: string }[] };
}

interface LocationResponse {
  location: { id: string };
}

interface CreatedBom {
  bom: { id: string };
}

interface RegisterResponse {
  user: { id: string; organizationId: string };
}

interface RunPage {
  entries: RunResponse[];
  nextCursor: string | null;
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * Making one variant out of others (ADR-030, ADR-032).
 *
 * The interesting assertions are about the ledger rather than the rows: that
 * release moves material without consuming it, that output can happen twice,
 * that consuming over plan tops up instead of failing, and that cancelling
 * leaves issued material exactly where it is.
 */
describe('Production orders (e2e)', () => {
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

  type Org = Awaited<ReturnType<typeof registerOrg>>;

  async function makeVariant(
    org: Org,
    sku: string,
    type: 'good' | 'material' | 'packaging' = 'good',
    tracksLots = false,
  ) {
    const res = await org.agent
      .post('/v1/products')
      .send({
        type,
        name: sku,
        variant: { sku, unitOfMeasure: 'each', tracksLots },
      })
      .expect(201);

    return body<ProductResponse>(res).product.variants[0].id;
  }

  async function makeLocation(org: Org, name: string, parentId?: string) {
    const res = await org.agent
      .post('/v1/locations')
      .send({ name, code: name, type: parentId ? 'bin' : 'site', parentId })
      .expect(201);

    return body<LocationResponse>(res).location.id;
  }

  /**
   * One finished good made from a blend and a bottle the co-packer supplies,
   * with 10000 of the blend on a shelf. Enough to exercise both supply types.
   */
  async function scenario(org: Org) {
    const site = await makeLocation(org, 'SITE');
    const [shelf, wip] = await Promise.all([
      makeLocation(org, 'SHELF', site),
      makeLocation(org, 'WIP', site),
    ]);

    const [output, blend, bottle] = await Promise.all([
      makeVariant(org, 'D3-60CT', 'good', true),
      makeVariant(org, 'BLEND-D3', 'material'),
      makeVariant(org, 'BOTTLE', 'packaging'),
    ]);

    const bomRes = await org.agent
      .post('/v1/boms')
      .send({
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [
          { componentVariantId: blend, quantity: '2400' },
          {
            componentVariantId: bottle,
            quantity: '1000',
            supplyType: 'external',
          },
        ],
      })
      .expect(201);

    const bomId = body<CreatedBom>(bomRes).bom.id;
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

    return { site, shelf, wip, output, blend, bottle, bomId };
  }

  async function createRun(
    org: Org,
    fields: Record<string, unknown>,
  ): Promise<RunResponse> {
    const res = await org.agent
      .post('/v1/production-orders')
      .send(fields)
      .expect(201);

    return body<CreatedRun>(res).productionOrder;
  }

  async function onHand(variantId: string, locationId: string) {
    const [level] = await db
      .select()
      .from(stockLevels)
      .where(
        and(
          eq(stockLevels.variantId, variantId),
          eq(stockLevels.locationId, locationId),
        ),
      );

    return level?.quantity ?? '0.0000';
  }

  describe('creation', () => {
    it('creates a draft', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const run = await createRun(alpha, {
        outputVariantId: s.output,
        bomId: s.bomId,
        locationId: s.wip,
        quantityPlanned: '500',
      });

      expect(run.status).toBe('draft');
      expect(run.quantityProduced).toBe('0.0000');
    });

    it('refuses a BOM that makes a different variant', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);
      const other = await makeVariant(alpha, 'OTHER');

      await alpha.agent
        .post('/v1/production-orders')
        .send({
          outputVariantId: other,
          bomId: s.bomId,
          locationId: s.wip,
          quantityPlanned: '500',
        })
        .expect(400);
    });

    // The DTO accepted a reference while create() never wrote it, and only a
    // browser test noticed. Pinned here, where it belongs.
    it('keeps the reference a run is planned with', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const run = await createRun(alpha, {
        outputVariantId: s.output,
        bomId: s.bomId,
        locationId: s.wip,
        quantityPlanned: '500',
        reference: 'RUN-0042',
      });

      expect(run.reference).toBe('RUN-0042');
    });
  });

  describe('release', () => {
    it('scales the recipe, issues stocked lines, and consumes nothing', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const run = await createRun(alpha, {
        outputVariantId: s.output,
        bomId: s.bomId,
        locationId: s.wip,
        quantityPlanned: '500',
      });

      await alpha.agent
        .post(`/v1/production-orders/${run.id}/release`)
        .send({ sourceLocationId: s.shelf })
        .expect(200);

      const res = await alpha.agent
        .get(`/v1/production-orders/${run.id}`)
        .expect(200);
      const detail = body<RunDetailResponse>(res);

      expect(detail.status).toBe('released');

      // Half the batch, so half the recipe: 2400 * (500 / 1000).
      const blendLine = detail.lines.find(
        (line) => line.componentVariantId === s.blend,
      )!;
      expect(blendLine.quantityPlanned).toBe('1200.0000');
      expect(blendLine.sourceLocationId).toBe(s.shelf);

      // External lines are recorded but have no source and move nothing.
      const bottleLine = detail.lines.find(
        (line) => line.componentVariantId === s.bottle,
      )!;
      expect(bottleLine.supplyType).toBe('external');
      expect(bottleLine.sourceLocationId).toBeNull();

      // Issued, not consumed: the material moved, the total did not drop.
      expect(await onHand(s.blend, s.shelf)).toBe('8800.0000');
      expect(await onHand(s.blend, s.wip)).toBe('1200.0000');

      const consumption = await db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.reason, 'consumption'));
      expect(consumption).toHaveLength(0);
    });

    it('honours a per-line source override', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);
      const coldRoom = await makeLocation(alpha, 'COLD', s.site);

      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: s.blend,
          toLocationId: coldRoom,
          quantity: '5000',
          reason: 'receipt',
        })
        .expect(201);

      const run = await createRun(alpha, {
        outputVariantId: s.output,
        bomId: s.bomId,
        locationId: s.wip,
        quantityPlanned: '500',
      });

      await alpha.agent
        .post(`/v1/production-orders/${run.id}/release`)
        .send({
          sourceLocationId: s.shelf,
          overrides: [
            { componentVariantId: s.blend, sourceLocationId: coldRoom },
          ],
        })
        .expect(200);

      expect(await onHand(s.blend, s.shelf)).toBe('10000.0000');
      expect(await onHand(s.blend, coldRoom)).toBe('3800.0000');
    });

    it('refuses to release a run with no BOM', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const run = await createRun(alpha, {
        outputVariantId: s.output,
        locationId: s.wip,
        quantityPlanned: '500',
      });

      await alpha.agent
        .post(`/v1/production-orders/${run.id}/release`)
        .send({ sourceLocationId: s.shelf })
        .expect(409);
    });

    it('refuses to release twice', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const run = await createRun(alpha, {
        outputVariantId: s.output,
        bomId: s.bomId,
        locationId: s.wip,
        quantityPlanned: '500',
      });

      await alpha.agent
        .post(`/v1/production-orders/${run.id}/release`)
        .send({ sourceLocationId: s.shelf })
        .expect(200);

      await alpha.agent
        .post(`/v1/production-orders/${run.id}/release`)
        .send({ sourceLocationId: s.shelf })
        .expect(409);
    });

    it('refuses to edit a released run', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const run = await createRun(alpha, {
        outputVariantId: s.output,
        bomId: s.bomId,
        locationId: s.wip,
        quantityPlanned: '500',
      });

      await alpha.agent
        .post(`/v1/production-orders/${run.id}/release`)
        .send({ sourceLocationId: s.shelf })
        .expect(200);

      await alpha.agent
        .patch(`/v1/production-orders/${run.id}`)
        .send({ quantityPlanned: '600' })
        .expect(409);
    });

    /**
     * The batch keeps the number it was made under. Correcting the licence
     * row afterwards changes the registry, not the history (ADR-040).
     */
    it('snapshots the licence at release', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const licence = body<{ licence: { id: string } }>(
        await alpha.agent
          .post('/v1/product-licences')
          .send({ number: '80012344', authority: 'Health Canada' })
          .expect(201),
      ).licence;

      await alpha.agent
        .patch(`/v1/boms/${s.bomId}`)
        .send({ licenceId: licence.id })
        .expect(204);

      const run = await createRun(alpha, {
        outputVariantId: s.output,
        bomId: s.bomId,
        locationId: s.wip,
        quantityPlanned: '500',
      });

      await alpha.agent
        .post(`/v1/production-orders/${run.id}/release`)
        .send({ sourceLocationId: s.shelf })
        .expect(200);

      await alpha.agent
        .patch(`/v1/product-licences/${licence.id}`)
        .send({ number: '80012345' })
        .expect(204);

      const detail = body<RunResponse>(
        await alpha.agent.get(`/v1/production-orders/${run.id}`).expect(200),
      );

      expect(detail.licenceNumber).toBe('80012344');
    });
  });

  /**
   * A lot-tracked component leaves the shelf earliest expiry first, one
   * transfer per lot, and close consumes the lots the run was given
   * (ADR-039). Without this a recipe containing any lot-tracked stocked
   * component could not be released at all.
   */
  describe('lot-tracked components', () => {
    interface IssuePlan {
      lines: {
        componentVariantId: string;
        quantity: string;
        tracksLots: boolean;
        lots: { code: string; take: string; taken: boolean }[];
        shortBy: string | null;
      }[];
    }

    interface ComponentLotsDetail extends RunDetailResponse {
      componentLots: {
        componentVariantId: string;
        code: string;
        issued: string;
        consumed: string;
      }[];
    }

    /**
     * A tracked blend in three lots on the shelf: one expiring soon, one
     * later, one that never expires. 2400 per 1000 made, so a run of 1000
     * needs 2400 — more than the earliest lot holds.
     */
    async function trackedScenario(org: Org) {
      const site = await makeLocation(org, 'SITE');
      const [shelf, wip] = await Promise.all([
        makeLocation(org, 'SHELF', site),
        makeLocation(org, 'WIP', site),
      ]);

      const [output, blend] = await Promise.all([
        makeVariant(org, 'FOCUS-60CT', 'good', true),
        makeVariant(org, 'BLEND-T', 'material', true),
      ]);

      const bomRes = await org.agent
        .post('/v1/boms')
        .send({
          outputVariantId: output,
          outputQuantity: '1000',
          lines: [{ componentVariantId: blend, quantity: '2400' }],
        })
        .expect(201);

      const bomId = body<CreatedBom>(bomRes).bom.id;
      await org.agent.post(`/v1/boms/${bomId}/promote`).expect(204);

      for (const [code, quantity, expiresAt] of [
        ['LATE', '1500', '2027-06-01T00:00:00.000Z'],
        ['EARLY', '1500', '2026-12-01T00:00:00.000Z'],
        ['NEVER', '5000', undefined],
      ] as const) {
        await org.agent
          .post('/v1/stock/movements')
          .send({
            variantId: blend,
            toLocationId: shelf,
            quantity,
            reason: 'receipt',
            lot: { code, expiresAt },
          })
          .expect(201);
      }

      const run = await createRun(org, {
        outputVariantId: output,
        bomId,
        locationId: wip,
        quantityPlanned: '1000',
      });

      return { shelf, wip, output, blend, bomId, run };
    }

    /** Quantity per lot code of one variant at one location. */
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

    async function lotIdOf(code: string) {
      const [lot] = await db.select().from(lots).where(eq(lots.code, code));
      return lot.id;
    }

    it('issues earliest expiry first, splitting across lots', async () => {
      const alpha = await registerOrg('alpha');
      const s = await trackedScenario(alpha);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/release`)
        .send({ sourceLocationId: s.shelf })
        .expect(200);

      // EARLY is emptied, LATE covers the rest, NEVER is untouched.
      expect(await byLot(s.blend, s.wip)).toEqual({
        EARLY: '1500.0000',
        LATE: '900.0000',
      });
      expect(await byLot(s.blend, s.shelf)).toEqual({
        EARLY: '0.0000',
        LATE: '600.0000',
        NEVER: '5000.0000',
      });

      // One transfer per lot, so the ledger names each one.
      const transfers = await db
        .select()
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.referenceId, s.run.id),
            eq(stockMovements.reason, 'transfer'),
          ),
        );
      expect(transfers).toHaveLength(2);
    });

    it('previews the same pick without moving anything', async () => {
      const alpha = await registerOrg('alpha');
      const s = await trackedScenario(alpha);

      const plan = body<IssuePlan>(
        await alpha.agent
          .get(
            `/v1/production-orders/${s.run.id}/issue-plan?sourceLocationId=${s.shelf}`,
          )
          .expect(200),
      );

      const [line] = plan.lines;
      expect(line.quantity).toBe('2400.0000');
      expect(line.shortBy).toBeNull();
      expect(
        line.lots.filter((lot) => lot.taken).map((lot) => [lot.code, lot.take]),
      ).toEqual([
        ['EARLY', '1500.0000'],
        ['LATE', '900.0000'],
      ]);

      expect(await byLot(s.blend, s.wip)).toEqual({});
    });

    it('takes hand-picked lots instead of the default', async () => {
      const alpha = await registerOrg('alpha');
      const s = await trackedScenario(alpha);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/release`)
        .send({
          sourceLocationId: s.shelf,
          lots: [
            {
              componentVariantId: s.blend,
              lots: [{ lotId: await lotIdOf('NEVER'), quantity: '2400' }],
            },
          ],
        })
        .expect(200);

      expect(await byLot(s.blend, s.wip)).toEqual({ NEVER: '2400.0000' });
    });

    it('refuses hand-picked lots that do not add up', async () => {
      const alpha = await registerOrg('alpha');
      const s = await trackedScenario(alpha);

      const res = await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/release`)
        .send({
          sourceLocationId: s.shelf,
          lots: [
            {
              componentVariantId: s.blend,
              lots: [{ lotId: await lotIdOf('NEVER'), quantity: '100' }],
            },
          ],
        })
        .expect(400);

      expect((res.body as { message: string }).message).toContain('add up to');
      expect(await byLot(s.blend, s.wip)).toEqual({});
    });

    it('refuses a release the lots cannot cover, naming the component', async () => {
      const alpha = await registerOrg('alpha');
      const s = await trackedScenario(alpha);

      // 5000 needs 12000; the shelf holds 8000.
      const big = await createRun(alpha, {
        outputVariantId: s.output,
        bomId: s.bomId,
        locationId: s.wip,
        quantityPlanned: '5000',
      });

      const res = await alpha.agent
        .post(`/v1/production-orders/${big.id}/release`)
        .send({ sourceLocationId: s.shelf })
        .expect(409);

      expect((res.body as { message: string }).message).toContain('BLEND-T');
      expect(await byLot(s.blend, s.wip)).toEqual({});
    });

    it('consumes the lots the run was given, and shows them', async () => {
      const alpha = await registerOrg('alpha');
      const s = await trackedScenario(alpha);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/release`)
        .send({ sourceLocationId: s.shelf })
        .expect(200);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/close`)
        .send({})
        .expect(200);

      expect(await byLot(s.blend, s.wip)).toEqual({
        EARLY: '0.0000',
        LATE: '0.0000',
      });

      const detail = body<ComponentLotsDetail>(
        await alpha.agent.get(`/v1/production-orders/${s.run.id}`).expect(200),
      );

      // The recall question: which lots went into this run.
      expect(
        detail.componentLots.map((lot) => [lot.code, lot.issued, lot.consumed]),
      ).toEqual([
        ['EARLY', '1500.0000', '1500.0000'],
        ['LATE', '900.0000', '900.0000'],
      ]);
    });

    /**
     * The single-site case: stored and blended in the same room. Nothing
     * moves, because a transfer to its own location is a ledger row for an
     * event that did not happen — and close consumes straight off the shelf.
     */
    it('issues nothing when the source is the run location, and still consumes', async () => {
      const alpha = await registerOrg('alpha');
      const s = await trackedScenario(alpha);

      const inPlace = await createRun(alpha, {
        outputVariantId: s.output,
        bomId: s.bomId,
        locationId: s.shelf,
        quantityPlanned: '1000',
      });

      await alpha.agent
        .post(`/v1/production-orders/${inPlace.id}/release`)
        .send({ sourceLocationId: s.shelf })
        .expect(200);

      const transfers = await db
        .select()
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.referenceId, inPlace.id),
            eq(stockMovements.reason, 'transfer'),
          ),
        );
      expect(transfers).toHaveLength(0);

      await alpha.agent
        .post(`/v1/production-orders/${inPlace.id}/close`)
        .send({})
        .expect(200);

      // 2400 consumed earliest expiry first, straight from the shelf.
      expect(await byLot(s.blend, s.shelf)).toEqual({
        EARLY: '0.0000',
        LATE: '600.0000',
        NEVER: '5000.0000',
      });
    });

    it('tops up over plan from the next lot to expire', async () => {
      const alpha = await registerOrg('alpha');
      const s = await trackedScenario(alpha);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/release`)
        .send({ sourceLocationId: s.shelf })
        .expect(200);

      const detail = body<RunDetailResponse>(
        await alpha.agent.get(`/v1/production-orders/${s.run.id}`).expect(200),
      );

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/close`)
        .send({
          lines: [{ lineId: detail.lines[0].id, quantityConsumed: '2500' }],
        })
        .expect(200);

      // 100 more came from LATE, the next to expire, not from NEVER.
      expect(await byLot(s.blend, s.shelf)).toEqual({
        EARLY: '0.0000',
        LATE: '500.0000',
        NEVER: '5000.0000',
      });
      expect(await byLot(s.blend, s.wip)).toEqual({
        EARLY: '0.0000',
        LATE: '0.0000',
      });
    });
  });

  describe('output', () => {
    async function released(alpha: Org) {
      const s = await scenario(alpha);
      const run = await createRun(alpha, {
        outputVariantId: s.output,
        bomId: s.bomId,
        locationId: s.wip,
        quantityPlanned: '500',
      });

      await alpha.agent
        .post(`/v1/production-orders/${run.id}/release`)
        .send({ sourceLocationId: s.shelf })
        .expect(200);

      return { ...s, run };
    }

    /**
     * A batch spanning days. The run stays released through both, because a
     * run finishes when somebody says so rather than when a number is reached
     * (ADR-032).
     */
    it('accumulates across several output events and stays released', async () => {
      const alpha = await registerOrg('alpha');
      const s = await released(alpha);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/output`)
        .send({ quantity: '200', lot: { code: 'BATCH-001' } })
        .expect(201);

      const res = await alpha.agent
        .get(`/v1/production-orders/${s.run.id}`)
        .expect(200);
      const lots = body<RunDetailResponse>(res).outputLots;

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/output`)
        .send({ quantity: '280', lotId: lots[0] })
        .expect(201);

      const [run] = await db
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.id, s.run.id));

      expect(run.quantityProduced).toBe('480.0000');
      expect(run.status).toBe('released');
      expect(await onHand(s.output, s.wip)).toBe('480.0000');
    });

    it('offers the run own lots so a second day can join the first', async () => {
      const alpha = await registerOrg('alpha');
      const s = await released(alpha);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/output`)
        .send({ quantity: '200', lot: { code: 'BATCH-001' } })
        .expect(201);

      const joined = await alpha.agent
        .get(`/v1/production-orders/${s.run.id}`)
        .expect(200);
      const lots = body<RunDetailResponse>(joined).outputLots;
      expect(lots).toHaveLength(1);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/output`)
        .send({ quantity: '280', lotId: lots[0] })
        .expect(201);

      const after = await alpha.agent
        .get(`/v1/production-orders/${s.run.id}`)
        .expect(200);
      expect(body<RunDetailResponse>(after).outputLots).toHaveLength(1);
    });

    it('creates a second lot when the batch genuinely divides', async () => {
      const alpha = await registerOrg('alpha');
      const s = await released(alpha);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/output`)
        .send({ quantity: '200', lot: { code: 'BATCH-001' } })
        .expect(201);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/output`)
        .send({ quantity: '280', lot: { code: 'BATCH-002' } })
        .expect(201);

      const res = await alpha.agent
        .get(`/v1/production-orders/${s.run.id}`)
        .expect(200);
      expect(body<RunDetailResponse>(res).outputLots).toHaveLength(2);
    });

    it('refuses output against a draft', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const run = await createRun(alpha, {
        outputVariantId: s.output,
        bomId: s.bomId,
        locationId: s.wip,
        quantityPlanned: '500',
      });

      await alpha.agent
        .post(`/v1/production-orders/${run.id}/output`)
        .send({ quantity: '10', lot: { code: 'X' } })
        .expect(409);
    });
  });

  describe('close', () => {
    async function released(alpha: Org) {
      const s = await scenario(alpha);
      const run = await createRun(alpha, {
        outputVariantId: s.output,
        bomId: s.bomId,
        locationId: s.wip,
        quantityPlanned: '500',
      });

      await alpha.agent
        .post(`/v1/production-orders/${run.id}/release`)
        .send({ sourceLocationId: s.shelf })
        .expect(200);

      const detail = await alpha.agent
        .get(`/v1/production-orders/${run.id}`)
        .expect(200);

      return {
        ...s,
        run,
        lines: body<RunDetailResponse>(detail).lines,
      };
    }

    it('consumes what was planned when a line is left out', async () => {
      const alpha = await registerOrg('alpha');
      const s = await released(alpha);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/close`)
        .send({})
        .expect(200);

      expect(await onHand(s.blend, s.wip)).toBe('0.0000');
      expect(await onHand(s.blend, s.shelf)).toBe('8800.0000');

      const [run] = await db
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.id, s.run.id));
      expect(run.status).toBe('completed');
    });

    /**
     * The case the top-up exists for. 1200 was issued, 1260 was used, and the
     * extra 60 has to come from the shelf in the same transaction or the
     * non-negative check fires on a shortfall that is real rather than a
     * mistake.
     */
    it('tops up from the source when consumption runs over plan', async () => {
      const alpha = await registerOrg('alpha');
      const s = await released(alpha);

      const blendLine = s.lines.find(
        (line) => line.componentVariantId === s.blend,
      )!;

      const res = await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/close`)
        .send({
          lines: [{ lineId: blendLine.id, quantityConsumed: '1260' }],
        })
        .expect(200);

      expect(await onHand(s.blend, s.wip)).toBe('0.0000');
      expect(await onHand(s.blend, s.shelf)).toBe('8740.0000');

      // 5% over plan is under the flag threshold, so nothing is reported.
      // The top-up still happened — that is what the balances above show.
      expect(body<CloseResponse>(res).variances).toHaveLength(0);
    });

    it('records the variance without refusing a large one', async () => {
      const alpha = await registerOrg('alpha');
      const s = await released(alpha);

      const blendLine = s.lines.find(
        (line) => line.componentVariantId === s.blend,
      )!;

      const res = await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/close`)
        .send({
          lines: [{ lineId: blendLine.id, quantityConsumed: '1800' }],
        })
        .expect(200);

      expect(body<CloseResponse>(res).variances[0].variance).toBeCloseTo(
        0.5,
        3,
      );

      const [line] = await db
        .select()
        .from(productionOrderLines)
        .where(eq(productionOrderLines.id, blendLine.id));
      expect(line.quantityConsumed).toBe('1800.0000');
    });

    it('leaves the remainder at the run location when consumption is under plan', async () => {
      const alpha = await registerOrg('alpha');
      const s = await released(alpha);

      const blendLine = s.lines.find(
        (line) => line.componentVariantId === s.blend,
      )!;

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/close`)
        .send({
          lines: [{ lineId: blendLine.id, quantityConsumed: '1150' }],
        })
        .expect(200);

      // 50 still sitting in WIP. Nothing here can know where it went, so a
      // person moves it (ADR-032).
      expect(await onHand(s.blend, s.wip)).toBe('50.0000');
    });

    it('writes no consumption movement for an external line', async () => {
      const alpha = await registerOrg('alpha');
      const s = await released(alpha);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/close`)
        .send({})
        .expect(200);

      const consumption = await db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.reason, 'consumption'));

      expect(consumption).toHaveLength(1);
      expect(consumption[0].variantId).toBe(s.blend);
    });

    it('refuses a line belonging to another run', async () => {
      const alpha = await registerOrg('alpha');
      const s = await released(alpha);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/close`)
        .send({
          lines: [
            {
              lineId: '00000000-0000-7000-8000-000000000000',
              quantityConsumed: '1',
            },
          ],
        })
        .expect(404);
    });

    it('refuses to close twice', async () => {
      const alpha = await registerOrg('alpha');
      const s = await released(alpha);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/close`)
        .send({})
        .expect(200);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/close`)
        .send({})
        .expect(409);
    });

    /**
     * The yield is the number the run exists to produce, so it is flagged on
     * the same threshold as the components — including a run that made
     * nothing, which is the case somebody most wants to hear about.
     */
    it('flags output that came out far off plan', async () => {
      const alpha = await registerOrg('alpha');
      const s = await released(alpha);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/output`)
        .send({ quantity: '100', lot: { code: 'B1' } })
        .expect(201);

      const res = await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/close`)
        .send({})
        .expect(200);

      const { outputVariance } = body<CloseResponse>(res);
      expect(outputVariance).toEqual({
        quantityPlanned: '500.0000',
        quantityProduced: '100.0000',
        variance: -0.8,
      });

      const [row] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.type, 'production.variance'));

      // The yield leads the title; components, if any, explain it in the body.
      expect(row.title).toContain('100.0000');
      expect(row.title).toContain('500.0000');
    });

    it('tells everyone who can close a run about a variance', async () => {
      const alpha = await registerOrg('alpha');
      const s = await released(alpha);

      const blendLine = s.lines.find(
        (line) => line.componentVariantId === s.blend,
      )!;

      // 50% over plan, well past the flag threshold.
      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/close`)
        .send({ lines: [{ lineId: blendLine.id, quantityConsumed: '1800' }] })
        .expect(200);

      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.type, 'production.variance'));

      /**
       * Targeting is by permission: the Owner holds production.complete. By
       * involvement would need created_by to mean "owner", which it means
       * only by accident — it records who typed it in (ADR-036).
       */
      expect(rows).toHaveLength(1);
      expect(rows[0].resourceId).toBe(s.run.id);
      expect(rows[0].organizationId).toBe(alpha.organizationId);
      // The SKU, not a UUID — a bell nobody can read is a bell nobody opens.
      expect(rows[0].body).toContain('BLEND-D3');
    });

    it('says nothing when everything went to plan', async () => {
      const alpha = await registerOrg('alpha');
      const s = await released(alpha);

      // The whole plan, so the yield is on target too.
      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/output`)
        .send({ quantity: '500', lot: { code: 'B1' } })
        .expect(201);

      await alpha.agent
        .post(`/v1/production-orders/${s.run.id}/close`)
        .send({})
        .expect(200);

      expect(
        await db
          .select()
          .from(notifications)
          .where(eq(notifications.type, 'production.variance')),
      ).toHaveLength(0);
    });
  });

  describe('cancel', () => {
    it('cancels a draft with nothing stranded', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const run = await createRun(alpha, {
        outputVariantId: s.output,
        bomId: s.bomId,
        locationId: s.wip,
        quantityPlanned: '500',
      });

      const res = await alpha.agent
        .post(`/v1/production-orders/${run.id}/cancel`)
        .send({ reason: 'Wrong quantity' })
        .expect(200);

      expect(body<CancelResponse>(res).strandedLines).toHaveLength(0);
    });

    /**
     * Cancelling does not unwind movements. The material is physically at the
     * run's location, and a reversing movement would claim somebody carried it
     * back (ADR-032).
     */
    it('leaves issued material where it is and says what is stranded', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const run = await createRun(alpha, {
        outputVariantId: s.output,
        bomId: s.bomId,
        locationId: s.wip,
        quantityPlanned: '500',
      });

      await alpha.agent
        .post(`/v1/production-orders/${run.id}/release`)
        .send({ sourceLocationId: s.shelf })
        .expect(200);

      const res = await alpha.agent
        .post(`/v1/production-orders/${run.id}/cancel`)
        .send({ reason: 'Equipment failure' })
        .expect(200);

      expect(body<CancelResponse>(res).strandedLines).toHaveLength(1);
      expect(await onHand(s.blend, s.wip)).toBe('1200.0000');
    });

    it('refuses to cancel a completed run', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const run = await createRun(alpha, {
        outputVariantId: s.output,
        bomId: s.bomId,
        locationId: s.wip,
        quantityPlanned: '500',
      });

      await alpha.agent
        .post(`/v1/production-orders/${run.id}/release`)
        .send({ sourceLocationId: s.shelf })
        .expect(200);
      await alpha.agent
        .post(`/v1/production-orders/${run.id}/close`)
        .send({})
        .expect(200);

      await alpha.agent
        .post(`/v1/production-orders/${run.id}/cancel`)
        .send({ reason: 'Too late' })
        .expect(409);
    });
  });

  describe('scoping', () => {
    it('does not find another organization run', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      const s = await scenario(beta);
      const run = await createRun(beta, {
        outputVariantId: s.output,
        bomId: s.bomId,
        locationId: s.wip,
        quantityPlanned: '500',
      });

      await alpha.agent.get(`/v1/production-orders/${run.id}`).expect(404);
      expect(
        body<RunPage>(
          await alpha.agent.get('/v1/production-orders').expect(200),
        ).entries,
      ).toHaveLength(0);
    });

    it('requires a session', async () => {
      await authedAgent(app).get('/v1/production-orders').expect(401);
    });
  });

  describe('paging', () => {
    it('pages with a cursor and stops when there is nothing left', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      for (let i = 0; i < 3; i += 1) {
        await createRun(alpha, {
          outputVariantId: s.output,
          bomId: s.bomId,
          locationId: s.wip,
          quantityPlanned: '10',
        });
      }

      const first = body<RunPage>(
        await alpha.agent.get('/v1/production-orders?limit=2').expect(200),
      );

      expect(first.entries).toHaveLength(2);
      expect(first.nextCursor).toBe(first.entries[1].id);

      const second = body<RunPage>(
        await alpha.agent
          .get(`/v1/production-orders?limit=2&before=${first.nextCursor!}`)
          .expect(200),
      );

      expect(second.entries).toHaveLength(1);
      // Null rather than the last id: the extra row fetched is what proves
      // there is nothing more, and guessing from a short page is exactly what
      // the envelope exists to avoid.
      expect(second.nextCursor).toBeNull();
    });
  });
});
