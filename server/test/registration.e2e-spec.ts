import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { PasswordService } from '../src/core/auth/password.service';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  accountEvents,
  membershipRoles,
  memberships,
  organizations,
  roles,
  users,
} from '../src/database/schema';
import {
  body,
  createE2eApp,
  PASSWORD,
  registerOrganization,
} from './utils/fixtures';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface Refusal {
  message: string;
  code?: string;
  details?: { day?: string };
}

interface Started {
  user: { id: string; organizationId: string };
}

interface Me {
  organization: { id: string; name: string } | null;
}

/**
 * Registration (ADR-078): REGISTRATION decides whether a person may create
 * an organization themselves, from the sign-up form or, with an account
 * and no organization, from Home. Read per request, so these tests switch
 * it without rebuilding the app; unset in a test run, it is open.
 */
describe('Registration (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  const original = process.env.REGISTRATION;

  const registration = {
    email: 'new@example.com',
    password: PASSWORD,
    name: 'New',
    organizationName: 'New Co',
  };

  beforeAll(async () => {
    app = await createE2eApp(new RecordingMailService());
    db = app.get<Database>(UNSAFE_GLOBAL_DB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterEach(() => {
    if (original === undefined) delete process.env.REGISTRATION;
    else process.env.REGISTRATION = original;
  });

  /** An account that belongs to no organization, signed in. */
  async function noOrganization(email = 'tom.reid@example.com') {
    const [user] = await db
      .insert(users)
      .values({
        email,
        name: 'Tom Reid',
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
      })
      .returning({ id: users.id });
    const agent = authedAgent(app);
    await agent
      .post('/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { agent, id: user.id };
  }

  describe('the setting', () => {
    it('is open in a test run when unset, and says so to the signed-out pages', async () => {
      delete process.env.REGISTRATION;

      const res = await authedAgent(app)
        .get('/v1/auth/registration')
        .expect(200);
      expect(res.body).toEqual({ registration: 'open' });
    });

    it('says by invitation when set so', async () => {
      process.env.REGISTRATION = 'invitation';

      const res = await authedAgent(app)
        .get('/v1/auth/registration')
        .expect(200);
      expect(res.body).toEqual({ registration: 'invitation' });
    });
  });

  describe('the sign-up form, by invitation', () => {
    it('is refused with its code, and nothing is made', async () => {
      process.env.REGISTRATION = 'invitation';

      const refused = await authedAgent(app)
        .post('/v1/auth/register')
        .send(registration)
        .expect(403);

      expect(body<Refusal>(refused).code).toBe('registration_closed');
      expect(await db.select().from(users)).toHaveLength(0);
      expect(await db.select().from(organizations)).toHaveLength(0);
    });

    it('is refused before the body is read: an empty one too', async () => {
      process.env.REGISTRATION = 'invitation';

      const refused = await authedAgent(app)
        .post('/v1/auth/register')
        .send({})
        .expect(403);
      expect(body<Refusal>(refused).code).toBe('registration_closed');
    });

    it('never says an address is taken', async () => {
      await registerOrganization(app, 'alpha');
      process.env.REGISTRATION = 'invitation';

      const refused = await authedAgent(app)
        .post('/v1/auth/register')
        .send({ ...registration, email: 'owner@alpha.example.com' })
        .expect(403);
      expect(body<Refusal>(refused).code).toBe('registration_closed');
    });

    it('works again once open', async () => {
      process.env.REGISTRATION = 'open';

      await authedAgent(app)
        .post('/v1/auth/register')
        .send(registration)
        .expect(201);
    });
  });

  describe('Start an organization', () => {
    it('makes one for an account with none, its Owner, in the browser’s zone', async () => {
      process.env.REGISTRATION = 'open';
      const tom = await noOrganization();

      const started = body<Started>(
        await tom.agent
          .post('/v1/organization')
          .send({ name: 'Reid Supply Co.', timeZone: 'America/Toronto' })
          .expect(201),
      ).user;

      const me = body<Me>(await tom.agent.get('/v1/auth/me').expect(200));
      expect(me.organization).toMatchObject({
        id: started.organizationId,
        name: 'Reid Supply Co.',
      });

      const [owner] = await db
        .select({ role: roles.name, timeZone: organizations.timeZone })
        .from(memberships)
        .innerJoin(
          membershipRoles,
          eq(membershipRoles.membershipId, memberships.id),
        )
        .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
        .innerJoin(
          organizations,
          eq(organizations.id, memberships.organizationId),
        )
        .where(eq(memberships.userId, tom.id));
      expect(owner).toEqual({ role: 'Owner', timeZone: 'America/Toronto' });

      const events = await db
        .select({ action: accountEvents.action })
        .from(accountEvents)
        .where(
          and(
            eq(accountEvents.userId, tom.id),
            eq(accountEvents.action, 'account.organization_started'),
          ),
        );
      expect(events).toHaveLength(1);
    });

    it('is refused by invitation, and makes nothing', async () => {
      process.env.REGISTRATION = 'invitation';
      const tom = await noOrganization();

      const refused = await tom.agent
        .post('/v1/organization')
        .send({ name: 'Reid Supply Co.' })
        .expect(403);
      expect(body<Refusal>(refused).code).toBe('registration_closed');
      expect(await db.select().from(organizations)).toHaveLength(0);
    });

    it('is refused for an account that belongs to an organization', async () => {
      process.env.REGISTRATION = 'open';
      const alpha = await registerOrganization(app, 'alpha');

      await alpha.agent
        .post('/v1/organization')
        .send({ name: 'Second Co' })
        .expect(409);
      expect(await db.select().from(organizations)).toHaveLength(1);
    });

    it('is refused for an account set to be deleted, with its day', async () => {
      process.env.REGISTRATION = 'open';
      const tom = await noOrganization();
      await db
        .update(users)
        .set({ deletionScheduledAt: '2026-11-18' })
        .where(eq(users.id, tom.id));

      const refused = body<Refusal>(
        await tom.agent
          .post('/v1/organization')
          .send({ name: 'Reid Supply Co.' })
          .expect(409),
      );
      expect(refused.code).toBe('account_deletion_scheduled');
      expect(refused.details?.day).toBe('2026-11-18');
    });

    it('needs a name, and a session', async () => {
      process.env.REGISTRATION = 'open';
      const tom = await noOrganization();

      await tom.agent.post('/v1/organization').send({ name: '  ' }).expect(400);
      await authedAgent(app)
        .post('/v1/organization')
        .send({ name: 'Anyone Co' })
        .expect(401);
    });
  });
});
