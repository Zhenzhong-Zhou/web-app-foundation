import type { INestApplication } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  auditLog,
  memberships,
  permissions,
  rolePermissions,
  roles,
  users,
} from '../src/database/schema';
import {
  addMember as invited,
  body,
  createE2eApp,
  registerOrganization,
  roleIdNamed,
} from './utils/fixtures';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface MemberResponse {
  id: string;
  email: string;
  name: string;
  roleId: string;
}

/**
 * supertest types res.body as `any`. Asserting the shape here keeps the unsafe
 * access in one place instead of on every read, and a wrong guess fails at the
 * assertion rather than as an undefined three lines later.
 */

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

  beforeAll(async () => {
    mail = new RecordingMailService();

    // Registration is limited to 5/minute and this suite registers on every
    // test. The limit has its own coverage in security.e2e-spec.ts.
    app = await createE2eApp(mail);
    db = app.get<Database>(UNSAFE_GLOBAL_DB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    mail.reset();
  });

  /**
   * Provisioning creates Owner/Admin/Viewer per organization (ADR-003), so a
   * role name is only meaningful relative to one org and the id has to be
   * read rather than guessed.
   */

  /**
   * Registers an organization and returns an agent already holding its Owner
   * session, plus the ids the tests need.
   */
  async function registerOrg(slugish: string) {
    const {
      agent,
      userId: ownerId,
      organizationId,
    } = await registerOrganization(app, slugish);

    return {
      agent,
      ownerId,
      organizationId,
      viewerRoleId: await roleIdNamed(app, organizationId, 'Viewer'),
    };
  }

  /**
   * A member with the given role, invited and accepted (ADR-077), signed
   * in as them, with their id.
   */
  async function addMember(
    owner: Awaited<ReturnType<typeof registerOrg>>,
    email: string,
    roleName: string,
  ) {
    const agent = await invited(app, owner, email, roleName);
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    return { agent, id: user.id };
  }

  /** Creates a Viewer in `owner`'s organization and signs in as them. */
  async function addViewer(
    owner: Awaited<ReturnType<typeof registerOrg>>,
    email: string,
  ) {
    return (await addMember(owner, email, 'Viewer')).agent;
  }

  describe('GET /v1/users', () => {
    it('lists the members of the caller organization', async () => {
      const owner = await registerOrg('alpha');

      const res = await owner.agent.get('/v1/users').expect(200);
      const members = body<MemberResponse[]>(res);

      expect(members).toHaveLength(1);
      expect(members[0].email).toBe('owner@alpha.example.com');
    });

    // ADR-063: last active on Members as on People, roughly for everyone,
    // the time itself only with audit.view.
    it('shows last active roughly, and exactly to those with the history', async () => {
      const owner = await registerOrg('alpha');
      const viewer = await addViewer(owner, 'viewer@alpha.example.com');

      type Shown = { email: string; active: string; lastActiveAt?: string };
      const asOwner = body<Shown[]>(
        await owner.agent.get('/v1/users').expect(200),
      );
      const ownerRow = asOwner.find(
        (m) => m.email === 'owner@alpha.example.com',
      );
      expect(ownerRow?.active).toBe('today');
      expect(ownerRow?.lastActiveAt).toEqual(expect.any(String));

      const asViewer = body<Shown[]>(await viewer.get('/v1/users').expect(200));
      expect(asViewer.every((m) => !('lastActiveAt' in m))).toBe(true);
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

  // ADR-077: nobody sets another person's password. A person joins by
  // invitation and chooses their own.
  describe('POST /v1/users', () => {
    it('is gone, so no route makes a member with a password', async () => {
      const owner = await registerOrg('alpha');

      await owner.agent
        .post('/v1/users')
        .send({
          email: 'sam@example.com',
          name: 'Sam',
          password: 'a-password-someone-else-knows',
          roleId: owner.viewerRoleId,
        })
        .expect(404);
      const made = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, 'sam@example.com'));
      expect(made).toEqual([]);
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

      // Joined server-side: a tombstoned actor (ADR-012) is not in
      // GET /v1/users, so a client could not resolve this id itself. The
      // invitation is the Owner's, its acceptance the new member's.
      expect(
        page.entries.map((entry) => [entry.action, entry.actorEmail]),
      ).toEqual([
        ['invitation.accepted', 'viewer@alpha.example.com'],
        ['invitation.sent', 'owner@alpha.example.com'],
      ]);
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

      // Beta added a member and alpha did not, so alpha's log is empty —
      // and an empty result is its own code path through the left join.
      expect(body<AuditPageResponse>(res).entries).toHaveLength(0);
      expect(await db.select().from(auditLog)).toHaveLength(2);
    });

    it('pages with a keyset cursor', async () => {
      const owner = await registerOrg('alpha');
      // Two rows: the invitation, and its acceptance.
      await addViewer(owner, 'one@alpha.example.com');

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

  describe('GET /v1/roles', () => {
    it('lists the three seeded roles', async () => {
      const alpha = await registerOrg('alpha');

      const res = await alpha.agent.get('/v1/roles').expect(200);
      const roleList = body<{ id: string; name: string }[]>(res);

      expect(roleList.map((role) => role.name)).toEqual([
        'Owner',
        'Admin',
        'Viewer',
      ]);
    });

    it('does not show another organization roles', async () => {
      const alpha = await registerOrg('alpha');
      await registerOrg('beta');

      const res = await alpha.agent.get('/v1/roles').expect(200);

      // Six rows exist; alpha sees three. Roles are per-organization
      // (ADR-003), so a name is only meaningful relative to one.
      expect(body<{ id: string }[]>(res)).toHaveLength(3);
    });
  });

  describe('PATCH /v1/users/:id', () => {
    it('changes a member role', async () => {
      const alpha = await registerOrg('alpha');
      const member = await addMember(
        alpha,
        'member@alpha.example.com',
        'Viewer',
      );
      const adminRoleId = await roleIdNamed(app, alpha.organizationId, 'Admin');

      await alpha.agent
        .patch(`/v1/users/${member.id}`)
        .send({ roleId: adminRoleId })
        .expect(204);

      const [row] = await db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, member.id));

      expect(row.roleId).toBe(adminRoleId);
    });

    it('refuses an Admin assigning the Owner role', async () => {
      const alpha = await registerOrg('alpha');
      const admin = await addMember(alpha, 'admin@alpha.example.com', 'Admin');
      const member = await addMember(
        alpha,
        'member@alpha.example.com',
        'Viewer',
      );
      const ownerRoleId = await roleIdNamed(app, alpha.organizationId, 'Owner');

      // ADR-016's gap, closed in the service. An Admin holds roles.assign, so
      // the guard passes — no permission string can express "not above your
      // own level", which is why this check cannot live there.
      await admin.agent
        .patch(`/v1/users/${member.id}`)
        .send({ roleId: ownerRoleId })
        .expect(403);

      const [row] = await db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, member.id));

      expect(row.roleId).toBe(alpha.viewerRoleId);
    });

    it('refuses an Admin demoting an Owner', async () => {
      const alpha = await registerOrg('alpha');
      const admin = await addMember(alpha, 'admin@alpha.example.com', 'Admin');
      await addMember(alpha, 'second@alpha.example.com', 'Owner');

      // Two Owners exist, so the sole-Owner rule does not fire — which is
      // exactly what made this gap invisible until an Admin tried it.
      await admin.agent
        .patch(`/v1/users/${alpha.ownerId}`)
        .send({ roleId: alpha.viewerRoleId })
        .expect(403);
    });

    it('refuses a Viewer, which lacks roles.assign', async () => {
      const alpha = await registerOrg('alpha');
      const viewer = await addViewer(alpha, 'viewer@alpha.example.com');
      const member = await addMember(
        alpha,
        'member@alpha.example.com',
        'Viewer',
      );
      const adminRoleId = await roleIdNamed(app, alpha.organizationId, 'Admin');

      await viewer
        .patch(`/v1/users/${member.id}`)
        .send({ roleId: adminRoleId })
        .expect(403);
    });

    it('refuses a role that may invite and remove members but not change their roles', async () => {
      const alpha = await registerOrg('alpha');
      // Managing who belongs is not the same as what they may do: which role
      // a member holds is roles.assign, a privilege change of its own
      // (permissions.ts).
      const [office] = await db
        .insert(roles)
        .values({
          organizationId: alpha.organizationId,
          name: 'Office',
          isSystem: false,
        })
        .returning({ id: roles.id });
      const rows = await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(
          inArray(permissions.key, [
            'users.view',
            'users.create',
            'users.delete',
          ]),
        );
      await db
        .insert(rolePermissions)
        .values(
          rows.map((row) => ({ roleId: office.id, permissionId: row.id })),
        );
      const clerk = await addMember(alpha, 'clerk@alpha.example.com', 'Office');
      const member = await addMember(
        alpha,
        'member@alpha.example.com',
        'Viewer',
      );
      const adminRoleId = await roleIdNamed(app, alpha.organizationId, 'Admin');

      await clerk.agent
        .patch(`/v1/users/${member.id}`)
        .send({ roleId: adminRoleId })
        .expect(403);

      const [row] = await db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, member.id));

      expect(row.roleId).toBe(alpha.viewerRoleId);
    });

    it('refuses to demote the only Owner', async () => {
      const alpha = await registerOrg('alpha');

      // Same shape as ADR-012's sole-Owner deletion block, and it binds an
      // Owner acting on themselves: an organization with no Owner has nobody
      // who can appoint one.
      await alpha.agent
        .patch(`/v1/users/${alpha.ownerId}`)
        .send({ roleId: alpha.viewerRoleId })
        .expect(409);

      const [row] = await db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, alpha.ownerId));

      expect(row.roleId).not.toBe(alpha.viewerRoleId);
    });

    it('allows demoting an Owner when another remains', async () => {
      const alpha = await registerOrg('alpha');
      await addMember(alpha, 'second@alpha.example.com', 'Owner');

      await alpha.agent
        .patch(`/v1/users/${alpha.ownerId}`)
        .send({ roleId: alpha.viewerRoleId })
        .expect(204);

      const [row] = await db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, alpha.ownerId));

      expect(row.roleId).toBe(alpha.viewerRoleId);
    });

    it('refuses a role from another organization', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');
      const member = await addMember(
        alpha,
        'member@alpha.example.com',
        'Viewer',
      );

      // A well-formed uuid for a role that exists — just not here. TenantDb
      // scopes the lookup, so the row is not visible rather than off-limits.
      await alpha.agent
        .patch(`/v1/users/${member.id}`)
        .send({ roleId: beta.viewerRoleId })
        .expect(404);
    });

    it('refuses a member of another organization', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');
      const adminRoleId = await roleIdNamed(app, alpha.organizationId, 'Admin');

      await alpha.agent
        .patch(`/v1/users/${beta.ownerId}`)
        .send({ roleId: adminRoleId })
        .expect(404);
    });

    it('records an audit row', async () => {
      const alpha = await registerOrg('alpha');
      const member = await addMember(
        alpha,
        'member@alpha.example.com',
        'Viewer',
      );
      const adminRoleId = await roleIdNamed(app, alpha.organizationId, 'Admin');

      await alpha.agent
        .patch(`/v1/users/${member.id}`)
        .send({ roleId: adminRoleId })
        .expect(204);

      const rows = await db.select().from(auditLog);
      const [changed] = rows.filter(
        (row) => row.action === 'user.role_changed',
      );

      // 204, so resourceId comes off the path rather than a response body —
      // the reason @Audited's extractor now receives the request.
      expect(changed.resourceId).toBe(member.id);
      expect(changed.organizationId).toBe(alpha.organizationId);
    });
  });

  describe('DELETE /v1/users/:id', () => {
    it('removes the membership and leaves the account', async () => {
      const alpha = await registerOrg('alpha');
      const member = await addMember(
        alpha,
        'member@alpha.example.com',
        'Viewer',
      );

      await alpha.agent.delete(`/v1/users/${member.id}`).expect(204);

      expect(await db.select().from(memberships)).toHaveLength(1);
      // The account survives. Revoking access is not deletion (ADR-012).
      expect(await db.select().from(users)).toHaveLength(2);
    });

    it('leaves the removed member able to reach their own account', async () => {
      const alpha = await registerOrg('alpha');
      const member = await addMember(
        alpha,
        'member@alpha.example.com',
        'Viewer',
      );

      await alpha.agent.delete(`/v1/users/${member.id}`).expect(204);

      // Their session is not revoked. The middleware resolves membership per
      // request (ADR-016), so they lose the organization and keep the account.
      await member.agent.get('/v1/users').expect(403);
      await member.agent.get('/v1/auth/me').expect(200);
    });

    it('refuses to remove yourself', async () => {
      const alpha = await registerOrg('alpha');

      await alpha.agent.delete(`/v1/users/${alpha.ownerId}`).expect(400);
    });

    it('refuses an Admin removing an Owner', async () => {
      const alpha = await registerOrg('alpha');
      const admin = await addMember(alpha, 'admin@alpha.example.com', 'Admin');
      await addMember(alpha, 'second@alpha.example.com', 'Owner');

      await admin.agent.delete(`/v1/users/${alpha.ownerId}`).expect(403);
    });

    it('refuses to remove the only Owner', async () => {
      const alpha = await registerOrg('alpha');
      const second = await addMember(
        alpha,
        'second@alpha.example.com',
        'Owner',
      );

      // Removing the second Owner is fine; removing the last is not.
      await alpha.agent.delete(`/v1/users/${second.id}`).expect(204);
      await alpha.agent.delete(`/v1/users/${alpha.ownerId}`).expect(400);
    });

    it('refuses a Viewer, which lacks users.delete', async () => {
      const alpha = await registerOrg('alpha');
      const viewer = await addViewer(alpha, 'viewer@alpha.example.com');
      const member = await addMember(
        alpha,
        'member@alpha.example.com',
        'Viewer',
      );

      await viewer.delete(`/v1/users/${member.id}`).expect(403);
    });

    it('refuses a member of another organization', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      await alpha.agent.delete(`/v1/users/${beta.ownerId}`).expect(404);
    });
  });
});
