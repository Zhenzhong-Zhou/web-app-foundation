import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { eq, isNull } from 'drizzle-orm';

import * as provisioning from '../src/core/organizations/provision-organization';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  memberships,
  organizations,
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

/**
 * The claims step 3 rests on that a black-box HTTP check cannot make, because
 * each one is about a row rather than a status code.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let mail: RecordingMailService;

  const EMAIL = 'e2e@example.com';
  const PASSWORD = 'correct-horse-battery';

  const registration = {
    email: EMAIL,
    password: PASSWORD,
    name: 'E2E',
    organizationName: 'E2E Co',
  };

  beforeAll(async () => {
    mail = new RecordingMailService();

    // Registration is limited to 5/minute and both suites register on every
    // test. The limit keeps its own coverage in security.e2e-spec.ts.
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

  describe('registration', () => {
    it('creates user, organization, and Owner membership together', async () => {
      await authedAgent(app)
        .post('/v1/auth/register')
        .send(registration)
        .expect(201);

      const [session] = await db.select().from(sessions);

      expect(await db.select().from(users)).toHaveLength(1);
      expect(await db.select().from(organizations)).toHaveLength(1);
      expect(await db.select().from(memberships)).toHaveLength(1);
      // The org is on the session, so the very next request is already scoped.
      expect(session.currentOrgId).not.toBeNull();
    });

    it('leaves no user without a membership', async () => {
      await authedAgent(app)
        .post('/v1/auth/register')
        .send(registration)
        .expect(201);

      // The invariant ADR-004's single transaction exists to hold. A user with
      // no membership has no role, so no permissions, and no way to acquire
      // either — an account that exists and can do nothing.
      const orphans = await db
        .select({ id: users.id })
        .from(users)
        .leftJoin(memberships, eq(memberships.userId, users.id))
        .where(isNull(memberships.id));

      expect(orphans).toHaveLength(0);
    });

    it('rolls back completely when provisioning fails partway', async () => {
      // Injected rather than provoked through the API, because every natural
      // failure mode is already handled: uniqueSlug derives a free slug on
      // collision, and a duplicate email is rejected before anything is
      // written. That the code has no easy way to fail halfway is good — it
      // just means the rollback has to be triggered deliberately.
      //
      // The user row is inserted before provisioning runs, so without one
      // transaction it would survive this failure.
      const spy = jest
        .spyOn(provisioning, 'provisionOrganization')
        .mockRejectedValueOnce(new Error('provisioning failed'));

      await authedAgent(app)
        .post('/v1/auth/register')
        .send(registration)
        .expect(500);

      expect(await db.select().from(users)).toHaveLength(0);
      expect(await db.select().from(organizations)).toHaveLength(0);

      spy.mockRestore();
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await authedAgent(app).post('/v1/auth/register').send(registration);
      await db.delete(sessions);
    });

    it('issues no session row for a wrong password', async () => {
      await authedAgent(app)
        .post('/v1/auth/login')
        .send({ email: EMAIL, password: 'wrong' })
        .expect(401);

      // A 401 that still wrote a row is invisible from outside.
      expect(await db.select().from(sessions)).toHaveLength(0);
    });

    it('issues no session row for an unknown address', async () => {
      await authedAgent(app)
        .post('/v1/auth/login')
        .send({ email: 'nobody@example.com', password: PASSWORD })
        .expect(401);

      expect(await db.select().from(sessions)).toHaveLength(0);
    });

    it('accepts an address in any casing', async () => {
      await authedAgent(app)
        .post('/v1/auth/login')
        .send({ email: EMAIL.toUpperCase(), password: PASSWORD })
        .expect(200);
    });

    it('replaces the session the cookie already carried', async () => {
      const agent = authedAgent(app);

      await agent
        .post('/v1/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
        .expect(200);
      const [first] = await db.select().from(sessions);

      await agent
        .post('/v1/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
        .expect(200);
      const rows = await db.select().from(sessions);

      // Rotation, not accumulation: the old row is gone rather than orphaned
      // in the table with no cookie pointing at it (ADR-011).
      expect(rows).toHaveLength(1);
      expect(rows[0].id).not.toBe(first.id);
    });
  });

  describe('revocation', () => {
    it('logout deletes the row, not just the cookie', async () => {
      const agent = authedAgent(app);
      await agent.post('/v1/auth/register').send(registration).expect(201);

      await agent.post('/v1/auth/logout').expect(204);

      // Clearing the cookie while the row survives leaves a live credential
      // for anyone who captured it. Revocation is deletion (ADR-011).
      expect(await db.select().from(sessions)).toHaveLength(0);
    });

    it('rejects a cookie whose row was deleted', async () => {
      const agent = authedAgent(app);
      await agent.post('/v1/auth/register').send(registration).expect(201);

      // Admin disables a user, or another device signs this one out. The
      // cookie is untouched and still well-formed.
      await db.delete(sessions);

      // Must fail on the next request, not at expiry. This is the whole reason
      // ADR-011 chose server-side sessions over JWT.
      await agent.post('/v1/auth/logout').expect(401);
    });

    it('a second logout is not an error for the client', async () => {
      const agent = authedAgent(app);
      await agent.post('/v1/auth/register').send(registration).expect(201);

      await agent.post('/v1/auth/logout').expect(204);
      // 401, because the session is gone — the point is that it is a clean
      // rejection rather than a 500 from deleting nothing.
      await agent.post('/v1/auth/logout').expect(401);
    });
  });

  describe('csrf', () => {
    it('rejects a state-changing request with no custom header', async () => {
      const agent = authedAgent(app);
      await agent.post('/v1/auth/register').send(registration).expect(201);

      expect(await db.select().from(sessions)).toHaveLength(1);

      // An empty header is what a cross-site request can manage. SessionGuard
      // runs first, so this needs the live session cookie to reach CsrfGuard
      // at all — without it the answer would be 401.
      await agent
        .post('/v1/auth/logout')
        .set('X-Requested-With', '')
        .expect(403);
    });
  });

  describe('GET /v1/auth/me', () => {
    it('returns the caller, their organization, and their permissions', async () => {
      const agent = authedAgent(app);
      await agent.post('/v1/auth/register').send(registration).expect(201);

      const res = await agent.get('/v1/auth/me').expect(200);
      const me = res.body as {
        user: { email: string; emailVerified: boolean };
        organization: { name: string } | null;
        permissions: string[];
      };

      expect(me.user.email).toBe(EMAIL);
      expect(me.user.emailVerified).toBe(false);
      expect(me.organization?.name).toBe('E2E Co');
      // Registration makes you Owner, and Owner is ALL_PERMISSIONS.
      expect(me.permissions).toHaveLength(9);
    });

    it('requires a session', async () => {
      await authedAgent(app).get('/v1/auth/me').expect(401);
    });
  });

  describe('email verification', () => {
    /** Pulls the token out of the link in the message that was just sent. */
    function tokenFrom(html: string): string {
      const match = /token=([\w-]+)/.exec(html);
      if (!match) throw new Error(`No token in: ${html}`);
      return match[1];
    }

    it('sends a verification email on registration', async () => {
      await authedAgent(app)
        .post('/v1/auth/register')
        .send(registration)
        .expect(201);

      // sendVerificationEmail catches everything so a dead SMTP connection
      // cannot cost someone their account — which means a missing table or an
      // unwired provider is invisible without this assertion.
      const sent = mail.lastTo(EMAIL);
      expect(sent).toBeDefined();
      expect(sent?.html).toContain('/verify-email?token=');
    });

    it('verifies the address and spends the token', async () => {
      const agent = authedAgent(app);
      await agent.post('/v1/auth/register').send(registration).expect(201);

      const token = tokenFrom(mail.lastTo(EMAIL)!.html);

      await agent.post('/v1/auth/verify-email').send({ token }).expect(200);

      const [user] = await db.select().from(users);
      expect(user.emailVerifiedAt).not.toBeNull();

      // Single use: the same link clicked twice is spent the second time.
      await agent.post('/v1/auth/verify-email').send({ token }).expect(400);
    });

    it('rejects an unknown token', async () => {
      await authedAgent(app)
        .post('/v1/auth/verify-email')
        .send({ token: 'a'.repeat(43) })
        .expect(400);
    });

    it('resend issues a new token and invalidates the old one', async () => {
      const agent = authedAgent(app);
      await agent.post('/v1/auth/register').send(registration).expect(201);
      const first = tokenFrom(mail.lastTo(EMAIL)!.html);

      await agent.post('/v1/auth/verify-email/resend').expect(202);
      const second = tokenFrom(mail.lastTo(EMAIL)!.html);

      expect(second).not.toBe(first);
      // Two live links are two chances for an attacker, so issuing one spends
      // the outstanding ones.
      await agent
        .post('/v1/auth/verify-email')
        .send({ token: first })
        .expect(400);
      await agent
        .post('/v1/auth/verify-email')
        .send({ token: second })
        .expect(200);
    });
  });

  describe('password reset', () => {
    function tokenFrom(html: string): string {
      const match = /token=([\w-]+)/.exec(html);
      if (!match) throw new Error(`No token in: ${html}`);
      return match[1];
    }

    const NEW_PASSWORD = 'a-completely-different-one';

    it('sends a link for a known address', async () => {
      await authedAgent(app).post('/v1/auth/register').send(registration);
      mail.reset();

      await authedAgent(app)
        .post('/v1/auth/forgot-password')
        .send({ email: EMAIL })
        .expect(202);

      expect(mail.lastTo(EMAIL)?.html).toContain('/reset-password?token=');
    });

    it('answers identically for an unknown address, and sends nothing', async () => {
      await authedAgent(app)
        .post('/v1/auth/forgot-password')
        .send({ email: 'nobody@example.com' })
        .expect(202);

      // The status must match the known-address case exactly, or this is the
      // enumeration oracle login carefully is not.
      expect(mail.sent).toHaveLength(0);
    });

    it('sets the new password and revokes every session', async () => {
      const agent = authedAgent(app);
      await agent.post('/v1/auth/register').send(registration).expect(201);
      mail.reset();

      await agent.post('/v1/auth/forgot-password').send({ email: EMAIL });
      const token = tokenFrom(mail.lastTo(EMAIL)!.html);

      await agent
        .post('/v1/auth/reset-password')
        .send({ token, password: NEW_PASSWORD })
        .expect(204);

      // The likely reason someone is here is that an attacker holds their
      // password. A reset leaving that session live is not a recovery.
      expect(await db.select().from(sessions)).toHaveLength(0);

      await authedAgent(app)
        .post('/v1/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
        .expect(401);

      await authedAgent(app)
        .post('/v1/auth/login')
        .send({ email: EMAIL, password: NEW_PASSWORD })
        .expect(200);
    });

    it('spends the token', async () => {
      const agent = authedAgent(app);
      await agent.post('/v1/auth/register').send(registration).expect(201);
      mail.reset();

      await agent.post('/v1/auth/forgot-password').send({ email: EMAIL });
      const token = tokenFrom(mail.lastTo(EMAIL)!.html);

      await agent
        .post('/v1/auth/reset-password')
        .send({ token, password: NEW_PASSWORD })
        .expect(204);

      await authedAgent(app)
        .post('/v1/auth/reset-password')
        .send({ token, password: 'yet-another-password' })
        .expect(400);
    });
  });
});
