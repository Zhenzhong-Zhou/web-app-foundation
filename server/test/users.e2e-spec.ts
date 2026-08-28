import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { auditLog, memberships, roles } from '../src/database/schema';
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

    it('records an audit row', async () => {
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

      const [row] = await db.select().from(auditLog);

      // ADR-012: ip and user_agent are captured at event time, because the
      // user row is anonymised on deletion and stops identifying anyone.
      expect(row.action).toBe('user.created');
      expect(row.resourceId).toBe(body<{ user: MemberResponse }>(res).user.id);
      expect(row.organizationId).toBe(owner.organizationId);
      expect(row.ip).not.toBeNull();
    });

    it('records nothing when the action was refused', async () => {
      const owner = await registerOrg('alpha');
      const viewer = await addViewer(owner, 'viewer@alpha.example.com');

      await viewer
        .post('/v1/users')
        .send({
          email: 'sneaky@alpha.example.com',
          name: 'Sneaky',
          password: PASSWORD,
          roleId: owner.viewerRoleId,
        })
        .expect(403);

      // A failed action is not an action — the interceptor's concatMap never
      // runs on an error path. One row, not zero: addViewer created a member
      // above, and that did audit.
      expect(await db.select().from(auditLog)).toHaveLength(1);
    });
  });

  describe('GET /v1/audit', () => {
    interface AuditRecordResponse {
      id: string;
      action: string;
      resourceId: string | null;
      actorId: string | null;
      actorEmail: string | null;
      ip: string | null;
    }

    interface AuditPageResponse {
      entries: AuditRecordResponse[];
      nextCursor: string | null;
    }

    it('returns the row the caller just caused, with the actor resolved', async () => {
      const owner = await registerOrg('alpha');
      await addViewer(owner, 'viewer@alpha.example.com');

      const res = await owner.agent.get('/v1/audit').expect(200);
      const page = body<AuditPageResponse>(res);

      expect(page.entries).toHaveLength(1);
      // Joined server-side: a tombstoned actor (ADR-012) is not in
      // GET /v1/users, so a client could not resolve this id itself.
      expect(page.entries[0].actorEmail).toBe('owner@alpha.example.com');
      expect(page.entries[0].action).toBe('user.created');
      expect(page.nextCursor).toBeNull();
    });

    it('refuses a Viewer, which lacks audit.view', async () => {
      const owner = await registerOrg('alpha');
      const viewer = await addViewer(owner, 'viewer@alpha.example.com');

      // Owner and Admin hold audit.view; Viewer does not. Who did what is
      // not read-only information.
      await viewer.get('/v1/audit').expect(403);
    });

    it('does not show another organization entries', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');
      await addViewer(beta, 'viewer@beta.example.com');

      const res = await alpha.agent.get('/v1/audit').expect(200);

      // Beta created a member and alpha did not, so alpha's log is empty —
      // and an empty result is its own code path through the left join.
      expect(body<AuditPageResponse>(res).entries).toHaveLength(0);
      expect(await db.select().from(auditLog)).toHaveLength(1);
    });

    it('pages with a keyset cursor', async () => {
      const owner = await registerOrg('alpha');
      await addViewer(owner, 'one@alpha.example.com');
      await addViewer(owner, 'two@alpha.example.com');

      const first = body<AuditPageResponse>(
        await owner.agent.get('/v1/audit?limit=1').expect(200),
      );

      expect(first.entries).toHaveLength(1);
      expect(first.nextCursor).not.toBeNull();

      const second = body<AuditPageResponse>(
        await owner.agent
          .get(`/v1/audit?limit=1&before=${first.nextCursor}`)
          .expect(200),
      );

      // Newest first, so page two is the older row — and the two pages must
      // not overlap. Offset paging would repeat a row here the moment a third
      // arrived between the calls.
      expect(second.entries).toHaveLength(1);
      expect(second.entries[0].id).not.toBe(first.entries[0].id);
      expect(second.nextCursor).toBeNull();
    });

    it('rejects a limit above the ceiling', async () => {
      const owner = await registerOrg('alpha');

      // Without the cap, ?limit=999999 pulls the table in one query.
      await owner.agent.get('/v1/audit?limit=500').expect(400);
    });
  });
});
