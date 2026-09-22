import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { eq, sql } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { notifications } from '../src/database/schema';
import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './utils/create-test-app';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface Notification {
  id: string;
  userId: string;
  organizationId: string | null;
  type: string;
  title: string;
  body: string | null;
  resourceType: string | null;
  resourceId: string | null;
  readAt: string | null;
}

interface NotificationPage {
  entries: Notification[];
  nextCursor: string | null;
}

interface AccountEvent {
  id: string;
  action: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface RegisterResponse {
  user: { id: string; organizationId: string };
}

/**
 * supertest sends no User-Agent, and recognition is by user agent — without
 * one every sign-in looks unfamiliar and the bell fires on all of them.
 */
const BROWSER = 'KnownBrowser/1.0';
const OTHER_BROWSER = 'SomeOtherBrowser/1.0';

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * The bell (ADR-036).
 *
 * Two things worth the setup cost. Scoping, because this is the one table not
 * behind TenantDb — a mistake here is somebody reading another person's
 * notifications rather than another tenant's rows. And the account
 * notifications, which are emitted from record() rather than by a caller, so
 * nothing at the call sites would reveal a break.
 *
 * The organization emissions are covered where they happen — a production
 * variance in the production spec, a short close in the orders one — because
 * those are about the emitting code rather than about the bell.
 */
describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  // Kept in reach rather than constructed inline: the security emails are
  // asserted on, not just absorbed.
  const mail = new RecordingMailService();

  const PASSWORD = 'correct-horse-battery';

  beforeAll(async () => {
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

  async function registerOrg(slugish: string) {
    const agent = authedAgent(app);

    const res = await agent
      .post('/v1/auth/register')
      .set('User-Agent', BROWSER)
      .send({
        email: `owner@${slugish}.example.com`,
        password: PASSWORD,
        name: 'Owner',
        organizationName: `${slugish} Co`,
      })
      .expect(201);

    return {
      agent,
      email: `owner@${slugish}.example.com`,
      userId: body<RegisterResponse>(res).user.id,
      organizationId: body<RegisterResponse>(res).user.organizationId,
    };
  }

  type Org = Awaited<ReturnType<typeof registerOrg>>;

  /**
   * A sign-in from a browser this account has not used, which is the only
   * thing that produces a notification. Registration is silent by design.
   */
  async function signInFromNewBrowser(org: Org) {
    await org.agent
      .post('/v1/auth/login')
      .set('User-Agent', OTHER_BROWSER)
      .send({ email: org.email, password: PASSWORD })
      .expect(200);
  }

  async function list(org: Org): Promise<NotificationPage> {
    return body<NotificationPage>(
      await org.agent.get('/v1/notifications').expect(200),
    );
  }

  async function unreadCount(org: Org): Promise<number> {
    return body<{ count: number }>(
      await org.agent.get('/v1/notifications/unread-count').expect(200),
    ).count;
  }

  describe('account notifications', () => {
    /**
     * Registration records a session.created so the history has no gap at the
     * account's first moment — but there is nothing to tell somebody about
     * their own registration, and the account has no history to compare
     * against yet (ADR-022).
     */
    it('stays quiet on the sign-in that comes with registering', async () => {
      const alpha = await registerOrg('alpha');

      expect(await unreadCount(alpha)).toBe(0);
    });

    /**
     * Every sign-in being news is how a bell teaches people to ignore it.
     * Registration wrote the first one from this browser, so this is
     * familiar.
     */
    it('stays quiet on a later sign-in from the same browser', async () => {
      const alpha = await registerOrg('alpha');

      await alpha.agent
        .post('/v1/auth/login')
        .set('User-Agent', BROWSER)
        .send({ email: alpha.email, password: PASSWORD })
        .expect(200);

      expect(await unreadCount(alpha)).toBe(0);
    });

    /**
     * The one that matters: a browser this account has not used. Recognition
     * is by user agent, which is weak — two laptops on the same browser
     * version look identical — and errs toward silence rather than toward a
     * missed alert about a genuine intrusion.
     */
    it('tells you about a sign-in from a browser it has not seen', async () => {
      const alpha = await registerOrg('alpha');
      await signInFromNewBrowser(alpha);

      const { entries } = await list(alpha);

      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('account.session_created');

      // No organization: this belongs to a person, and a user may belong to
      // none. That nullable column is why notifications are scoped by
      // recipient rather than by tenant (ADR-036).
      expect(entries[0].organizationId).toBeNull();
      expect(entries[0].readAt).toBeNull();
    });

    it('tells you when your password changes', async () => {
      const alpha = await registerOrg('alpha');

      await alpha.agent
        .post('/v1/account/password')
        .send({ currentPassword: PASSWORD, newPassword: 'a-longer-one-here' })
        .expect(200);

      const { entries } = await list(alpha);
      expect(entries.map((entry) => entry.type)).toContain(
        'account.password_changed',
      );
    });
  });

  /**
   * The same decision on a second channel (ADR-037). The bell arrives where
   * the attacker is; the inbox is the one place they probably are not.
   */
  describe('security emails', () => {
    const SIGN_IN_SUBJECT = 'New sign-in to your account';

    function sentWith(subject: string) {
      return mail.sent.filter((message) => message.subject === subject);
    }

    it('emails a sign-in from a browser it has not seen', async () => {
      const alpha = await registerOrg('alpha');
      await signInFromNewBrowser(alpha);

      const [message] = sentWith(SIGN_IN_SUBJECT);
      expect(message.to).toBe(alpha.email);
    });

    // Same rule as the bell, or the inbox becomes the thing people filter.
    it('does not email a sign-in from a familiar browser', async () => {
      const alpha = await registerOrg('alpha');

      await alpha.agent
        .post('/v1/auth/login')
        .set('User-Agent', BROWSER)
        .send({ email: alpha.email, password: PASSWORD })
        .expect(200);

      expect(sentWith(SIGN_IN_SUBJECT)).toHaveLength(0);
    });

    it('emails a password change', async () => {
      const alpha = await registerOrg('alpha');

      await alpha.agent
        .post('/v1/account/password')
        .send({ currentPassword: PASSWORD, newPassword: 'a-longer-one-here' })
        .expect(200);

      expect(sentWith('Your password was changed')).toHaveLength(1);
    });

    /**
     * A name is typed by whoever created the account, and this email goes out
     * from our own domain — unescaped, it is a phishing link with our sender
     * reputation on it.
     */
    it('escapes the name in the HTML', async () => {
      const alpha = await registerOrg('alpha');

      await alpha.agent
        .patch('/v1/account/profile')
        .send({ name: '<a href="https://evil.example">Verify</a>' })
        .expect(204);

      await signInFromNewBrowser(alpha);

      const [message] = sentWith(SIGN_IN_SUBJECT);
      expect(message.html).not.toContain('evil.example">');
      expect(message.html).toContain('&lt;a href=');
    });

    // Nothing in a security email should do anything when clicked.
    it('carries no token', async () => {
      const alpha = await registerOrg('alpha');
      await signInFromNewBrowser(alpha);

      const [message] = sentWith(SIGN_IN_SUBJECT);
      expect(message.text).not.toContain('token=');
      expect(message.html).not.toContain('token=');
    });
  });

  /**
   * Retention runs on emit, per recipient (ADR-037). Rows are backdated
   * directly — waiting ninety days is not a test.
   */
  describe('retention', () => {
    async function seed(
      userId: string,
      title: string,
      ageDays: number,
      read: boolean,
    ) {
      await db.insert(notifications).values({
        userId,
        type: 'account.session_created',
        title,
        createdAt: sql`now() - make_interval(days => ${ageDays}::int)`,
        readAt: read ? sql`now()` : null,
      });
    }

    async function titles(userId: string) {
      const rows = await db
        .select({ title: notifications.title })
        .from(notifications)
        .where(eq(notifications.userId, userId));

      return rows.map((row) => row.title).sort();
    }

    it('drops old read rows and very old unread ones on the next emit', async () => {
      const alpha = await registerOrg('alpha');

      await seed(alpha.userId, 'old read', 100, true);
      await seed(alpha.userId, 'recent read', 10, true);
      await seed(alpha.userId, 'old unread', 100, false);
      await seed(alpha.userId, 'ancient unread', 400, false);

      await signInFromNewBrowser(alpha);

      // Unread under a year stays: deleting what somebody has not seen is the
      // one way this loses information.
      expect(await titles(alpha.userId)).toEqual([
        'A new sign-in to your account',
        'old unread',
        'recent read',
      ]);
    });

    it('sweeps only the recipient', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      await seed(beta.userId, 'old read', 100, true);

      await signInFromNewBrowser(alpha);

      expect(await titles(beta.userId)).toEqual(['old read']);
    });
  });

  describe('scoping', () => {
    it('does not reach somebody in another organization', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      await signInFromNewBrowser(alpha);
      await signInFromNewBrowser(beta);

      expect((await list(alpha)).entries).toHaveLength(1);
      expect((await list(beta)).entries).toHaveLength(1);
      expect((await list(alpha)).entries[0].userId).toBe(alpha.userId);

      expect(await db.select().from(notifications)).toHaveLength(2);
    });

    /**
     * The most important assertion here. This controller carries no
     * @RequirePermissions anywhere — a notification is addressed to a person,
     * so the session is the whole of the authorization (ADR-036), and
     * SessionGuard is the only thing between a stranger and somebody's
     * notifications.
     */
    it('requires a session', async () => {
      await authedAgent(app).get('/v1/notifications').expect(401);
      await authedAgent(app).get('/v1/notifications/unread-count').expect(401);
      await authedAgent(app).post('/v1/notifications/read-all').expect(401);
    });
  });

  describe('reading', () => {
    it('counts unread, and stops counting one that is read', async () => {
      const alpha = await registerOrg('alpha');
      await signInFromNewBrowser(alpha);

      expect(await unreadCount(alpha)).toBe(1);

      const { entries } = await list(alpha);

      await alpha.agent
        .post(`/v1/notifications/${entries[0].id}/read`)
        .expect(204);

      expect(await unreadCount(alpha)).toBe(0);

      // Still listed: the bell shows recent history, not a queue.
      expect((await list(alpha)).entries).toHaveLength(1);
    });

    it('clears everything in one request', async () => {
      const alpha = await registerOrg('alpha');
      await signInFromNewBrowser(alpha);

      await alpha.agent
        .post('/v1/account/password')
        .send({ currentPassword: PASSWORD, newPassword: 'a-longer-one-here' })
        .expect(200);

      // Loose on purpose: a password change may revoke other sessions and
      // record more than one event, and the count is not the subject here.
      expect(await unreadCount(alpha)).toBeGreaterThan(1);

      await alpha.agent.post('/v1/notifications/read-all').expect(204);

      expect(await unreadCount(alpha)).toBe(0);
    });

    /**
     * Scoped by recipient as well as id. Without that condition any
     * notification in the system could be marked read through somebody else's
     * session — and a 404 rather than a 403, because whether it exists is
     * itself not their business.
     */
    it('will not let one person read another person notification', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      await signInFromNewBrowser(beta);

      const theirs = (await list(beta)).entries[0];

      await alpha.agent.post(`/v1/notifications/${theirs.id}/read`).expect(404);

      const [row] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, theirs.id));
      expect(row.readAt).toBeNull();
    });

    it('marking read twice is harmless', async () => {
      const alpha = await registerOrg('alpha');
      await signInFromNewBrowser(alpha);

      const { entries } = await list(alpha);

      await alpha.agent
        .post(`/v1/notifications/${entries[0].id}/read`)
        .expect(204);
      await alpha.agent
        .post(`/v1/notifications/${entries[0].id}/read`)
        .expect(204);
    });
  });

  /**
   * The history behind the bell. A notification says a sign-in happened; this
   * is where somebody goes next to ask what else has (ADR-022).
   */
  describe('GET /v1/account/events', () => {
    it('lists this account history', async () => {
      const alpha = await registerOrg('alpha');

      const events = body<AccountEvent[]>(
        await alpha.agent.get('/v1/account/events').expect(200),
      );

      /**
       * A distinct action from session.created: registration does create a
       * session, but "the account was opened" and "somebody signed in" are
       * different facts, and a history where both read as "Signed in" cannot
       * say when the account began (ADR-022).
       */
      expect(
        events.filter((event) => event.action === 'account.registered'),
      ).toHaveLength(1);
      expect(events[0].userAgent).toBe(BROWSER);
    });

    it('does not show one account history to another', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      await signInFromNewBrowser(beta);

      const mine = body<AccountEvent[]>(
        await alpha.agent.get('/v1/account/events').expect(200),
      );

      // beta signed in twice, alpha once. Equal counts would mean the filter
      // is not filtering.
      expect(mine).toHaveLength(1);
    });

    it('records a resent verification email', async () => {
      const alpha = await registerOrg('alpha');

      await alpha.agent.post('/v1/auth/verify-email/resend').expect(202);

      const events = body<AccountEvent[]>(
        await alpha.agent.get('/v1/account/events').expect(200),
      );

      expect(
        events.filter(
          (event) => event.action === 'account.verification_resent',
        ),
      ).toHaveLength(1);
    });

    it('requires a session', async () => {
      await authedAgent(app).get('/v1/account/events').expect(401);
    });
  });
});
