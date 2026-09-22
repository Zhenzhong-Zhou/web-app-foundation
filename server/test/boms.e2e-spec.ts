import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { bomLines, boms, roles } from '../src/database/schema';
import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './utils/create-test-app';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface BomResponse {
  id: string;
  outputVariantId: string;
  outputQuantity: string;
  version: number;
  status: 'draft' | 'active' | 'archived';
  licenceId: string | null;
}

interface BomDetailResponse extends BomResponse {
  lines: {
    id: string;
    componentVariantId: string;
    quantity: string;
    supplyType: 'stocked' | 'external';
  }[];
}

interface CreatedBom {
  bom: BomResponse;
}

interface CreatedLine {
  line: { id: string };
}

interface ProductResponse {
  product: { id: string; variants: { id: string; sku: string }[] };
}

interface RegisterResponse {
  user: { id: string; organizationId: string };
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * Recipes (ADR-029).
 *
 * Most of what is worth asserting here is about the rules a check constraint
 * cannot hold: that a cycle is refused before it can hang the exploder, that a
 * promoted recipe stops being editable, and that promotion swaps the active
 * version rather than adding a second one.
 */
describe('BOMs (e2e)', () => {
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

  /** A product with one variant, returning the variant id the BOM points at. */
  async function makeVariant(
    owner: Awaited<ReturnType<typeof registerOrg>>,
    sku: string,
    type: 'good' | 'material' | 'packaging' = 'good',
  ) {
    const res = await owner.agent
      .post('/v1/products')
      .send({
        type,
        name: sku,
        variant: { sku, unitOfMeasure: 'each' },
      })
      .expect(201);

    return body<ProductResponse>(res).product.variants[0].id;
  }

  /** Output, plus two components — the shape most of these tests need. */
  async function fixtures(owner: Awaited<ReturnType<typeof registerOrg>>) {
    const [output, blend, bottle] = await Promise.all([
      makeVariant(owner, 'D3-60CT'),
      makeVariant(owner, 'BLEND-D3', 'material'),
      makeVariant(owner, 'BOTTLE-60CC', 'packaging'),
    ]);

    return { output, blend, bottle };
  }

  async function createBom(
    owner: Awaited<ReturnType<typeof registerOrg>>,
    payload: Record<string, unknown>,
  ) {
    const res = await owner.agent.post('/v1/boms').send(payload).expect(201);
    return body<CreatedBom>(res).bom;
  }

  describe('POST /v1/boms', () => {
    it('creates a draft at version 1 with its lines in one call', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend, bottle } = await fixtures(alpha);

      const bom = await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [
          { componentVariantId: blend, quantity: '2400' },
          { componentVariantId: bottle, quantity: '1000' },
        ],
      });

      expect(bom.version).toBe(1);
      expect(bom.status).toBe('draft');
      // numeric comes back as a string, never a JS number (ADR-025).
      expect(bom.outputQuantity).toBe('1000.0000');

      expect(await db.select().from(bomLines)).toHaveLength(2);
    });

    it('defaults a line to stocked', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend } = await fixtures(alpha);

      const bom = await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [{ componentVariantId: blend, quantity: '2400' }],
      });

      const res = await alpha.agent.get(`/v1/boms/${bom.id}`).expect(200);
      expect(body<BomDetailResponse>(res).lines[0].supplyType).toBe('stocked');
    });

    it('records a component the manufacturer provides without it entering stock', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend, bottle } = await fixtures(alpha);

      const bom = await createBom(alpha, {
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
      });

      const res = await alpha.agent.get(`/v1/boms/${bom.id}`).expect(200);
      const detail = body<BomDetailResponse>(res);

      expect(
        detail.lines.filter((line) => line.supplyType === 'external'),
      ).toHaveLength(1);
    });

    it('assigns the next version per output variant', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend } = await fixtures(alpha);

      const lines = [{ componentVariantId: blend, quantity: '2400' }];

      const first = await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines,
      });
      const second = await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines,
      });

      expect(first.version).toBe(1);
      expect(second.version).toBe(2);
    });

    it('refuses an unknown component', async () => {
      const alpha = await registerOrg('alpha');
      const { output } = await fixtures(alpha);

      await alpha.agent
        .post('/v1/boms')
        .send({
          outputVariantId: output,
          outputQuantity: '1000',
          lines: [
            {
              componentVariantId: '00000000-0000-7000-8000-000000000000',
              quantity: '1',
            },
          ],
        })
        .expect(400);

      // The header must not survive a rejected line.
      expect(await db.select().from(boms)).toHaveLength(0);
    });

    it('refuses a quantity that arrives as a number rather than a string', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend } = await fixtures(alpha);

      await alpha.agent
        .post('/v1/boms')
        .send({
          outputVariantId: output,
          outputQuantity: '1000',
          lines: [{ componentVariantId: blend, quantity: 2400 }],
        })
        .expect(400);
    });

    it('refuses a zero quantity', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend } = await fixtures(alpha);

      await alpha.agent
        .post('/v1/boms')
        .send({
          outputVariantId: output,
          outputQuantity: '1000',
          lines: [{ componentVariantId: blend, quantity: '0.0000' }],
        })
        .expect(400);
    });
  });

  describe('cycles', () => {
    it('refuses a line whose component is the output itself', async () => {
      const alpha = await registerOrg('alpha');
      const { output } = await fixtures(alpha);

      await alpha.agent
        .post('/v1/boms')
        .send({
          outputVariantId: output,
          outputQuantity: '1000',
          lines: [{ componentVariantId: output, quantity: '1' }],
        })
        .expect(409);
    });

    /**
     * The case neither row looks wrong on its own: the bottle's recipe
     * consumes the blend, so the blend's recipe cannot consume the bottle.
     * Without the guard this is writable and the first query that walks the
     * tree recurses until it dies.
     */
    it('refuses a cycle reached through another recipe', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend, bottle } = await fixtures(alpha);

      await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [{ componentVariantId: blend, quantity: '2400' }],
      });

      await createBom(alpha, {
        outputVariantId: blend,
        outputQuantity: '2400',
        lines: [{ componentVariantId: bottle, quantity: '1' }],
      });

      // bottle consumes the finished good, which consumes the blend, which
      // consumes the bottle.
      await alpha.agent
        .post('/v1/boms')
        .send({
          outputVariantId: bottle,
          outputQuantity: '1',
          lines: [{ componentVariantId: output, quantity: '1' }],
        })
        .expect(409);
    });

    it('allows a sub-assembly that does not close the loop', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend, bottle } = await fixtures(alpha);

      await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [
          { componentVariantId: blend, quantity: '2400' },
          { componentVariantId: bottle, quantity: '1000' },
        ],
      });

      const nested = await makeVariant(alpha, 'RAW-D3', 'material');

      await alpha.agent
        .post('/v1/boms')
        .send({
          outputVariantId: blend,
          outputQuantity: '2400',
          lines: [{ componentVariantId: nested, quantity: '5' }],
        })
        .expect(201);
    });
  });

  describe('lines on an existing BOM', () => {
    it('refuses the same component twice', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend } = await fixtures(alpha);

      const bom = await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [{ componentVariantId: blend, quantity: '2400' }],
      });

      await alpha.agent
        .post(`/v1/boms/${bom.id}/lines`)
        .send({ componentVariantId: blend, quantity: '100' })
        .expect(409);
    });

    it('adds, edits, and removes a line', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend, bottle } = await fixtures(alpha);

      const bom = await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [{ componentVariantId: blend, quantity: '2400' }],
      });

      const added = await alpha.agent
        .post(`/v1/boms/${bom.id}/lines`)
        .send({ componentVariantId: bottle, quantity: '1000' })
        .expect(201);

      const lineId = body<CreatedLine>(added).line.id;

      await alpha.agent
        .patch(`/v1/boms/${bom.id}/lines/${lineId}`)
        .send({ quantity: '1010' })
        .expect(204);

      const [updated] = await db
        .select()
        .from(bomLines)
        .where(eq(bomLines.id, lineId));
      expect(updated.quantity).toBe('1010.0000');

      await alpha.agent
        .delete(`/v1/boms/${bom.id}/lines/${lineId}`)
        .expect(204);

      expect(await db.select().from(bomLines)).toHaveLength(1);
    });

    it('does not find a line belonging to a different BOM', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend } = await fixtures(alpha);

      const first = await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [{ componentVariantId: blend, quantity: '2400' }],
      });
      const second = await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [{ componentVariantId: blend, quantity: '2400' }],
      });

      const [strayLine] = await db
        .select()
        .from(bomLines)
        .where(eq(bomLines.bomId, first.id));

      await alpha.agent
        .patch(`/v1/boms/${second.id}/lines/${strayLine.id}`)
        .send({ quantity: '1' })
        .expect(404);
    });
  });

  describe('promotion', () => {
    it('archives the outgoing version, leaving exactly one active', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend } = await fixtures(alpha);

      const lines = [{ componentVariantId: blend, quantity: '2400' }];

      const first = await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines,
      });
      await alpha.agent.post(`/v1/boms/${first.id}/promote`).expect(204);

      const second = await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines,
      });
      await alpha.agent.post(`/v1/boms/${second.id}/promote`).expect(204);

      const active = await db
        .select()
        .from(boms)
        .where(eq(boms.status, 'active'));

      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(second.id);

      const [outgoing] = await db
        .select()
        .from(boms)
        .where(eq(boms.id, first.id));
      expect(outgoing.status).toBe('archived');
    });

    /**
     * Output from nothing. A run against this would write a production
     * movement with no consumption behind it — stock appearing unexplained,
     * which is what the ledger exists to prevent.
     */
    it('refuses to promote a BOM with no lines', async () => {
      const alpha = await registerOrg('alpha');
      const { output } = await fixtures(alpha);

      const bom = await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
      });

      await alpha.agent.post(`/v1/boms/${bom.id}/promote`).expect(409);
    });

    it('refuses to promote anything that is not a draft', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend } = await fixtures(alpha);

      const bom = await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [{ componentVariantId: blend, quantity: '2400' }],
      });

      await alpha.agent.post(`/v1/boms/${bom.id}/promote`).expect(204);
      await alpha.agent.post(`/v1/boms/${bom.id}/promote`).expect(409);
    });

    it('refuses to edit a promoted recipe', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend, bottle } = await fixtures(alpha);

      const bom = await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [{ componentVariantId: blend, quantity: '2400' }],
      });

      await alpha.agent.post(`/v1/boms/${bom.id}/promote`).expect(204);

      await alpha.agent
        .patch(`/v1/boms/${bom.id}`)
        .send({ outputQuantity: '2000' })
        .expect(409);

      await alpha.agent
        .post(`/v1/boms/${bom.id}/lines`)
        .send({ componentVariantId: bottle, quantity: '1000' })
        .expect(409);
    });

    /**
     * The NPN usually lands after the formulation is settled. A new version
     * identical to the last but for a number would be a fiction in the
     * history, so the licence stays attachable — until a run makes it a claim
     * about a finished batch (ADR-029).
     */
    it('attaches a licence to a promoted recipe nothing was made against', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend } = await fixtures(alpha);

      const licence = body<{ licence: { id: string } }>(
        await alpha.agent
          .post('/v1/product-licences')
          .send({ number: '80012345', authority: 'Health Canada' })
          .expect(201),
      ).licence;

      const bom = await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [{ componentVariantId: blend, quantity: '2400' }],
      });

      await alpha.agent.post(`/v1/boms/${bom.id}/promote`).expect(204);

      await alpha.agent
        .patch(`/v1/boms/${bom.id}`)
        .send({ licenceId: licence.id })
        .expect(204);

      // Still nothing else: the formulation is frozen, the number is not.
      await alpha.agent
        .patch(`/v1/boms/${bom.id}`)
        .send({ licenceId: licence.id, outputQuantity: '2000' })
        .expect(409);
    });

    it('fixes the licence once a run has been made against the recipe', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend } = await fixtures(alpha);

      const licence = body<{ licence: { id: string } }>(
        await alpha.agent
          .post('/v1/product-licences')
          .send({ number: '80012345', authority: 'Health Canada' })
          .expect(201),
      ).licence;

      const site = body<{ location: { id: string } }>(
        await alpha.agent
          .post('/v1/locations')
          .send({ type: 'site', name: 'Main' })
          .expect(201),
      ).location;

      const bom = await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [{ componentVariantId: blend, quantity: '2400' }],
      });

      await alpha.agent.post(`/v1/boms/${bom.id}/promote`).expect(204);

      // A plan alone is enough: from here the licence is a claim about what
      // that run is making.
      await alpha.agent
        .post('/v1/production-orders')
        .send({
          outputVariantId: output,
          bomId: bom.id,
          locationId: site.id,
          quantityPlanned: '1000',
        })
        .expect(201);

      await alpha.agent
        .patch(`/v1/boms/${bom.id}`)
        .send({ licenceId: licence.id })
        .expect(409);

      const detail = body<{ licenceLocked: boolean }>(
        await alpha.agent.get(`/v1/boms/${bom.id}`).expect(200),
      );
      expect(detail.licenceLocked).toBe(true);
    });

    it('archives, and refuses to archive twice', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend } = await fixtures(alpha);

      const bom = await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [{ componentVariantId: blend, quantity: '2400' }],
      });

      await alpha.agent.post(`/v1/boms/${bom.id}/promote`).expect(204);
      await alpha.agent.post(`/v1/boms/${bom.id}/archive`).expect(204);
      await alpha.agent.post(`/v1/boms/${bom.id}/archive`).expect(409);
    });
  });

  describe('POST /v1/boms/:id/duplicate', () => {
    it('copies the lines into a new draft at the next version', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend, bottle } = await fixtures(alpha);

      const original = await createBom(alpha, {
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
      });

      await alpha.agent.post(`/v1/boms/${original.id}/promote`).expect(204);

      const res = await alpha.agent
        .post(`/v1/boms/${original.id}/duplicate`)
        .expect(201);
      const copy = body<CreatedBom>(res).bom;

      expect(copy.version).toBe(2);
      expect(copy.status).toBe('draft');

      const detail = await alpha.agent.get(`/v1/boms/${copy.id}`).expect(200);
      const lines = body<BomDetailResponse>(detail).lines;

      expect(lines).toHaveLength(2);
      expect(lines.map((line) => line.supplyType).sort()).toEqual([
        'external',
        'stocked',
      ]);

      // The original is untouched — a duplicate is a new recipe, not an edit.
      const [source] = await db
        .select()
        .from(boms)
        .where(eq(boms.id, original.id));
      expect(source.status).toBe('active');
    });
  });

  describe('scoping and permissions', () => {
    it('does not show another organization recipes', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      const { output, blend } = await fixtures(beta);
      await createBom(beta, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [{ componentVariantId: blend, quantity: '2400' }],
      });

      const res = await alpha.agent.get('/v1/boms').expect(200);
      expect(body<BomResponse[]>(res)).toHaveLength(0);
      expect(await db.select().from(boms)).toHaveLength(1);
    });

    it('does not find another organization recipe by id', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      const { output, blend } = await fixtures(beta);
      const bom = await createBom(beta, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [{ componentVariantId: blend, quantity: '2400' }],
      });

      await alpha.agent.get(`/v1/boms/${bom.id}`).expect(404);
    });

    it('is readable by a Viewer, which holds boms.view', async () => {
      const alpha = await registerOrg('alpha');
      const { output, blend } = await fixtures(alpha);

      await createBom(alpha, {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [{ componentVariantId: blend, quantity: '2400' }],
      });

      await alpha.agent
        .post('/v1/users')
        .send({
          email: 'viewer@alpha.example.com',
          name: 'Viewer',
          password: PASSWORD,
          roleId: await roleIdNamed(alpha.organizationId, 'Viewer'),
        })
        .expect(201);

      const viewer = authedAgent(app);
      await viewer
        .post('/v1/auth/login')
        .send({ email: 'viewer@alpha.example.com', password: PASSWORD })
        .expect(200);

      const res = await viewer.get('/v1/boms').expect(200);
      expect(body<BomResponse[]>(res)).toHaveLength(1);

      await viewer
        .post('/v1/boms')
        .send({ outputVariantId: output, outputQuantity: '1' })
        .expect(403);
    });

    it('requires a session', async () => {
      await authedAgent(app).get('/v1/boms').expect(401);
    });
  });
});
