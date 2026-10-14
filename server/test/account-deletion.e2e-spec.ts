import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { todayUtc } from '../src/common/today';
import {
  AccountDeletionService,
  deletionDayFor,
} from '../src/core/auth/account-deletion.service';
import { AccountPhotoService } from '../src/core/auth/account-photo.service';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  accountEvents,
  auditLog,
  authTokens,
  memberships,
  notifications,
  recentRecords,
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

/** A YYYY-MM-DD day as the English email names it, unconverted. */
function longDay(day: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

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

  /** Until this many connections are waiting on a lock, for up to 5s. */
  async function waitingOnLocks(count: number): Promise<void> {
    const until = Date.now() + 5000;
    for (;;) {
      const { rows } = await db.execute<{ waiting: number }>(sql`
        select count(*)::int as waiting from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'
      `);
      if (rows[0].waiting >= count) return;
      if (Date.now() > until) {
        throw new Error(`${rows[0].waiting} of ${count} waiting on a lock`);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
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

    /**
     * Each would see the other still there and go, leaving the
     * organization with no one (ADR-069), unless the second waits for the
     * first on the organization's lock. The test holds the membership rows
     * until both requests are waiting on a lock, so they overlap every
     * time rather than by luck.
     */
    it('lets only one of two Owners leaving at once go', async () => {
      const { owner, member } = await team('Owner');
      // Marked active now, so neither request's own once-a-minute write to
      // its membership waits on the rows held below.
      await owner.agent.get('/v1/auth/me').expect(200);
      await member.get('/v1/auth/me').expect(200);

      let leaving!: Promise<{ status: number }[]>;
      await db.transaction(async (tx) => {
        await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(eq(memberships.organizationId, owner.organizationId))
          .for('update');
        leaving = Promise.all([
          owner.agent.delete('/v1/account/membership'),
          member.delete('/v1/account/membership'),
        ]);
        await waitingOnLocks(2);
      });
      const results = await leaving;

      expect(results.map((res) => res.status).sort()).toEqual([204, 409]);
      const remaining = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(eq(memberships.organizationId, owner.organizationId));
      expect(remaining).toHaveLength(1);
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

    it('sets the day 30 days ahead, signs out other devices and emails the day', async () => {
      const { member, email, memberId } = await team();
      const other = authedAgent(app);
      await other
        .post('/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);

      const before = new Date();
      const res = await member
        .post('/v1/account/deletion')
        .send({ password: PASSWORD })
        .expect(200);
      const after = new Date();

      // A calendar day (ADR-052), 30 days ahead, whichever side of midnight
      // the request fell.
      const day = body<{ deletionScheduledAt: string }>(
        res,
      ).deletionScheduledAt;
      expect([deletionDayFor(before), deletionDayFor(after)]).toContain(day);

      await other.get('/v1/auth/me').expect(401);
      const me = body<Me>(await member.get('/v1/auth/me').expect(200));
      expect(me.user.deletionScheduledAt).toBe(day);

      // The email names the same day, unconverted, as the banner does.
      expect(mail.lastTo(email)?.subject).toBe(
        `Your account will be deleted after ${longDay(day)}`,
      );

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

    /**
     * Someone who has not chosen a language is written to in the one they
     * asked in, rather than English (ADR-054).
     */
    it('emails in the language of the request, for someone with none chosen', async () => {
      const { member, email } = await team();

      await member
        .post('/v1/account/deletion')
        .set('Accept-Language', 'fr-CA')
        .send({ password: PASSWORD })
        .expect(200);
      expect(mail.lastTo(email)?.subject).toMatch(
        /^Votre compte sera supprimé après le /,
      );

      await member
        .delete('/v1/account/deletion')
        .set('Accept-Language', 'zh-Hans')
        .expect(204);
      expect(mail.lastTo(email)?.subject).toBe('您的账户不会被删除');
    });
  });

  describe('completing a deletion', () => {
    /** A deletion day two days gone: ended in every time zone. */
    async function due(memberId: string): Promise<void> {
      await db
        .update(users)
        .set({ deletionScheduledAt: todayUtc(new Date(Date.now() - 2 * DAY)) })
        .where(eq(users.id, memberId));
    }

    it('waits until the deletion day has ended in every time zone', async () => {
      const { member, memberId } = await team();
      await member
        .post('/v1/account/deletion')
        .send({ password: PASSWORD })
        .expect(200);
      await db
        .update(users)
        .set({ deletionScheduledAt: '2026-11-14' })
        .where(eq(users.id, memberId));
      const deletion = app.get(AccountDeletionService);

      // 11:59 UTC on the 15th is still the 14th at UTC−12, where days end
      // last; at noon the 14th has ended everywhere.
      expect(
        await deletion.completeDue(new Date('2026-11-15T11:59:00Z')),
      ).toEqual({ completed: 0, blocked: 0, failed: 0 });
      expect(
        await deletion.completeDue(new Date('2026-11-15T12:00:00Z')),
      ).toEqual({ completed: 1, blocked: 0, failed: 0 });
    });

    it('anonymizes the person and keeps the audit log and their records', async () => {
      const { owner, member, email, memberId } = await team('Admin');
      await createLocation(member, { type: 'site', name: 'Dock' });
      await member
        .post('/v1/account/deletion')
        .send({ password: PASSWORD })
        .expect(200);

      // Something of each kind ADR-069 removes, so none is gone vacuously.
      await member
        .patch('/v1/account/profile')
        .send({ locale: 'fr-CA' })
        .expect(204);
      await authedAgent(app)
        .post('/v1/auth/forgot-password')
        .send({ email })
        .expect(202);
      await db.insert(recentRecords).values({
        organizationId: owner.organizationId,
        userId: memberId,
        kind: 'product',
        recordId: randomUUID(),
      });
      await db.insert(notifications).values({
        organizationId: owner.organizationId,
        userId: memberId,
        type: 'production.variance',
        title: 'A run used more than planned',
      });

      /** How many of each are the person's, in ADR-069's table order. */
      const theirs = async () =>
        (
          await Promise.all([
            db.select().from(sessions).where(eq(sessions.userId, memberId)),
            db.select().from(authTokens).where(eq(authTokens.userId, memberId)),
            db
              .select()
              .from(accountEvents)
              .where(eq(accountEvents.userId, memberId)),
            db
              .select()
              .from(notifications)
              .where(eq(notifications.userId, memberId)),
            db
              .select()
              .from(recentRecords)
              .where(eq(recentRecords.userId, memberId)),
            db
              .select()
              .from(memberships)
              .where(eq(memberships.userId, memberId)),
          ])
        ).map((rows) => rows.length);
      expect((await theirs()).every((count) => count > 0)).toBe(true);

      await due(memberId);

      const result = await app.get(AccountDeletionService).completeDue();
      expect(result).toEqual({ completed: 1, blocked: 0, failed: 0 });

      const [row] = await db.select().from(users).where(eq(users.id, memberId));
      expect(row).toMatchObject({
        email: `deleted-${memberId}@invalid`,
        name: 'Deleted User',
        passwordHash: null,
        locale: null,
        photoFileId: null,
        deletionScheduledAt: null,
      });
      expect(row.deletedAt).not.toBeNull();

      expect(await theirs()).toEqual([0, 0, 0, 0, 0, 0]);

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
      expect(result).toEqual({ completed: 0, blocked: 1, failed: 0 });

      const [row] = await db.select().from(users).where(eq(users.id, memberId));
      expect(row.deletionScheduledAt).toBeNull();
      expect(row.deletedAt).toBeNull();
      expect(mail.lastTo(email)?.subject).toBe(
        'Your account could not be deleted',
      );

      // The history says why the deletion went, not only that it was asked.
      const events = await db
        .select({ action: accountEvents.action })
        .from(accountEvents)
        .where(eq(accountEvents.userId, memberId));
      expect(events.map((event) => event.action)).toContain(
        'account.deletion_cancelled',
      );
    });

    it('completes the others when one fails, and tries it again next time', async () => {
      const { owner, member, memberId } = await team();
      const second = await addMember(
        app,
        owner,
        'second@alpha.example.com',
        'Viewer',
      );
      const secondId = await userIdOf('second@alpha.example.com');
      for (const agent of [member, second]) {
        await agent
          .post('/v1/account/deletion')
          .send({ password: PASSWORD })
          .expect(200);
      }
      await due(memberId);
      await due(secondId);

      // Storage down for the first member's photo, whichever comes first.
      // Neither has a photo, so for the other there is nothing to remove.
      const failing = vi
        .spyOn(app.get(AccountPhotoService), 'removeFor')
        .mockImplementation((userId) =>
          userId === memberId
            ? Promise.reject(new Error('Storage unavailable'))
            : Promise.resolve(false),
        );
      const deletion = app.get(AccountDeletionService);

      expect(await deletion.completeDue()).toEqual({
        completed: 1,
        blocked: 0,
        failed: 1,
      });
      const [kept] = await db
        .select({ deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.id, memberId));
      expect(kept.deletedAt).toBeNull();

      failing.mockRestore();
      expect(await deletion.completeDue()).toEqual({
        completed: 1,
        blocked: 0,
        failed: 0,
      });
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
