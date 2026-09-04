import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { locations, roles } from '../src/database/schema';
import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './utils/create-test-app';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface LocationResponse {
  id: string;
  type: string;
  name: string;
  code: string | null;
  parentId: string | null;
  isAvailable: boolean;
  isActive: boolean;
}

interface RegisterResponse {
  user: { organizationId: string };
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * The tree is what makes this module different from products: two of its rules
 * — no cycles, and a depth bound — cannot be expressed as constraints, because
 * a check constraint sees only the row being written (ADR-024).
 */
describe('Locations (e2e)', () => {
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

  async function addViewer(
    owner: Awaited<ReturnType<typeof registerOrg>>,
    email: string,
  ) {
    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(
          eq(roles.organizationId, owner.organizationId),
          eq(roles.name, 'Viewer'),
        ),
      );

    await owner.agent
      .post('/v1/users')
      .send({ email, name: 'Viewer', password: PASSWORD, roleId: role.id })
      .expect(201);

    const viewer = authedAgent(app);
    await viewer
      .post('/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return viewer;
  }

  /** Creates a location and returns it. */
  async function create(
    agent: Awaited<ReturnType<typeof registerOrg>>['agent'],
    payload: Record<string, unknown>,
  ) {
    const res = await agent.post('/v1/locations').send(payload).expect(201);
    return body<{ location: LocationResponse }>(res).location;
  }

  describe('POST /v1/locations', () => {
    it('creates a top-level location with no parent', async () => {
      const alpha = await registerOrg('alpha');

      const warehouse = await create(alpha.agent, {
        type: 'warehouse',
        name: 'Warehouse A',
      });

      // Null parent is the top of the tree, and that single nullable column is
      // the entire hierarchy (ADR-024).
      expect(warehouse.parentId).toBeNull();
      expect(warehouse.isAvailable).toBe(true);
    });

    it('nests a bin under a warehouse', async () => {
      const alpha = await registerOrg('alpha');

      const warehouse = await create(alpha.agent, {
        type: 'warehouse',
        name: 'Warehouse A',
      });

      const bin = await create(alpha.agent, {
        type: 'bin',
        name: 'Bin 5',
        code: 'H5',
        parentId: warehouse.id,
      });

      expect(bin.parentId).toBe(warehouse.id);
      expect(await db.select().from(locations)).toHaveLength(2);
    });

    it('does not enforce depth by type', async () => {
      const alpha = await registerOrg('alpha');

      const outer = await create(alpha.agent, { type: 'bin', name: 'Outer' });

      // type is a label, not a rule. A bin under a bin is odd and permitted —
      // enforcing an order would break the first layout that does not match.
      await create(alpha.agent, {
        type: 'bin',
        name: 'Inner',
        parentId: outer.id,
      });

      expect(await db.select().from(locations)).toHaveLength(2);
    });

    it('rejects a parent in another organization', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      const theirs = await create(beta.agent, {
        type: 'warehouse',
        name: 'Warehouse B',
      });

      // TenantDb scopes the lookup, so the parent is not found rather than
      // forbidden.
      await alpha.agent
        .post('/v1/locations')
        .send({ type: 'bin', name: 'Bin 1', parentId: theirs.id })
        .expect(400);
    });

    it('rejects an unknown type', async () => {
      const alpha = await registerOrg('alpha');

      await alpha.agent
        .post('/v1/locations')
        .send({ type: 'pallet', name: 'Pallet 3' })
        .expect(400);
    });

    it('refuses a Viewer, which lacks locations.create', async () => {
      const alpha = await registerOrg('alpha');
      const viewer = await addViewer(alpha, 'viewer@alpha.example.com');

      await viewer
        .post('/v1/locations')
        .send({ type: 'warehouse', name: 'Sneaky' })
        .expect(403);

      expect(await db.select().from(locations)).toHaveLength(0);
    });
  });

  describe('codes', () => {
    it('allows the same code under different parents', async () => {
      const alpha = await registerOrg('alpha');

      const first = await create(alpha.agent, {
        type: 'aisle',
        name: 'Aisle A',
      });
      const second = await create(alpha.agent, {
        type: 'aisle',
        name: 'Aisle B',
      });

      await create(alpha.agent, {
        type: 'bin',
        name: 'Bin 5',
        code: '5',
        parentId: first.id,
      });

      // Bin 5 in two aisles is two bins, and both labels reading "5" is
      // normal. Global uniqueness would make that impossible.
      await create(alpha.agent, {
        type: 'bin',
        name: 'Bin 5',
        code: '5',
        parentId: second.id,
      });

      expect(await db.select().from(locations)).toHaveLength(4);
    });

    it('rejects a duplicate code under the same parent', async () => {
      const alpha = await registerOrg('alpha');

      const aisle = await create(alpha.agent, {
        type: 'aisle',
        name: 'Aisle A',
      });

      await create(alpha.agent, {
        type: 'bin',
        name: 'Bin 5',
        code: '5',
        parentId: aisle.id,
      });

      await alpha.agent
        .post('/v1/locations')
        .send({ type: 'bin', name: 'Another', code: '5', parentId: aisle.id })
        .expect(409);
    });

    it('allows several locations with no code', async () => {
      const alpha = await registerOrg('alpha');

      const warehouse = await create(alpha.agent, {
        type: 'warehouse',
        name: 'Warehouse A',
      });

      // The unique index is partial — WHERE code IS NOT NULL — so an unlabelled
      // shelf does not collide with every other unlabelled shelf.
      await create(alpha.agent, {
        type: 'shelf',
        name: 'Shelf 1',
        parentId: warehouse.id,
      });

      await create(alpha.agent, {
        type: 'shelf',
        name: 'Shelf 2',
        parentId: warehouse.id,
      });

      expect(await db.select().from(locations)).toHaveLength(3);
    });
  });

  describe('PATCH /v1/locations/:id', () => {
    it('reparents a location', async () => {
      const alpha = await registerOrg('alpha');

      const first = await create(alpha.agent, { type: 'warehouse', name: 'A' });
      const second = await create(alpha.agent, {
        type: 'warehouse',
        name: 'B',
      });
      const bin = await create(alpha.agent, {
        type: 'bin',
        name: 'Bin 1',
        parentId: first.id,
      });

      await alpha.agent
        .patch(`/v1/locations/${bin.id}`)
        .send({ parentId: second.id })
        .expect(204);

      const [row] = await db
        .select()
        .from(locations)
        .where(eq(locations.id, bin.id));

      expect(row.parentId).toBe(second.id);
    });

    it('refuses to move a location under its own descendant', async () => {
      const alpha = await registerOrg('alpha');

      const warehouse = await create(alpha.agent, {
        type: 'warehouse',
        name: 'Warehouse A',
      });

      const aisle = await create(alpha.agent, {
        type: 'aisle',
        name: 'Aisle A',
        parentId: warehouse.id,
      });

      // The rule no constraint can express: a check constraint sees only the
      // row being written, and this needs the chain. Allowing it would detach
      // the subtree — every row still present, none reachable from a root.
      await alpha.agent
        .patch(`/v1/locations/${warehouse.id}`)
        .send({ parentId: aisle.id })
        .expect(400);

      const [row] = await db
        .select()
        .from(locations)
        .where(eq(locations.id, warehouse.id));

      expect(row.parentId).toBeNull();
    });

    it('refuses to make a location its own parent', async () => {
      const alpha = await registerOrg('alpha');

      const warehouse = await create(alpha.agent, {
        type: 'warehouse',
        name: 'Warehouse A',
      });

      await alpha.agent
        .patch(`/v1/locations/${warehouse.id}`)
        .send({ parentId: warehouse.id })
        .expect(400);
    });

    it('caps nesting depth', async () => {
      const alpha = await registerOrg('alpha');

      let parentId: string | undefined;

      // Ten deep is allowed; the eleventh is a data-entry mistake, not a
      // warehouse.
      for (let level = 0; level < 10; level += 1) {
        const created = await create(alpha.agent, {
          type: 'zone',
          name: `Level ${level}`,
          parentId,
        });
        parentId = created.id;
      }

      await alpha.agent
        .post('/v1/locations')
        .send({ type: 'bin', name: 'Too deep', parentId })
        .expect(400);
    });

    it('retires rather than deletes', async () => {
      const alpha = await registerOrg('alpha');

      const warehouse = await create(alpha.agent, {
        type: 'warehouse',
        name: 'Warehouse A',
      });

      await alpha.agent
        .patch(`/v1/locations/${warehouse.id}`)
        .send({ isActive: false })
        .expect(204);

      // A location that has held stock is referenced by movements, so there is
      // no delete route and no locations.delete permission.
      expect(await db.select().from(locations)).toHaveLength(1);
    });

    it('marks a location unavailable without hiding it', async () => {
      const alpha = await registerOrg('alpha');

      const quarantine = await create(alpha.agent, {
        type: 'zone',
        name: 'Quarantine',
      });

      await alpha.agent
        .patch(`/v1/locations/${quarantine.id}`)
        .send({ isAvailable: false })
        .expect(204);

      // Still listed and still counted: the units are physically on a shelf,
      // and an auditor walking the warehouse will find them. Availability
      // queries filter on the flag (ADR-024).
      const res = await alpha.agent.get('/v1/locations').expect(200);
      expect(body<LocationResponse[]>(res)).toHaveLength(1);
      expect(body<LocationResponse[]>(res)[0].isAvailable).toBe(false);
    });

    it('refuses a location in another organization', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      const theirs = await create(beta.agent, {
        type: 'warehouse',
        name: 'Warehouse B',
      });

      await alpha.agent
        .patch(`/v1/locations/${theirs.id}`)
        .send({ name: 'Hijacked' })
        .expect(404);
    });
  });

  describe('GET /v1/locations', () => {
    it('does not show another organization tree', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      await create(beta.agent, { type: 'warehouse', name: 'Warehouse B' });

      const res = await alpha.agent.get('/v1/locations').expect(200);
      expect(body<LocationResponse[]>(res)).toHaveLength(0);
      expect(await db.select().from(locations)).toHaveLength(1);
    });

    it('is readable by a Viewer', async () => {
      const alpha = await registerOrg('alpha');
      await create(alpha.agent, { type: 'warehouse', name: 'Warehouse A' });
      const viewer = await addViewer(alpha, 'viewer@alpha.example.com');

      const res = await viewer.get('/v1/locations').expect(200);
      expect(body<LocationResponse[]>(res)).toHaveLength(1);
    });
  });
});
