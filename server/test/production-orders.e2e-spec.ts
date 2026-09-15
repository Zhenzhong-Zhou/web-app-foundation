import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
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
        body<RunResponse[]>(
          await alpha.agent.get('/v1/production-orders').expect(200),
        ),
      ).toHaveLength(0);
    });

    it('requires a session', async () => {
      await authedAgent(app).get('/v1/production-orders').expect(401);
    });
  });
});
