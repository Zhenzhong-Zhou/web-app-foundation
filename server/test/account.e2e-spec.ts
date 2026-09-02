import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  authTokens,
  memberships,
  sessions,
  users,
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

interface SessionSummary {
  id: string;
  current: boolean;
  ip: string | null;
  userAgent: string | null;
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * Self-service account actions. The claims here are about rows and about who
 * may touch them — a black-box status code cannot make either.
 */
describe('Account (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let mail: RecordingMailService;

  const EMAIL = 'account@example.com';
  const PASSWORD = 'correct-horse-battery';
  const NEW_PASSWORD = 'a-completely-different-one';

  const registration = {
    email: EMAIL,
    password: PASSWORD,
    name: 'Account',
    organizationName: 'Account Co',
  };

  beforeAll(async () => {
    mail = new RecordingMailService();

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

  /** Registers and returns an agent holding the resulting session. */
  async function register(overrides: Partial<typeof registration> = {}) {
    const agent = authedAgent(app);
    await agent
      .post('/v1/auth/register')
      .send({ ...registration, ...overrides })
      .expect(201);
    return agent;
  }

  /** A second signed-in agent for the same account — a second device. */
  async function signInAgain(email = EMAIL, password = PASSWORD) {
    const agent = authedAgent(app);
    await agent.post('/v1/auth/login').send({ email, password }).expect(200);
    return agent;
  }

  describe('PATCH /v1/account/profile', () => {
    it('updates the name', async () => {
      const agent = await register();

      await agent
        .patch('/v1/account/profile')
        .send({ name: 'Renamed' })
        .expect(204);

      const [user] = await db.select().from(users);
      expect(user.name).toBe('Renamed');
    });

    it('rejects an empty name', async () => {
      const agent = await register();
      await agent.patch('/v1/account/profile').send({ name: '  ' }).expect(400);
    });

    it('ignores an email in the body', async () => {
      const agent = await register();

      // Changing an address is a flow, not a field: the new one has to be
      // verified before it takes effect. The DTO whitelist is what stops a
      // client from smuggling one through here.
      await agent
        .patch('/v1/account/profile')
        .send({ name: 'Renamed', email: 'hijack@example.com' })
        .expect(400);

      const [user] = await db.select().from(users);
      expect(user.email).toBe(EMAIL);
    });

    it('requires a session', async () => {
      await authedAgent(app)
        .patch('/v1/account/profile')
        .send({ name: 'Nobody' })
        .expect(401);
    });

    it('works for a user with no organization', async () => {
      const agent = await register();
      await db.delete(memberships);

      // @AllowNoOrganization: account actions are about the identity, not the
      // tenant. A user removed from their last org must still manage their
      // own account.
      await agent
        .patch('/v1/account/profile')
        .send({ name: 'Orphan' })
        .expect(204);
    });
  });

  describe('POST /v1/account/password', () => {
    it('refuses a wrong current password and changes nothing', async () => {
      const agent = await register();
      const [before] = await db.select().from(users);

      await agent
        .post('/v1/account/password')
        .send({ currentPassword: 'not-it', newPassword: NEW_PASSWORD })
        .expect(401);

      // A 401 that still wrote the hash would be invisible from outside.
      const [after] = await db.select().from(users);
      expect(after.passwordHash).toBe(before.passwordHash);
    });

    it('sets the new password and refuses the old one', async () => {
      const agent = await register();

      await agent
        .post('/v1/account/password')
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(200);

      await authedAgent(app)
        .post('/v1/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
        .expect(401);

      await authedAgent(app)
        .post('/v1/auth/login')
        .send({ email: EMAIL, password: NEW_PASSWORD })
        .expect(200);
    });

    it('signs out other devices and keeps the caller signed in', async () => {
      const agent = await register();
      const other = await signInAgain();

      expect(await db.select().from(sessions)).toHaveLength(2);

      const res = await agent
        .post('/v1/account/password')
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(200);

      expect(
        body<{ otherSessionsRevoked: number }>(res).otherSessionsRevoked,
      ).toBe(1);

      // ADR-011's binding rule. Reset revokes everything because the user is
      // presumed compromised; change is initiated by someone already
      // authenticated, so their own session survives.
      expect(await db.select().from(sessions)).toHaveLength(1);
      await agent.get('/v1/auth/me').expect(200);
      await other.get('/v1/auth/me').expect(401);
    });

    it('invalidates an outstanding reset token', async () => {
      const agent = await register();

      await authedAgent(app)
        .post('/v1/auth/forgot-password')
        .send({ email: EMAIL })
        .expect(202);

      const match = /token=([\w-]+)/.exec(mail.lastTo(EMAIL)!.html);
      const token = match![1];

      await agent
        .post('/v1/account/password')
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(200);

      // An attacker who requested a link before the change would otherwise
      // still hold a live way in.
      await authedAgent(app)
        .post('/v1/auth/reset-password')
        .send({ token, password: 'attacker-chosen-password' })
        .expect(400);

      // Filtered by purpose: registration issued a verification token too,
      // and that one is correctly still live.
      const [row] = await db
        .select()
        .from(authTokens)
        .where(eq(authTokens.purpose, 'password_reset'));

      expect(row?.consumedAt ?? null).not.toBeNull();
    });

    it('rejects a new password below the minimum', async () => {
      const agent = await register();

      await agent
        .post('/v1/account/password')
        .send({ currentPassword: PASSWORD, newPassword: 'short' })
        .expect(400);
    });

    it('requires a session', async () => {
      await authedAgent(app)
        .post('/v1/account/password')
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(401);
    });
  });

  describe('GET /v1/account/sessions', () => {
    it('lists the caller sessions and marks the current one', async () => {
      const agent = await register();
      await signInAgain();

      const res = await agent.get('/v1/account/sessions').expect(200);
      const list = body<SessionSummary[]>(res);

      expect(list).toHaveLength(2);
      // Marked rather than filtered: without it the user cannot tell which
      // row would cut them off.
      expect(list.filter((row) => row.current)).toHaveLength(1);
    });

    it('never exposes a token hash', async () => {
      const agent = await register();
      const res = await agent.get('/v1/account/sessions').expect(200);

      expect(body<SessionSummary[]>(res)[0]).not.toHaveProperty('tokenHash');
      expect(body<SessionSummary[]>(res)[0]).not.toHaveProperty('token_hash');
    });

    it('does not list another user sessions', async () => {
      const agent = await register();
      await register({
        email: 'other@example.com',
        organizationName: 'Other Co',
      });

      const res = await agent.get('/v1/account/sessions').expect(200);
      expect(body<SessionSummary[]>(res)).toHaveLength(1);
      expect(await db.select().from(sessions)).toHaveLength(2);
    });
  });

  describe('DELETE /v1/account/sessions/:id', () => {
    it('revokes another device belonging to the caller', async () => {
      const agent = await register();
      const other = await signInAgain();

      const list = body<SessionSummary[]>(
        await agent.get('/v1/account/sessions').expect(200),
      );
      const target = list.find((row) => !row.current)!;

      await agent.delete(`/v1/account/sessions/${target.id}`).expect(204);

      expect(await db.select().from(sessions)).toHaveLength(1);
      await other.get('/v1/auth/me').expect(401);
    });

    it('refuses to revoke the current session', async () => {
      const agent = await register();
      const [session] = await db.select().from(sessions);

      // Deleting the row here would leave a live cookie pointing at nothing.
      // Logout exists for this, and it clears the cookie in the right order.
      await agent.delete(`/v1/account/sessions/${session.id}`).expect(400);

      expect(await db.select().from(sessions)).toHaveLength(1);
    });

    it('cannot revoke a session belonging to someone else', async () => {
      const attacker = await register();
      await register({
        email: 'victim@example.com',
        organizationName: 'Victim Co',
      });

      const [victimSession] = await db
        .select()
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(users.email, 'victim@example.com'));

      // Ownership is part of the WHERE, not a separate SELECT — and a miss
      // answers 404 rather than 403, so "no such session" and "not yours" are
      // indistinguishable.
      await attacker
        .delete(`/v1/account/sessions/${victimSession.sessions.id}`)
        .expect(404);

      expect(await db.select().from(sessions)).toHaveLength(2);
    });

    it('rejects a malformed id before it reaches a query', async () => {
      const agent = await register();
      await agent.delete('/v1/account/sessions/not-a-uuid').expect(400);
    });
  });
});
