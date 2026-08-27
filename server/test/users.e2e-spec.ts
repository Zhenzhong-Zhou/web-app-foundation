import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { memberships, roles } from '../src/database/schema';
import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './utils/create-test-app';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface MemberResponse {
  id: string;
  email: string;
  name: string;
  roleId: string;
}

interface RegisterResponse {
  user: { id: string; email: string; name: string; organizationId: string };
}

/**
 * supertest types res.body as `any`. Asserting the shape here keeps the unsafe
 * access in one place instead of on every read, and a wrong guess fails at the
 * assertion rather than as an undefined three lines later.
 */
function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * The step-4 claim: a role that lacks a permission is refused, and the refusal
 * is a property of the role rather than of being "not the owner".
 *
 * Also the first suite where tenant isolation is proved over real HTTP. Every
 * earlier isolation test called runInTenantContext by hand; here the context
 * comes from a cookie, a session row, and a membership lookup, which is the
 * path that actually runs in production.
 */
describe('Users (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let mail: RecordingMailService;

  const PASSWORD = 'correct-horse-battery';

  beforeAll(async () => {
    mail = new RecordingMailService();

    // Registration is limited to 5/minute and this suite registers on every
    // test. The limit has its own coverage in security.e2e-spec.ts.
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(ThrottlerStorage)
        .useValue(unlimitedThrottler)
        .overrideProvider(MailService)
        .useValue(mail),
    );

    db = app.get<Database>(UNSAFE_GLOBAL_DB);
    await seedPermissions(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    mail.reset();
  });

  /**
   * Registers an organization and returns an agent already holding its Owner
   * session, plus the ids the tests need.
   *
   * The role id is read from the database rather than guessed: provisioning
   * creates Owner/Admin/Viewer per organization (ADR-003), so "the Viewer
   * role" is only meaningful relative to one org.
   */
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

    const organizationId = body<RegisterResponse>(res).user.organizationId;

    const [viewerRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(eq(roles.organizationId, organizationId), eq(roles.name, 'Viewer')),
      );

    return { agent, organizationId, viewerRoleId: viewerRole.id };
  }

  /** Creates a Viewer in `agent`'s organization and signs in as them. */
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
        roleId: owner.viewerRoleId,
      })
      .expect(201);

    const viewer = authedAgent(app);
    await viewer
      .post('/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);

    return viewer;
  }

  describe('GET /v1/users', () => {
    it('lists the members of the caller organization', async () => {
      const owner = await registerOrg('alpha');

      const res = await owner.agent.get('/v1/users').expect(200);
      const members = body<MemberResponse[]>(res);

      expect(members).toHaveLength(1);
      expect(members[0].email).toBe('owner@alpha.example.com');
    });

    it('never leaks a password hash', async () => {
      const owner = await registerOrg('alpha');

      const res = await owner.agent.get('/v1/users').expect(200);
      const members = body<MemberResponse[]>(res);

      // selectJoined requires an explicit projection precisely so this cannot
      // happen by someone joining whole tables.
      expect(members[0]).not.toHaveProperty('passwordHash');
      expect(members[0]).not.toHaveProperty('password_hash');
    });

    it('is readable by a Viewer, which holds users.view', async () => {
      const owner = await registerOrg('alpha');
      const viewer = await addViewer(owner, 'viewer@alpha.example.com');

      const res = await viewer.get('/v1/users').expect(200);
      expect(body<MemberResponse[]>(res)).toHaveLength(2);
    });

    it('does not show another organization members', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');
      await addViewer(beta, 'viewer@beta.example.com');

      const res = await alpha.agent.get('/v1/users').expect(200);
      const members = body<MemberResponse[]>(res);

      // Three users exist; alpha sees one. The filter came from the cookie,
      // not from anything this test set up by hand.
      expect(members).toHaveLength(1);
      expect(members[0].email).toBe('owner@alpha.example.com');
    });

    it('requires a session', async () => {
      await authedAgent(app).get('/v1/users').expect(401);
    });
  });

  describe('POST /v1/users', () => {
    it('creates a member with the given role', async () => {
      const owner = await registerOrg('alpha');

      const res = await owner.agent
        .post('/v1/users')
        .send({
          email: 'viewer@alpha.example.com',
          name: 'Viewer',
          password: PASSWORD,
          roleId: owner.viewerRoleId,
        })
        .expect(201);

      expect(body<{ user: MemberResponse }>(res).user.roleId).toBe(
        owner.viewerRoleId,
      );
      expect(await db.select().from(memberships)).toHaveLength(2);
    });

    it('refuses a Viewer, which lacks users.create', async () => {
      const owner = await registerOrg('alpha');
      const viewer = await addViewer(owner, 'viewer@alpha.example.com');

      // The roadmap line. Note this is the *same* authenticated user who gets
      // 200 on GET /v1/users above — so the refusal is a property of the role
      // and the route, not of the session.
      await viewer
        .post('/v1/users')
        .send({
          email: 'sneaky@alpha.example.com',
          name: 'Sneaky',
          password: PASSWORD,
          roleId: owner.viewerRoleId,
        })
        .expect(403);

      expect(await db.select().from(memberships)).toHaveLength(2);
    });

    it('refuses a role belonging to another organization', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      // A well-formed uuid for a role that exists — just not here. TenantDb
      // scopes the lookup, so it is simply not found.
      await alpha.agent
        .post('/v1/users')
        .send({
          email: 'crossorg@alpha.example.com',
          name: 'Cross',
          password: PASSWORD,
          roleId: beta.viewerRoleId,
        })
        .expect(400);

      expect(await db.select().from(memberships)).toHaveLength(2);
    });

    it('rejects an email that already has an account', async () => {
      const owner = await registerOrg('alpha');

      await owner.agent
        .post('/v1/users')
        .send({
          email: 'owner@alpha.example.com',
          name: 'Duplicate',
          password: PASSWORD,
          roleId: owner.viewerRoleId,
        })
        .expect(409);
    });
  });
});
