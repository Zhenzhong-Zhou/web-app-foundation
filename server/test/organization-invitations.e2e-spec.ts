import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { Response } from 'supertest';

import type { Locale } from '../src/common/locales';
import { todayIn } from '../src/common/today';
import type { Env } from '../src/config/env';
import { AccountDeletionService } from '../src/core/auth/account-deletion.service';
import { PasswordService } from '../src/core/auth/password.service';
import { InvitationsSweepService } from '../src/core/invitations/invitations-sweep.service';
import {
  issueOrganizationInvitation,
  listOrganizationInvitations,
  lockAddress,
  OrganizationInvitationRefused,
  organizationLinkEnd,
  revokeOrganizationInvitation,
} from '../src/core/invitations/organization-invitations';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  accountEvents,
  auditLog,
  authTokens,
  membershipRoles,
  memberships,
  organizationInvitations,
  organizations,
  roles,
  users,
} from '../src/database/schema';
import {
  body,
  createE2eApp,
  insertMember,
  PASSWORD,
  registerOrganization,
  roleIdNamed,
} from './utils/fixtures';
import { expectMailBrand } from './utils/mail-brand';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

const DAY = 24 * 60 * 60 * 1000;
const CHEN = 'chen.jie@harbourherbs.example';
const OPS = 'ops@example.com';

interface Read {
  invitation: unknown;
  organizationInvitation: {
    email: string;
    organizationName: string;
    role: { name: string; description: string | null };
    lastDay: string;
    hasAccount: boolean;
    locale: string;
  } | null;
}

interface Refusal {
  message: string;
  code?: string;
  details?: { day?: string };
}

interface Accepted {
  user: { id: string; emailVerified: boolean; organizationId: string };
}

interface Me {
  user: { email: string };
  organization: { id: string; name: string } | null;
}

/**
 * Organization invitations (ADR-078): the operator's offer to one address
 * to start one named organization, as its Owner. Issued by the plain
 * functions the command runs; read and accepted at ADR-077's routes.
 */
describe('Organization invitations (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let mail: RecordingMailService;
  let clientUrl: string;
  const originalOperator = process.env.OPERATOR_EMAIL;

  beforeAll(async () => {
    mail = new RecordingMailService();
    app = await createE2eApp(mail);
    db = app.get<Database>(UNSAFE_GLOBAL_DB);
    clientUrl = app
      .get<ConfigService<Env, true>>(ConfigService)
      .get('CLIENT_URL', { infer: true });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    mail.reset();
  });

  afterEach(() => {
    if (originalOperator === undefined) delete process.env.OPERATOR_EMAIL;
    else process.env.OPERATOR_EMAIL = originalOperator;
    vi.restoreAllMocks();
  });

  function invite(
    email = CHEN,
    organizationName = 'Harbour Herbs',
    locale: Locale = 'en',
  ) {
    return issueOrganizationInvitation(
      db,
      { email, organizationName, locale },
      clientUrl,
    );
  }

  async function read(token: string): Promise<Read> {
    return body<Read>(
      await authedAgent(app)
        .post('/v1/invitations/read')
        .send({ token })
        .expect(200),
    );
  }

  function acceptNew(
    token: string,
    agent = authedAgent(app),
    extra: Record<string, unknown> = {},
  ) {
    return agent.post('/v1/invitations/accept').send({
      token,
      name: 'Chen Jie',
      password: PASSWORD,
      timeZone: 'Asia/Shanghai',
      ...extra,
    });
  }

  /** An account that belongs to no organization, signed in. */
  async function noOrganization(email: string, name = 'Tom Reid') {
    const [user] = await db
      .insert(users)
      .values({
        email,
        name,
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

  async function roleOf(userId: string, organizationId: string) {
    const [row] = await db
      .select({ name: roles.name })
      .from(memberships)
      .innerJoin(
        membershipRoles,
        eq(membershipRoles.membershipId, memberships.id),
      )
      .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.organizationId, organizationId),
        ),
      );
    return row?.name;
  }

  /** Until a request waits on an advisory lock, as acceptance does on the address. */
  async function untilWaitingOnALock(): Promise<void> {
    for (let tries = 0; tries < 200; tries += 1) {
      const { rows } = await db.execute<{ waiting: boolean }>(
        sql`select exists (select 1 from pg_locks where locktype = 'advisory' and not granted) as waiting`,
      );
      if (rows[0]?.waiting) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Nothing waited on the address.');
  }

  async function actionsOf(userId: string): Promise<string[]> {
    const rows = await db
      .select({ action: accountEvents.action })
      .from(accountEvents)
      .where(eq(accountEvents.userId, userId));
    return rows.map((row) => row.action);
  }

  describe('issuing', () => {
    it('makes a link to the invitation page, its last day seven days on in UTC', async () => {
      const issued = await invite();

      expect(issued.link).toBe(`${clientUrl}/invitation?token=${issued.token}`);
      expect(issued.lastDay).toBe(organizationLinkEnd().lastDay);
      expect(issued.replaced).toBe(false);
      // Nothing is emailed: the operator sends the link.
      expect(mail.sent).toHaveLength(0);
    });

    it('replaces the waiting invitation: one row, the old link ended', async () => {
      const first = await invite();
      const second = await invite(CHEN, 'Harbour Herbs Ltd.', 'zh-Hans');

      expect(second.replaced).toBe(true);
      expect(await db.select().from(organizationInvitations)).toHaveLength(1);
      expect((await read(first.token)).organizationInvitation).toBeNull();
      const now = (await read(second.token)).organizationInvitation;
      expect(now?.organizationName).toBe('Harbour Herbs Ltd.');
      expect(now?.locale).toBe('zh-Hans');
    });

    it('refuses an address whose account belongs to an organization', async () => {
      const busy = await registerOrganization(app, 'busy');

      await expect(invite(busy.email)).rejects.toBeInstanceOf(
        OrganizationInvitationRefused,
      );
      expect(await db.select().from(organizationInvitations)).toHaveLength(0);
    });

    it('revokes the waiting invitation, whose link then reads as ended', async () => {
      const issued = await invite();

      expect(await revokeOrganizationInvitation(db, CHEN)).toBe(true);
      expect(await revokeOrganizationInvitation(db, CHEN)).toBe(false);
      expect((await read(issued.token)).organizationInvitation).toBeNull();
      const refused = await acceptNew(issued.token).expect(400);
      expect(body<Refusal>(refused).code).toBe('invitation_ended');
    });

    it('lists those waiting, those ended unaccepted, and those accepted', async () => {
      await invite('waiting@example.com', 'Waiting Co');
      await invite('ended@example.com', 'Ended Co');
      await db
        .update(organizationInvitations)
        .set({ expiresAt: new Date(Date.now() - DAY) })
        .where(eq(organizationInvitations.email, 'ended@example.com'));
      const accepted = await invite('accepted@example.com', 'Accepted Co');
      await acceptNew(accepted.token).expect(200);

      const listed = await listOrganizationInvitations(db);

      expect(listed.waiting.map((row) => row.email)).toEqual([
        'waiting@example.com',
      ]);
      expect(listed.ended.map((row) => row.email)).toEqual([
        'ended@example.com',
      ]);
      expect(listed.accepted).toEqual([
        {
          email: 'accepted@example.com',
          organizationName: 'Accepted Co',
          day: todayIn('UTC'),
        },
      ]);
    });
  });

  describe('reading', () => {
    it('reads as an organization invitation, the Owner in words, nothing spent', async () => {
      const issued = await invite();

      const first = await read(issued.token);
      expect(first.invitation).toBeNull();
      expect(first.organizationInvitation).toEqual({
        email: CHEN,
        organizationName: 'Harbour Herbs',
        role: {
          name: 'Owner',
          description:
            'Everything, including costs, issuing invoices, settings and closing the organization.',
        },
        lastDay: issued.lastDay,
        hasAccount: false,
        locale: 'en',
      });
      // A mail scanner's fetch burns nothing.
      expect((await read(issued.token)).organizationInvitation).not.toBeNull();
    });

    it('reads a link nobody issued as nothing at all', async () => {
      const nothing = await read('x'.repeat(43));
      expect(nothing).toEqual({
        invitation: null,
        organizationInvitation: null,
      });
    });
  });

  describe('accepting with no account', () => {
    it('makes the account, the organization and its Owner, signed in and unconfirmed', async () => {
      const issued = await invite();
      const agent = authedAgent(app);

      const accepted = body<Accepted>(
        await acceptNew(issued.token, agent).expect(200),
      ).user;

      expect(accepted.emailVerified).toBe(false);
      const me = body<Me>(await agent.get('/v1/auth/me').expect(200));
      expect(me.user.email).toBe(CHEN);
      expect(me.organization?.name).toBe('Harbour Herbs');
      expect(me.organization?.id).toBe(accepted.organizationId);
      expect(await roleOf(accepted.id, accepted.organizationId)).toBe('Owner');

      const [organization] = await db
        .select({ timeZone: organizations.timeZone })
        .from(organizations)
        .where(eq(organizations.id, accepted.organizationId));
      expect(organization.timeZone).toBe('Asia/Shanghai');

      const [row] = await db.select().from(organizationInvitations);
      expect(row.acceptedAt).not.toBeNull();
      expect(row.startedOrganizationId).toBe(accepted.organizationId);

      // A printed link proves no inbox: the usual verification email.
      expect(mail.lastTo(CHEN)?.subject).toBe('Confirm your email address');
      expect(await actionsOf(accepted.id)).toContain('account.registered');
    });

    it('spends the link: a second accept is refused as ended', async () => {
      const issued = await invite();
      await acceptNew(issued.token).expect(200);

      const again = await acceptNew(issued.token).expect(400);
      expect(body<Refusal>(again).code).toBe('invitation_ended');
      expect(await read(issued.token)).toEqual({
        invitation: null,
        organizationInvitation: null,
      });
    });

    it('refuses a link past its end, reading and accepting alike', async () => {
      const issued = await invite();
      const past = new Date(Date.now() - 1000);
      await db
        .update(authTokens)
        .set({ expiresAt: past })
        .where(isNotNull(authTokens.organizationInvitationId));
      await db.update(organizationInvitations).set({ expiresAt: past });

      expect(await read(issued.token)).toEqual({
        invitation: null,
        organizationInvitation: null,
      });
      const refused = await acceptNew(issued.token).expect(400);
      expect(body<Refusal>(refused).code).toBe('invitation_ended');
      expect(await db.select().from(organizations)).toHaveLength(0);
    });

    it("gives the account the page's language, else the invitation's", async () => {
      const chosen = await invite('chosen@example.com', 'Chosen Co', 'zh-Hans');
      const left = await invite('left@example.com', 'Left Co', 'zh-Hans');

      const fromPage = body<Accepted>(
        await acceptNew(chosen.token, authedAgent(app), {
          locale: 'fr-CA',
        }).expect(200),
      ).user;
      const fromInvitation = body<Accepted>(
        await acceptNew(left.token).expect(200),
      ).user;

      const localeOf = async (id: string) =>
        (
          await db
            .select({ locale: users.locale })
            .from(users)
            .where(eq(users.id, id))
        )[0]?.locale;
      expect(await localeOf(fromPage.id)).toBe('fr-CA');
      expect(await localeOf(fromInvitation.id)).toBe('zh-Hans');
    });

    it('waits while the command holds the address, and is ended by its revoke', async () => {
      const issued = await invite();

      const { accepting } = await db.transaction(async (tx) => {
        await lockAddress(tx, CHEN);
        const accepting: Promise<Response> = acceptNew(issued.token).then(
          (res) => res,
        );
        await untilWaitingOnALock();
        // What the command's revoke writes, while the acceptance waits.
        await tx.update(organizationInvitations).set({ revokedAt: new Date() });
        await tx
          .delete(authTokens)
          .where(isNotNull(authTokens.organizationInvitationId));
        return { accepting };
      });

      const refused = await accepting;
      expect(refused.status).toBe(400);
      expect(body<Refusal>(refused).code).toBe('invitation_ended');
      expect(await db.select().from(organizations)).toHaveLength(0);
      expect(await db.select().from(users)).toHaveLength(0);
    });

    it('sends an address that has an account to sign in first', async () => {
      const issued = await invite();
      await db.insert(users).values({
        email: CHEN,
        name: 'Chen Jie',
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
      });

      expect(
        (await read(issued.token)).organizationInvitation?.hasAccount,
      ).toBe(true);
      await acceptNew(issued.token).expect(409);
      expect(await db.select().from(organizations)).toHaveLength(0);
    });
  });

  describe('accepting signed in', () => {
    it('starts the organization for an account with none, as its Owner', async () => {
      const tom = await noOrganization('tom.reid@example.com');
      const issued = await invite('tom.reid@example.com', 'Reid Supply Co.');

      const accepted = body<Accepted>(
        await tom.agent
          .post('/v1/invitations/accept')
          .send({ token: issued.token, timeZone: 'America/Toronto' })
          .expect(200),
      ).user;

      const me = body<Me>(await tom.agent.get('/v1/auth/me').expect(200));
      expect(me.organization?.name).toBe('Reid Supply Co.');
      expect(await roleOf(tom.id, accepted.organizationId)).toBe('Owner');
      expect(await actionsOf(tom.id)).toContain('account.organization_started');
    });

    it('refuses another address, saying whose it is', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const issued = await invite();

      const refused = await alpha.agent
        .post('/v1/invitations/accept')
        .send({ token: issued.token })
        .expect(403);
      expect(body<Refusal>(refused).message).toContain(CHEN);
    });

    it('refuses an account that joined an organization after it was invited', async () => {
      const tom = await noOrganization('tom.reid@example.com');
      const issued = await invite('tom.reid@example.com', 'Reid Supply Co.');
      const other = await registerOrganization(app, 'other');
      await insertMember(app, {
        userId: tom.id,
        organizationId: other.organizationId,
        roleId: await roleIdNamed(app, other.organizationId, 'Viewer'),
      });

      await tom.agent
        .post('/v1/invitations/accept')
        .send({ token: issued.token })
        .expect(409);
      expect(await db.select().from(organizations)).toHaveLength(1);
    });

    it('refuses an account set to be deleted, with its day, the link kept', async () => {
      const tom = await noOrganization('tom.reid@example.com');
      await db
        .update(users)
        .set({ deletionScheduledAt: '2026-11-18' })
        .where(eq(users.id, tom.id));
      const issued = await invite('tom.reid@example.com', 'Reid Supply Co.');

      const refused = body<Refusal>(
        await tom.agent
          .post('/v1/invitations/accept')
          .send({ token: issued.token })
          .expect(409),
      );
      expect(refused.code).toBe('account_deletion_scheduled');
      expect(refused.details?.day).toBe('2026-11-18');
      expect((await read(issued.token)).organizationInvitation).not.toBeNull();
    });
  });

  describe('what is kept', () => {
    it("starts the new organization's audit log empty, either way", async () => {
      const issued = await invite();
      const made = body<Accepted>(
        await acceptNew(issued.token).expect(200),
      ).user;
      const tom = await noOrganization('tom.reid@example.com');
      const second = await invite('tom.reid@example.com', 'Reid Supply Co.');
      const started = body<Accepted>(
        await tom.agent
          .post('/v1/invitations/accept')
          .send({ token: second.token })
          .expect(200),
      ).user;

      for (const organizationId of [
        made.organizationId,
        started.organizationId,
      ]) {
        expect(
          await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.organizationId, organizationId)),
        ).toEqual([]);
      }
    });

    it('keeps no address once the Owner who accepted is erased', async () => {
      const issued = await invite();
      const owner = body<Accepted>(
        await acceptNew(issued.token).expect(200),
      ).user;
      // A second Owner, so the organization outlives the first's account.
      const [second] = await db
        .insert(users)
        .values({ email: 'second@example.com', name: 'Second Owner' })
        .returning({ id: users.id });
      await insertMember(app, {
        userId: second.id,
        organizationId: owner.organizationId,
        roleId: await roleIdNamed(app, owner.organizationId, 'Owner'),
      });
      await db
        .update(users)
        .set({
          deletionScheduledAt: todayIn('UTC', new Date(Date.now() - 2 * DAY)),
        })
        .where(eq(users.id, owner.id));

      expect(await app.get(AccountDeletionService).completeDue()).toEqual({
        completed: 1,
        blocked: 0,
        failed: 0,
      });

      const [row] = await db
        .select({
          email: organizationInvitations.email,
          startedOrganizationId: organizationInvitations.startedOrganizationId,
        })
        .from(organizationInvitations);
      expect(row).toEqual({
        email: `deleted-${owner.id}@invalid`,
        startedOrganizationId: owner.organizationId,
      });
    });
  });

  describe('the operator', () => {
    it('hears of an acceptance when OPERATOR_EMAIL is set', async () => {
      process.env.OPERATOR_EMAIL = OPS;
      const issued = await invite();

      await acceptNew(issued.token).expect(200);

      const told = mail.lastTo(OPS);
      expect(told?.subject).toBe('Harbour Herbs was set up');
      expect(told?.text).toContain(`Chen Jie (${CHEN})`);
      expectMailBrand(app, told);
    });

    it('hears nothing when it is unset', async () => {
      delete process.env.OPERATOR_EMAIL;
      const issued = await invite();

      await acceptNew(issued.token).expect(200);

      expect(mail.sent.map((sent) => sent.to)).toEqual([CHEN]);
    });

    it('a send that fails changes nothing: the organization stands', async () => {
      process.env.OPERATOR_EMAIL = OPS;
      const send = mail.send.bind(mail) as RecordingMailService['send'];
      vi.spyOn(mail, 'send').mockImplementation((sent) =>
        sent.to === OPS ? Promise.reject(new Error('mail down')) : send(sent),
      );
      const issued = await invite();

      await acceptNew(issued.token).expect(200);

      expect(await db.select().from(organizations)).toHaveLength(1);
    });
  });

  describe('the sweep', () => {
    it('clears those unaccepted 30 days on, and keeps an accepted one', async () => {
      await invite('old@example.com', 'Old Co');
      await db
        .update(organizationInvitations)
        .set({ expiresAt: new Date(Date.now() - 31 * DAY) })
        .where(eq(organizationInvitations.email, 'old@example.com'));
      const kept = await invite('kept@example.com', 'Kept Co');
      await acceptNew(kept.token).expect(200);
      await db
        .update(organizationInvitations)
        .set({ expiresAt: new Date(Date.now() - 31 * DAY) })
        .where(eq(organizationInvitations.email, 'kept@example.com'));

      await app.get(InvitationsSweepService).sweep();

      const left = await db
        .select({ email: organizationInvitations.email })
        .from(organizationInvitations);
      expect(left).toEqual([{ email: 'kept@example.com' }]);
    });

    it('clears one revoked 30 days ago, and keeps one revoked since', async () => {
      await invite('old@example.com', 'Old Co');
      await revokeOrganizationInvitation(
        db,
        'old@example.com',
        new Date(Date.now() - 31 * DAY),
      );
      await invite('recent@example.com', 'Recent Co');
      await revokeOrganizationInvitation(db, 'recent@example.com');

      await app.get(InvitationsSweepService).sweep();

      const left = await db
        .select({ email: organizationInvitations.email })
        .from(organizationInvitations);
      expect(left).toEqual([{ email: 'recent@example.com' }]);
    });
  });
});
