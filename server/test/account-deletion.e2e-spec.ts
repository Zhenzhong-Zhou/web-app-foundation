import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { AccountDeletionService } from '../src/core/auth/account-deletion.service';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  accountEvents,
  auditLog,
  memberships,
  sessions,
  users,
} from '../src/database/schema';
import {
  addMember,
  body,
  createE2eApp,
  createLocation,
  PASSWORD,
  registerOrganization,
  roleIdNamed,
} from './utils/fixtures';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface Refusal {
  code?: string;
}

interface Me {
  user: { id: string; deletionScheduledAt?: string | null };
  organization: { id: string } | null;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Leaving an organization, and deleting your account (ADR-069): the two
 * blocks they share, the 30 days, what completing removes and keeps, and
 * the export.
 */
describe('Account deletion (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  const mail = new RecordingMailService();

  beforeAll(async () => {
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

  async function userIdOf(email: string): Promise<string> {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    return user.id;
  }

  /** An organization with its Owner and one more member. */
  async function team(roleName = 'Viewer') {
    const owner = await registerOrganization(app, 'alpha');
    const email = 'member@alpha.example.com';
    const member = await addMember(app, owner, email, roleName);
    return { owner, member, email, memberId: await userIdOf(email) };
  }

  describe('leaving an organization', () => {
    it('refuses the only member, who would leave it with no one', async () => {
      const owner = await registerOrganization(app, 'alpha');

      const res = await owner.agent
        .delete('/v1/account/membership')
        .expect(409);

      expect(body<Refusal>(res).code).toBe('only_member');
    });

    it('refuses the last Owner while other members remain', async () => {
      const { owner } = await team();

      const res = await owner.agent
        .delete('/v1/account/membership')
        .expect(409);

      expect(body<Refusal>(res).code).toBe('last_owner_with_members');
    });

    it('lets a member leave, keeping the account and recording it', async () => {
      const { owner, member, email, memberId } = await team();

      await member.delete('/v1/account/membership').expect(204);

      const me = body<Me>(await member.get('/v1/auth/me').expect(200));
      expect(me.organization).toBeNull();

      const left = await db
        .select({ actorId: auditLog.actorId })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.organizationId, owner.organizationId),
            eq(auditLog.action, 'member.left'),
          ),
        );
      expect(left).toEqual([{ actorId: memberId }]);

      const events = await db
        .select({ action: accountEvents.action })
        .from(accountEvents)
        .where(eq(accountEvents.userId, memberId));
      expect(events.map((event) => event.action)).toContain(
        'account.left_organization',
      );

      await authedAgent(app)
        .post('/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
    });

    it('lets an Owner leave once another member is Owner', async () => {
      const { owner } = await team('Owner');

      await owner.agent.delete('/v1/account/membership').expect(204);
    });
  });

  describe('requesting deletion', () => {
    it('refuses a wrong password', async () => {
      const { member } = await team();

      await member
        .post('/v1/account/deletion')
        .send({ password: 'not-the-password' })
        .expect(401);
    });

    it('refuses the only member of an organization', async () => {
      const owner = await registerOrganization(app, 'alpha');

      const res = await owner.agent
        .post('/v1/account/deletion')
        .send({ password: PASSWORD })
        .expect(409);

      expect(body<Refusal>(res).code).toBe('only_member');
    });

    it('schedules it 30 days ahead, signs out other devices and emails the date', async () => {
      const { member, email, memberId } = await team();
      const other = authedAgent(app);
      await other
        .post('/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);

      const res = await member
        .post('/v1/account/deletion')
        .send({ password: PASSWORD })
        .expect(200);

      const due = new Date(
        body<{ deletionScheduledAt: string }>(res).deletionScheduledAt,
      );
      expect(Math.abs(due.getTime() - Date.now() - 30 * DAY)).toBeLessThan(
        60_000,
      );

      await other.get('/v1/auth/me').expect(401);
      const me = body<Me>(await member.get('/v1/auth/me').expect(200));
      expect(me.user.deletionScheduledAt).toBe(due.toISOString());

      expect(mail.lastTo(email)?.subject).toMatch(/will be deleted on/);

      const events = await db
        .select({ action: accountEvents.action })
        .from(accountEvents)
        .where(eq(accountEvents.userId, memberId));
      expect(events.map((event) => event.action)).toContain(
        'account.deletion_requested',
      );
    });

    it('changes nothing when asked twice', async () => {
      const { member } = await team();
      const ask = () =>
        member
          .post('/v1/account/deletion')
          .send({ password: PASSWORD })
          .expect(200);

      const first = body<{ deletionScheduledAt: string }>(await ask());
      const second = body<{ deletionScheduledAt: string }>(await ask());

      expect(second.deletionScheduledAt).toBe(first.deletionScheduledAt);
    });

    it('is cancelled, and the cancellation emailed', async () => {
      const { member, email } = await team();
      await member
        .post('/v1/account/deletion')
        .send({ password: PASSWORD })
        .expect(200);

      await member.delete('/v1/account/deletion').expect(204);

      const me = body<Me>(await member.get('/v1/auth/me').expect(200));
      expect(me.user.deletionScheduledAt).toBeNull();
      expect(mail.lastTo(email)?.subject).toBe(
        'Your account will not be deleted',
      );
    });
  });

  describe('completing a deletion', () => {
    async function due(memberId: string): Promise<void> {
      await db
        .update(users)
        .set({ deletionScheduledAt: new Date(Date.now() - DAY) })
        .where(eq(users.id, memberId));
    }

    it('anonymizes the person and keeps the audit log and their records', async () => {
      const { owner, member, email, memberId } = await team('Admin');
      await createLocation(member, { type: 'site', name: 'Dock' });
      await member
        .post('/v1/account/deletion')
        .send({ password: PASSWORD })
        .expect(200);
      await due(memberId);

      const result = await app.get(AccountDeletionService).completeDue();
      expect(result).toEqual({ completed: 1, blocked: 0 });

      const [row] = await db.select().from(users).where(eq(users.id, memberId));
      expect(row).toMatchObject({
        email: `deleted-${memberId}@invalid`,
        name: 'Deleted User',
        passwordHash: null,
        photoFileId: null,
        deletionScheduledAt: null,
      });
      expect(row.deletedAt).not.toBeNull();

      const left = await Promise.all([
        db.select().from(memberships).where(eq(memberships.userId, memberId)),
        db.select().from(sessions).where(eq(sessions.userId, memberId)),
        db
          .select()
          .from(accountEvents)
          .where(eq(accountEvents.userId, memberId)),
      ]);
      expect(left.map((rows) => rows.length)).toEqual([0, 0, 0]);

      const kept = await db
        .select({ action: auditLog.action })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.organizationId, owner.organizationId),
            eq(auditLog.actorId, memberId),
          ),
        );
      expect(kept.map((entry) => entry.action)).toEqual(
        expect.arrayContaining(['location.created', 'user.account_deleted']),
      );

      await member.get('/v1/auth/me').expect(401);
      await authedAgent(app)
        .post('/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(401);

      // The address is free again (ADR-012).
      await authedAgent(app)
        .post('/v1/auth/register')
        .send({
          email,
          password: PASSWORD,
          name: 'Someone new',
          organizationName: 'New Co',
        })
        .expect(201);
    });

    it('cancels instead when a block now applies, and emails why', async () => {
      const { owner, member, email, memberId } = await team();
      await member
        .post('/v1/account/deletion')
        .send({ password: PASSWORD })
        .expect(200);

      // The member becomes Owner and the first Owner leaves, so the member
      // is now the organization's only member.
      await owner.agent
        .patch(`/v1/users/${memberId}`)
        .send({ roleId: await roleIdNamed(app, owner.organizationId, 'Owner') })
        .expect(204);
      await owner.agent.delete('/v1/account/membership').expect(204);
      await due(memberId);

      const result = await app.get(AccountDeletionService).completeDue();
      expect(result).toEqual({ completed: 0, blocked: 1 });

      const [row] = await db.select().from(users).where(eq(users.id, memberId));
      expect(row.deletionScheduledAt).toBeNull();
      expect(row.deletedAt).toBeNull();
      expect(mail.lastTo(email)?.subject).toBe(
        'Your account could not be deleted',
      );
    });
  });

  describe('exporting your data', () => {
    it("gives the person's own data, and nothing of another organization's", async () => {
      const owner = await registerOrganization(app, 'alpha');
      await registerOrganization(app, 'beta');

      const res = await owner.agent.get('/v1/account/export').expect(200);

      expect(res.headers['content-disposition']).toContain('attachment');
      const data = body<{
        profile: { email: string };
        memberships: { organizationName: string }[];
        devices: unknown[];
        accountHistory: { action: string }[];
      }>(res);
      expect(data.profile.email).toBe(owner.email);
      expect(data.memberships.map((each) => each.organizationName)).toEqual([
        'alpha Co',
      ]);
      expect(data.devices.length).toBeGreaterThan(0);
      expect(data.accountHistory.map((event) => event.action)).toContain(
        'account.registered',
      );
    });
  });
});
