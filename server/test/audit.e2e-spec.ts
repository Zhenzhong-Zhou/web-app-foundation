import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { auditLog, roles } from '../src/database/schema';
import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './utils/create-test-app';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface AuditEntry {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  actorId: string | null;
  actorEmail: string | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

interface AuditPage {
  entries: AuditEntry[];
  nextCursor: string | null;
}

interface RegisterResponse {
  user: { id: string; organizationId: string };
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * Reading the log (ADR-012, ADR-018).
 *
 * The write side is covered wherever the action happens — an order spec
 * asserts that updating an order records an entry. This covers the reading:
 * scoping, the filters an investigation starts from, and the payload
 * allow-list, which is a retention promise and would otherwise be a comment.
 */
describe('Audit (e2e)', () => {
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

  /** A product, which records product.created and gives us a resource id. */
  async function makeProduct(org: Org, sku: string) {
    const res = await org.agent
      .post('/v1/products')
      .send({ type: 'good', name: sku, variant: { sku } })
      .expect(201);

    return body<{ product: { id: string; variants: { id: string }[] } }>(res)
      .product;
  }

  async function page(org: Org, query = ''): Promise<AuditPage> {
    return body<AuditPage>(
      await org.agent.get(`/v1/audit${query}`).expect(200),
    );
  }

  describe('GET /v1/audit', () => {
    it('records who did what, newest first', async () => {
      const alpha = await registerOrg('alpha');
      await makeProduct(alpha, 'WIDGET-1');
      await makeProduct(alpha, 'WIDGET-2');

      const { entries } = await page(alpha);

      expect(entries).toHaveLength(2);
      expect(entries[0].action).toBe('product.created');
      expect(entries[0].actorEmail).toBe('owner@alpha.example.com');

      // Newest first on a UUIDv7 cursor, so the second product leads.
      expect(entries[0].createdAt >= entries[1].createdAt).toBe(true);
    });

    it('does not show another organization log', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');
      await makeProduct(beta, 'THEIRS-1');

      expect((await page(alpha)).entries).toHaveLength(0);
      expect(await db.select().from(auditLog)).toHaveLength(1);
    });

    it('filters by action', async () => {
      const alpha = await registerOrg('alpha');
      const product = await makeProduct(alpha, 'WIDGET-1');

      await alpha.agent
        .patch(`/v1/products/${product.id}`)
        .send({ isActive: false })
        .expect(204);

      const { entries } = await page(alpha, '?action=product.updated');

      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('product.updated');
    });

    /**
     * The filter behind the History links on detail pages. Nobody types a
     * UUID, but "what happened to this one" is the question people ask.
     */
    it('filters by resource', async () => {
      const alpha = await registerOrg('alpha');
      const first = await makeProduct(alpha, 'WIDGET-1');
      await makeProduct(alpha, 'WIDGET-2');

      const { entries } = await page(alpha, `?resourceId=${first.id}`);

      expect(entries).toHaveLength(1);
      expect(entries[0].resourceId).toBe(first.id);
    });

    it('filters by date range', async () => {
      const alpha = await registerOrg('alpha');
      await makeProduct(alpha, 'WIDGET-1');

      const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
      const yesterday = new Date(Date.now() - 86_400_000).toISOString();

      expect((await page(alpha, `?from=${tomorrow}`)).entries).toHaveLength(0);
      expect((await page(alpha, `?to=${yesterday}`)).entries).toHaveLength(0);
      expect((await page(alpha, `?from=${yesterday}`)).entries).toHaveLength(1);
    });

    it('pages with a cursor and stops when there is nothing left', async () => {
      const alpha = await registerOrg('alpha');

      for (const sku of ['W-1', 'W-2', 'W-3']) {
        await makeProduct(alpha, sku);
      }

      const first = await page(alpha, '?limit=2');
      expect(first.entries).toHaveLength(2);
      expect(first.nextCursor).toBe(first.entries[1].id);

      const second = await page(alpha, `?limit=2&before=${first.nextCursor!}`);
      expect(second.entries).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
    });

    /**
     * The allow-list is a retention promise. Without this it is a comment, and
     * a field added to a DTO would start being retained for two years with
     * nobody deciding it should be.
     */
    it('records only the fields a route named', async () => {
      const alpha = await registerOrg('alpha');
      const product = await makeProduct(alpha, 'WIDGET-1');

      await alpha.agent
        .patch(`/v1/products/${product.id}/variants/${product.variants[0].id}`)
        .send({ sku: 'RENAMED-1' })
        .expect(204);

      const { entries } = await page(alpha, '?action=product.variant_updated');

      // sku is named; nothing else on that DTO is.
      expect(entries[0].payload).toEqual({ sku: 'RENAMED-1' });
    });

    it('records no payload for a route that names no fields', async () => {
      const alpha = await registerOrg('alpha');
      await makeProduct(alpha, 'WIDGET-1');

      // null rather than {}: no payload says "this route does not record
      // values", where an empty object would say "it does, and none changed".
      expect((await page(alpha)).entries[0].payload).toBeNull();
    });

    it('refuses a Viewer, which lacks audit.view', async () => {
      const alpha = await registerOrg('alpha');

      const [viewerRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(
            eq(roles.organizationId, alpha.organizationId),
            eq(roles.name, 'Viewer'),
          ),
        );

      await alpha.agent
        .post('/v1/users')
        .send({
          email: 'viewer@alpha.example.com',
          name: 'Viewer',
          password: PASSWORD,
          roleId: viewerRole.id,
        })
        .expect(201);

      const viewer = authedAgent(app);
      await viewer
        .post('/v1/auth/login')
        .send({ email: 'viewer@alpha.example.com', password: PASSWORD })
        .expect(200);

      await viewer.get('/v1/audit').expect(403);
    });

    it('requires a session', async () => {
      await authedAgent(app).get('/v1/audit').expect(401);
    });
  });

  describe('GET /v1/audit/actions', () => {
    it('lists only the actions that have occurred', async () => {
      const alpha = await registerOrg('alpha');
      await makeProduct(alpha, 'WIDGET-1');
      await makeProduct(alpha, 'WIDGET-2');

      const actions = body<string[]>(
        await alpha.agent.get('/v1/audit/actions').expect(200),
      );

      // From the data rather than the constant, so the filter never offers an
      // option that returns nothing — and two products yield one action.
      expect(actions).toEqual(['product.created']);
    });

    /**
     * This query writes its own organization_id predicate rather than going
     * through TenantDb.select, which is the one place in the module where
     * scoping is by hand. Worth asserting for exactly that reason.
     */
    it('does not leak another organization vocabulary', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');
      await makeProduct(beta, 'THEIRS-1');

      expect(
        body<string[]>(await alpha.agent.get('/v1/audit/actions').expect(200)),
      ).toEqual([]);
    });

    it('refuses without audit.view', async () => {
      await authedAgent(app).get('/v1/audit/actions').expect(401);
    });

    it('refuses a malformed date', async () => {
      const alpha = await registerOrg('alpha');

      await alpha.agent.get('/v1/audit?from=not-a-date').expect(400);
    });
  });
});
