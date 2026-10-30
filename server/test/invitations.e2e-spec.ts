import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';

import { addDays, dayIn, todayIn } from '../src/common/today';
import type { Env } from '../src/config/env';
import { AuditService } from '../src/core/audit/audit.service';
import {
  AccountDeletionService,
  deletionDayFor,
} from '../src/core/auth/account-deletion.service';
import { InvitationsSweepService } from '../src/core/invitations/invitations-sweep.service';
import { lastDayOf } from '../src/core/invitations/link-end';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  accountEvents,
  auditLog,
  authTokens,
  invitations,
  memberships,
  organizations,
  roles,
  users,
} from '../src/database/schema';
import french from '../src/i18n/fr-CA.json';
import {
  addMember,
  body,
  createE2eApp,
  invitationToken,
  PASSWORD,
  registerOrganization,
  roleIdNamed,
  roleIdsOf,
} from './utils/fixtures';
import { mailBrandOf } from './utils/mail-brand';
import { RecordingMailService } from './utils/recording-mail';
import { RecordingTracker } from './utils/recording-tracker';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

const DAY = 24 * 60 * 60 * 1000;

interface Invitation {
  id: string;
  email: string;
  roles: { id: string; name: string; builtIn: boolean }[];
  invitedBy: { id: string; name: string };
  invitedAt: string;
  link: { status: string; lastDay: string | null };
}

interface Preview {
  email: string;
  organization: {
    name: string;
    logo: string | null;
    deletionScheduledAt: string | null;
  };
  inviter: { name: string; email: string } | null;
  roles: {
    name: string;
    description: string | null;
    system: string | null;
  }[];
  note: string | null;
  lastDay: string;
  hasAccount: boolean;
  locale: string;
}

interface Refusal {
  message: string;
  code?: string;
  details?: { invitationId?: string; at?: string; day?: string };
}

interface Accepted {
  user: { id: string; emailVerified: boolean; organizationId: string };
}

interface Me {
  user: { email: string };
  organization: { id: string } | null;
}

type Owner = Awaited<ReturnType<typeof registerOrganization>>;

/**
 * Invitations (ADR-077): how a person joins an organization. One
 * invitation, by email or a copied link, for seven days; the person names
 * themselves and chooses their own password; nobody else knows it.
 */
describe('Invitations (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let mail: RecordingMailService;
  let clientUrl: string;

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

  /** An organization whose Owner has verified their address, as inviting needs. */
  async function organization(slugish: string): Promise<Owner> {
    const owner = await registerOrganization(app, slugish);
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, owner.userId));
    return owner;
  }

  async function invite(
    owner: Owner,
    email: string,
    role = 'Viewer',
    extra: { locale?: string; note?: string } = {},
  ): Promise<Invitation> {
    const res = await owner.agent
      .post('/v1/invitations')
      .send({
        email,
        roleIds: [await roleIdNamed(app, owner.organizationId, role)],
        ...extra,
      })
      .expect(201);
    return body<{ invitation: Invitation }>(res).invitation;
  }

  async function read(
    token: string,
    language?: string,
  ): Promise<Preview | null> {
    let request = authedAgent(app).post('/v1/invitations/read');
    if (language) request = request.set('Accept-Language', language);
    const res = await request.send({ token }).expect(200);
    return body<{ invitation: Preview | null }>(res).invitation;
  }

  function acceptNew(token: string, extra: Record<string, unknown> = {}) {
    return authedAgent(app)
      .post('/v1/invitations/accept')
      .send({ token, name: 'Sam Lee', password: PASSWORD, ...extra });
  }

  async function list(owner: Owner): Promise<Invitation[]> {
    return body<Invitation[]>(
      await owner.agent.get('/v1/invitations').expect(200),
    );
  }

  /** A signed-in account that belongs to no organization, having left one. */
  async function leftOne(slugish: string, email: string) {
    const other = await organization(slugish);
    const member = await addMember(app, other, email, 'Viewer');
    await member.delete('/v1/account/membership').expect(204);
    return member;
  }

  /** The day a link ends, in UTC, every test organization's zone. */
  async function lastDayOfInvitation(id: string): Promise<string> {
    const [row] = await db
      .select({ expiresAt: invitations.expiresAt })
      .from(invitations)
      .where(eq(invitations.id, id));
    return lastDayOf('UTC', row.expiresAt);
  }

  describe('inviting', () => {
    it('needs users.create, which a Viewer lacks', async () => {
      const alpha = await organization('alpha');
      const viewer = await addMember(
        app,
        alpha,
        'viewer@alpha.example.com',
        'Viewer',
      );
      const sent = await invite(alpha, 'sam@example.com');

      await viewer.get('/v1/invitations').expect(403);
      await viewer
        .post('/v1/invitations')
        .send({
          email: 'pat@example.com',
          roleIds: [await roleIdNamed(app, alpha.organizationId, 'Viewer')],
        })
        .expect(403);
      await viewer.post(`/v1/invitations/${sent.id}/resend`).expect(403);
      await viewer.post(`/v1/invitations/${sent.id}/link`).expect(403);
      await viewer.delete(`/v1/invitations/${sent.id}`).expect(403);

      // A refused write is not an action: none of the five is recorded.
      const recorded = await db
        .select({ action: auditLog.action })
        .from(auditLog)
        .where(eq(auditLog.organizationId, alpha.organizationId));
      expect(recorded.map((row) => row.action).sort()).toEqual([
        'invitation.accepted',
        'invitation.sent',
        'invitation.sent',
      ]);
    });

    it('makes nobody a member: the address is on Invited, never among the members', async () => {
      const alpha = await organization('alpha');
      const sent = await invite(alpha, 'sam@example.com', 'Admin');

      expect(sent).toEqual({
        id: sent.id,
        email: 'sam@example.com',
        roles: [
          {
            id: await roleIdNamed(app, alpha.organizationId, 'Admin'),
            name: 'Admin',
            builtIn: true,
          },
        ],
        invitedBy: { id: alpha.userId, name: 'Owner' },
        invitedAt: sent.invitedAt,
        link: {
          status: 'emailed',
          lastDay: await lastDayOfInvitation(sent.id),
        },
      });
      expect(await list(alpha)).toEqual([sent]);

      const members = body<{ email: string }[]>(
        await alpha.agent.get('/v1/users').expect(200),
      );
      expect(members.map((member) => member.email)).toEqual([alpha.email]);
      const people = body<{ email: string }[]>(
        await alpha.agent.get('/v1/people').expect(200),
      );
      expect(JSON.stringify(people)).not.toContain('sam@example.com');
    });

    it('ends a link at the end of its seventh day, in the organization’s zone', async () => {
      const alpha = await organization('alpha');
      await db
        .update(organizations)
        .set({ timeZone: 'Asia/Shanghai' })
        .where(eq(organizations.id, alpha.organizationId));
      const today = todayIn('Asia/Shanghai');

      const sent = await invite(alpha, 'sam@example.com');
      const [row] = await db
        .select({ expiresAt: invitations.expiresAt })
        .from(invitations)
        .where(eq(invitations.id, sent.id));
      // Shanghai's midnight after the seventh day, so "until" holds all day.
      expect(row.expiresAt.toISOString()).toBe(
        `${addDays(today, 7)}T16:00:00.000Z`,
      );
      expect(sent.link.lastDay).toBe(addDays(today, 7));
    });

    it('makes one by a link to pass on, with no email at all', async () => {
      const alpha = await organization('alpha');

      const res = await alpha.agent
        .post('/v1/invitations')
        .send({
          email: 'sam@example.com',
          roleIds: [await roleIdNamed(app, alpha.organizationId, 'Viewer')],
          delivery: 'link',
        })
        .expect(201);
      const made = body<{ invitation: Invitation; link: string | null }>(res);
      expect(made.link).toMatch(
        new RegExp(`^${clientUrl}/invitation\\?token=[\\w-]{43}$`),
      );
      expect(made.invitation.link).toEqual({
        status: 'copied',
        lastDay: await lastDayOfInvitation(made.invitation.id),
      });
      expect(mail.lastTo('sam@example.com')).toBeUndefined();
      expect(await read(made.link!.split('token=')[1])).not.toBeNull();

      const [row] = await db
        .select({ action: auditLog.action, payload: auditLog.payload })
        .from(auditLog)
        .where(eq(auditLog.resourceId, made.invitation.id));
      expect(row).toEqual({
        action: 'invitation.link_copied',
        payload: {
          email: 'sam@example.com',
          roleIds: [
            {
              id: await roleIdNamed(app, alpha.organizationId, 'Viewer'),
              label: 'Viewer',
            },
          ],
        },
      });

      // Emailed by default, the link stays with the server.
      const emailed = await alpha.agent
        .post('/v1/invitations')
        .send({
          email: 'pat@example.com',
          roleIds: [await roleIdNamed(app, alpha.organizationId, 'Viewer')],
        })
        .expect(201);
      expect(body<{ link: string | null }>(emailed).link).toBeNull();
    });

    it('lets an Admin invite, though never act on an Owner’s invitation, as on no Owner', async () => {
      const alpha = await organization('alpha');
      const admin = await addMember(
        app,
        alpha,
        'admin@alpha.example.com',
        'Admin',
      );
      await db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.email, 'admin@alpha.example.com'));

      await admin
        .post('/v1/invitations')
        .send({
          email: 'sam@example.com',
          roleIds: [await roleIdNamed(app, alpha.organizationId, 'Viewer')],
        })
        .expect(201);
      await admin
        .post('/v1/invitations')
        .send({
          email: 'pat@example.com',
          roleIds: [await roleIdNamed(app, alpha.organizationId, 'Owner')],
        })
        .expect(403);

      // Nor issue an Owner's invitation again, or revoke it, and is told
      // that, not that it cannot invite.
      const owners = await invite(alpha, 'lee@example.com', 'Owner');
      const refused = await admin
        .post(`/v1/invitations/${owners.id}/resend`)
        .expect(403);
      expect(body<Refusal>(refused).message).toBe(
        'Only an Owner can resend, copy or revoke an invitation to join as Owner',
      );
      await admin.post(`/v1/invitations/${owners.id}/link`).expect(403);
      await admin.delete(`/v1/invitations/${owners.id}`).expect(403);
      expect(await list(alpha)).toHaveLength(2);
    });

    it('refuses a role of another organization', async () => {
      const alpha = await organization('alpha');
      const beta = await organization('beta');

      await alpha.agent
        .post('/v1/invitations')
        .send({
          email: 'sam@example.com',
          roleIds: [await roleIdNamed(app, beta.organizationId, 'Viewer')],
        })
        .expect(400);
    });

    it('refuses an address already a member here, or already invited, offering Resend', async () => {
      const alpha = await organization('alpha');
      const beta = await organization('beta');
      const sent = await invite(alpha, 'sam@example.com');

      const member = await alpha.agent
        .post('/v1/invitations')
        .send({
          email: alpha.email,
          roleIds: [await roleIdNamed(app, alpha.organizationId, 'Viewer')],
        })
        .expect(409);
      expect(body<Refusal>(member).code).toBe('already_a_member');

      const again = await alpha.agent
        .post('/v1/invitations')
        .send({
          email: 'SAM@example.com',
          roleIds: [await roleIdNamed(app, alpha.organizationId, 'Admin')],
        })
        .expect(409);
      expect(body<Refusal>(again)).toMatchObject({
        code: 'already_invited',
        details: { invitationId: sent.id },
      });

      // Another organization is told nothing about either.
      await invite(beta, 'sam@example.com');
      await invite(beta, alpha.email);
    });

    it('says how the earlier invitation stands, never with a last day gone by, and Resend starts it again', async () => {
      const alpha = await organization('alpha');
      const again = async (email: string) =>
        body<Refusal>(
          await alpha.agent
            .post('/v1/invitations')
            .send({
              email,
              roleIds: [await roleIdNamed(app, alpha.organizationId, 'Viewer')],
            })
            .expect(409),
        );

      const ended = await invite(alpha, 'sam@example.com');
      await db
        .update(invitations)
        .set({ expiresAt: new Date(Date.now() - DAY) })
        .where(eq(invitations.id, ended.id));
      expect(await again('sam@example.com')).toMatchObject({
        code: 'already_invited',
        message:
          'That address has already been invited, and its link has ended. Resend the invitation to start it again.',
      });

      vi.spyOn(mail, 'send').mockRejectedValueOnce(new Error('SMTP down'));
      await invite(alpha, 'pat@example.com');
      expect((await again('pat@example.com')).message).toBe(
        'That address has already been invited, but the email did not go. Resend the invitation, or copy its link.',
      );

      const resent = body<{ invitation: Invitation }>(
        await alpha.agent
          .post(`/v1/invitations/${ended.id}/resend`)
          .expect(200),
      ).invitation;
      expect(resent.link.status).toBe('emailed');
      expect((await again('sam@example.com')).message).toBe(
        'That address has already been invited. Resend the invitation instead.',
      );
    });

    it('needs the inviter’s own address verified', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      const res = await alpha.agent
        .post('/v1/invitations')
        .send({
          email: 'sam@example.com',
          roleIds: [await roleIdNamed(app, alpha.organizationId, 'Viewer')],
        })
        .expect(403);
      expect(body<Refusal>(res).code).toBe('email_unverified');
      expect(mail.lastTo('sam@example.com')).toBeUndefined();
    });

    it('invites nobody while the organization is being deleted', async () => {
      const alpha = await organization('alpha');
      const sent = await invite(alpha, 'sam@example.com');
      await alpha.agent
        .post('/v1/organization/deletion')
        .send({
          organizationName: 'alpha Co',
          password: PASSWORD,
          declineExport: true,
        })
        .expect(200);

      await alpha.agent
        .post('/v1/invitations')
        .send({
          email: 'pat@example.com',
          roleIds: [await roleIdNamed(app, alpha.organizationId, 'Viewer')],
        })
        .expect(409);
      await alpha.agent.post(`/v1/invitations/${sent.id}/resend`).expect(409);
      await alpha.agent.post(`/v1/invitations/${sent.id}/link`).expect(409);
    });

    it('issues at most 50 links a day, resends and copies included, and says from when the next can be', async () => {
      const alpha = await organization('alpha');
      // Shanghai, UTC+8 all year, so the message's time is proved to be the
      // organization's, not the server's.
      await db
        .update(organizations)
        .set({ timeZone: 'Asia/Shanghai' })
        .where(eq(organizations.id, alpha.organizationId));
      const first = await invite(alpha, 'person0@example.com');
      const second = await invite(alpha, 'person1@example.com');
      // 46 more of the day's links, written straight to the table, as so
      // many invitations would leave them: spent, and an organization's.
      await db.insert(authTokens).values(
        Array.from({ length: 46 }, (_, n) => ({
          tokenHash: `spent-link-${n}`,
          invitationId: second.id,
          purpose: 'invitation' as const,
          expiresAt: new Date(Date.now() + 7 * DAY),
          consumedAt: new Date(),
        })),
      );
      await alpha.agent.post(`/v1/invitations/${first.id}/resend`).expect(200);
      await alpha.agent.post(`/v1/invitations/${first.id}/link`).expect(200);

      const res = await alpha.agent
        .post('/v1/invitations')
        .send({
          email: 'person50@example.com',
          roleIds: [await roleIdNamed(app, alpha.organizationId, 'Viewer')],
        })
        .expect(409);
      await alpha.agent.post(`/v1/invitations/${first.id}/resend`).expect(409);

      // The oldest of the 50, the first invitation's own link, frees a
      // place 24 hours after it was made.
      const [oldest] = await db
        .select({ createdAt: authTokens.createdAt })
        .from(authTokens)
        .where(eq(authTokens.invitationId, first.id))
        .orderBy(authTokens.createdAt)
        .limit(1);
      const at = new Date(oldest.createdAt.getTime() + DAY);
      const refusal = body<Refusal>(res);
      expect(refusal).toMatchObject({
        code: 'invitations_daily_limit',
        details: { at: at.toISOString() },
      });
      const shanghai = new Date(at.getTime() + 8 * 60 * 60 * 1000);
      expect(refusal.message).toContain(
        `You can invite again from ${shanghai.toISOString().slice(11, 16)}.`,
      );

      // A day on, the oldest has aged out.
      await db
        .update(authTokens)
        .set({ createdAt: new Date(Date.now() - DAY - 60_000) })
        .where(eq(authTokens.invitationId, first.id));
      await invite(alpha, 'person50@example.com');
    });
  });

  describe('the email', () => {
    it('names the inviter by name and address, the organization in words, the role and what it allows, the note escaped and the last day, in the language chosen', async () => {
      const alpha = await organization('alpha');
      const sent = await invite(alpha, 'sam@example.com', 'Admin', {
        locale: 'zh-Hans',
        note: '<b>Dock 3</b>\nbring boots',
      });
      const date = new Intl.DateTimeFormat('zh-Hans', {
        dateStyle: 'long',
        timeZone: 'UTC',
      }).format(new Date(`${sent.link.lastDay}T00:00:00Z`));

      const email = mail.lastTo('sam@example.com')!;
      expect(email.subject).toBe('Owner 邀请您加入 alpha Co');
      expect(email.text).toContain('加入 alpha Co');
      expect(email.text).toContain(
        `Owner（${alpha.email}）邀请您以管理员身份加入。`,
      );
      expect(email.text).toContain(
        '日常工作：库存、订单、生产和起草发票。可以邀请和移除成员。',
      );
      expect(email.text).toContain(
        '来自 Owner 的留言\n<b>Dock 3</b>\nbring boots',
      );
      expect(email.text).toContain(`有效期到${date}结束，`);
      expect(email.text).toContain(`${clientUrl}/invitation?token=`);
      // Signed by the app's name, from MAIL_FROM.
      expect(email.text).toMatch(/由 .+ 代 alpha Co 发送。$/);

      expect(email.html).toContain('&lt;b&gt;Dock 3&lt;/b&gt;<br>bring boots');
      expect(email.html).not.toContain('<b>');
      expect(email.html).not.toContain('<img');
      expect(email.html).not.toContain('data:');
      // The organization's, not the product's: no header (ADR-082).
      const brand = mailBrandOf(app);
      expect(email.html).not.toContain(brand.mark);
      expect(email.text.startsWith(brand.name)).toBe(false);
    });

    it('writes in the inviter’s own language unless another is chosen', async () => {
      const alpha = await organization('alpha');
      await db
        .update(users)
        .set({ locale: 'fr-CA' })
        .where(eq(users.id, alpha.userId));

      await invite(alpha, 'sam@example.com');
      expect(mail.lastTo('sam@example.com')?.subject).toBe(
        'Owner vous invite à vous joindre à alpha Co',
      );

      await invite(alpha, 'pat@example.com', 'Viewer', { locale: 'en' });
      expect(mail.lastTo('pat@example.com')?.subject).toBe(
        'Owner invited you to join alpha Co',
      );
    });

    it('builds the link from CLIENT_URL, never the request’s host', async () => {
      const alpha = await organization('alpha');
      await alpha.agent
        .post('/v1/invitations')
        .set('Host', 'evil.example')
        .set('X-Forwarded-Host', 'evil.example')
        .send({
          email: 'sam@example.com',
          roleIds: [await roleIdNamed(app, alpha.organizationId, 'Viewer')],
        })
        .expect(201);

      const email = mail.lastTo('sam@example.com')!;
      expect(email.text).toContain(`${clientUrl}/invitation?token=`);
      expect(email.text + email.html).not.toContain('evil.example');
    });

    it('keeps an invitation whose email did not go, and says so, on Invited and in the audit log', async () => {
      const alpha = await organization('alpha');
      vi.spyOn(mail, 'send').mockRejectedValueOnce(new Error('SMTP down'));

      const sent = await invite(alpha, 'sam@example.com');
      expect(sent.link).toEqual({ status: 'notSent', lastDay: null });
      expect((await list(alpha))[0].link.status).toBe('notSent');

      // The row stays, since the invitation exists, and reads in words.
      const [row] = await db
        .select({ payload: auditLog.payload })
        .from(auditLog)
        .where(eq(auditLog.action, 'invitation.sent'));
      expect(row.payload).toMatchObject({ emailSent: false });
      const { entries } = body<{
        entries: { details: { field: string; value: { text: string } }[] }[];
      }>(await alpha.agent.get('/v1/audit?action=invitation.sent').expect(200));
      expect(entries[0].details).toContainEqual(
        expect.objectContaining({
          field: 'Email',
          value: { text: 'not sent' },
        }),
      );

      // Its link went to nobody, so nothing is live.
      const live = await db
        .select({ id: authTokens.id })
        .from(authTokens)
        .where(eq(authTokens.invitationId, sent.id));
      expect(live).toHaveLength(1);
      const [token] = await db
        .select({ consumedAt: authTokens.consumedAt })
        .from(authTokens)
        .where(eq(authTokens.invitationId, sent.id));
      expect(token.consumedAt).not.toBeNull();

      // Copy link is the way on.
      const copied = body<{ invitation: Invitation; link: string }>(
        await alpha.agent.post(`/v1/invitations/${sent.id}/link`).expect(200),
      );
      expect(copied.invitation.link.status).toBe('copied');
      expect(await read(copied.link.split('token=')[1])).not.toBeNull();
    });

    describe('one that does not go', () => {
      const faults = new RecordingTracker();
      afterEach(() => faults.stop());

      it('is reported to the error tracker, without the address (ADR-084)', async () => {
        const alpha = await organization('alpha');
        faults.start();
        vi.spyOn(mail, 'send').mockRejectedValueOnce(
          new Error('550 5.1.1 <sam@example.com>: Recipient address rejected'),
        );

        await invite(alpha, 'sam@example.com');

        const sent = await faults.sent();
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({
          tags: {
            side: 'server',
            failed: 'the invitation email',
            organization: alpha.organizationId,
          },
          user: { id: alpha.userId },
          exception: {
            values: [
              { value: '550 5.1.1 <[email]>: Recipient address rejected' },
            ],
          },
        });
      });
    });

    it('names only the organization once the inviter has left, or deleted their account', async () => {
      const alpha = await organization('alpha');
      const viewer = await roleIdNamed(app, alpha.organizationId, 'Viewer');
      const inviters = {
        left: await addMember(app, alpha, 'mei@alpha.example.com', 'Admin'),
        deleted: await addMember(app, alpha, 'jo@alpha.example.com', 'Admin'),
      };
      await db
        .update(users)
        .set({ name: 'Mei Lin' })
        .where(eq(users.email, 'mei@alpha.example.com'));
      const fromMei = body<{ invitation: Invitation }>(
        await inviters.left
          .post('/v1/invitations')
          .send({ email: 'sam@example.com', roleIds: [viewer], note: 'Boots' })
          .expect(201),
      ).invitation;
      const fromJo = body<{ invitation: Invitation }>(
        await inviters.deleted
          .post('/v1/invitations')
          .send({ email: 'pat@example.com', roleIds: [viewer] })
          .expect(201),
      ).invitation;

      // A member still: named, by name and by address, and a reply goes
      // to Mei (ADR-083).
      expect(mail.lastTo('sam@example.com')?.subject).toBe(
        'Mei Lin invited you to join alpha Co',
      );
      expect(mail.lastTo('sam@example.com')?.replyTo).toBe(
        'mei@alpha.example.com',
      );
      expect(
        (await read(invitationToken(app, 'sam@example.com')))?.inviter,
      ).toEqual({ name: 'Mei Lin', email: 'mei@alpha.example.com' });

      // Mei leaves; Jo's account is deleted, its day come and gone.
      await inviters.left.delete('/v1/account/membership').expect(204);
      await inviters.deleted
        .post('/v1/account/deletion')
        .send({ password: PASSWORD })
        .expect(200);
      await db
        .update(users)
        .set({
          deletionScheduledAt: todayIn('UTC', new Date(Date.now() - 2 * DAY)),
        })
        .where(eq(users.email, 'jo@alpha.example.com'));
      expect(await app.get(AccountDeletionService).completeDue()).toMatchObject(
        { completed: 1 },
      );

      for (const { invitation, email } of [
        { invitation: fromMei, email: 'sam@example.com' },
        { invitation: fromJo, email: 'pat@example.com' },
      ]) {
        expect((await read(invitationToken(app, email)))?.inviter).toBeNull();

        await alpha.agent
          .post(`/v1/invitations/${invitation.id}/resend`)
          .expect(200);
        const resent = mail.lastTo(email)!;
        expect(resent.subject).toBe('An invitation to join alpha Co');
        expect(resent.replyTo).toBeUndefined();
        expect(resent.text).toContain(
          'alpha Co invited you to join as a Viewer.',
        );
        const words = resent.text + resent.html;
        for (const gone of ['Mei Lin', 'mei@alpha', 'jo@alpha', 'Deleted']) {
          expect(words).not.toContain(gone);
        }
        expect((await read(invitationToken(app, email)))?.inviter).toBeNull();
      }
      expect(mail.lastTo('sam@example.com')?.text).toContain(
        'From alpha Co\nBoots',
      );
    });
  });

  describe('the link', () => {
    it('reads what the invitation page shows and nothing more, spending nothing', async () => {
      const alpha = await organization('alpha');
      const sent = await invite(alpha, 'sam@example.com', 'Admin', {
        note: 'You will receive deliveries at the North site',
      });
      const token = invitationToken(app, 'sam@example.com');

      const expected: Preview = {
        email: 'sam@example.com',
        organization: {
          name: 'alpha Co',
          logo: null,
          deletionScheduledAt: null,
        },
        inviter: { name: 'Owner', email: alpha.email },
        roles: [
          {
            name: 'Admin',
            description:
              'Day-to-day work: stock, orders, production and drafting invoices. Can invite and remove members.',
            system: 'Admin',
          },
        ],
        note: 'You will receive deliveries at the North site',
        lastDay: sent.link.lastDay!,
        hasAccount: false,
        locale: 'en',
      };
      expect(await read(token)).toEqual(expected);
      expect(await read(token)).toEqual(expected);

      await acceptNew(token).expect(200);
    });

    it('words the role in the page’s language', async () => {
      const alpha = await organization('alpha');
      await invite(alpha, 'sam@example.com', 'Viewer');

      const preview = await read(
        invitationToken(app, 'sam@example.com'),
        'fr-CA',
      );
      expect(preview?.roles).toEqual([
        {
          name: french['audit.value.role.viewer'],
          description: french['roles.description.viewer'],
          system: 'Viewer',
        },
      ]);
    });

    it('says whether the address has an account', async () => {
      const alpha = await organization('alpha');
      await leftOne('beta', 'sam@example.com');
      await invite(alpha, 'sam@example.com');

      expect(
        (await read(invitationToken(app, 'sam@example.com')))?.hasAccount,
      ).toBe(true);
    });

    it('carries the logo inline and small, for a page that shows it at 32 px', async () => {
      const alpha = await organization('alpha');
      const upload = await sharp({
        create: { width: 800, height: 400, channels: 3, background: '#2a6' },
      })
        .png()
        .toBuffer();
      const logo = body<{ file: { id: string } }>(
        await alpha.agent
          .post('/v1/files/logo')
          .attach('file', upload, 'logo.png')
          .expect(201),
      ).file.id;
      await alpha.agent
        .patch('/v1/organization')
        .send({ logoFileId: logo })
        .expect(204);
      await invite(alpha, 'sam@example.com');

      const preview = await read(invitationToken(app, 'sam@example.com'));
      const [kind, data] = preview!.organization.logo!.split(',');
      expect(kind).toBe('data:image/png;base64');
      const { format, width, height } = await sharp(
        Buffer.from(data, 'base64'),
      ).metadata();
      expect({ format, width, height }).toEqual({
        format: 'png',
        width: 128,
        height: 64,
      });
    });

    it('reads a link used, expired, revoked or never issued as ended, all alike', async () => {
      const alpha = await organization('alpha');

      await invite(alpha, 'used@example.com');
      const used = invitationToken(app, 'used@example.com');
      await acceptNew(used).expect(200);

      const expired = await invite(alpha, 'expired@example.com');
      await db
        .update(authTokens)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(authTokens.invitationId, expired.id));

      const revoked = await invite(alpha, 'revoked@example.com');
      await alpha.agent.delete(`/v1/invitations/${revoked.id}`).expect(204);

      for (const token of [
        used,
        invitationToken(app, 'expired@example.com'),
        invitationToken(app, 'revoked@example.com'),
        'a-token-nobody-was-ever-sent-0000000000000',
      ]) {
        expect(await read(token)).toBeNull();
        const res = await acceptNew(token).expect(400);
        expect(body<Refusal>(res)).toMatchObject({
          code: 'invitation_ended',
          message:
            'This invitation has ended. Ask whoever invited you for a new one.',
        });
      }
    });

    it('copies a link built from CLIENT_URL, spending the emailed one', async () => {
      const alpha = await organization('alpha');
      const sent = await invite(alpha, 'sam@example.com');
      const emailed = invitationToken(app, 'sam@example.com');

      const copied = body<{ invitation: Invitation; link: string }>(
        await alpha.agent
          .post(`/v1/invitations/${sent.id}/link`)
          .set('Host', 'evil.example')
          .expect(200),
      );
      expect(copied.link).toMatch(
        new RegExp(`^${clientUrl}/invitation\\?token=[\\w-]{43}$`),
      );
      expect(copied.invitation.link).toEqual({
        status: 'copied',
        lastDay: await lastDayOfInvitation(sent.id),
      });
      expect(await read(emailed)).toBeNull();
      expect(await read(copied.link.split('token=')[1])).not.toBeNull();
      // Copied, not emailed: nothing more went to the address.
      expect(mail.sent.filter((m) => m.to === 'sam@example.com')).toHaveLength(
        1,
      );
    });

    it('resends an ended invitation with a fresh link and seven days again', async () => {
      const alpha = await organization('alpha');
      const sent = await invite(alpha, 'sam@example.com');
      const first = invitationToken(app, 'sam@example.com');
      const ago = new Date(Date.now() - DAY);
      await db
        .update(invitations)
        .set({ expiresAt: ago })
        .where(eq(invitations.id, sent.id));
      await db
        .update(authTokens)
        .set({ expiresAt: ago })
        .where(eq(authTokens.invitationId, sent.id));
      expect((await list(alpha))[0].link).toEqual({
        status: 'ended',
        lastDay: lastDayOf('UTC', ago),
      });

      const resent = body<{ invitation: Invitation }>(
        await alpha.agent.post(`/v1/invitations/${sent.id}/resend`).expect(200),
      ).invitation;
      expect(resent.link).toEqual({
        status: 'emailed',
        lastDay: await lastDayOfInvitation(sent.id),
      });
      expect(
        resent.link.lastDay! > dayIn('UTC', new Date(Date.now() + 6 * DAY)),
      ).toBe(true);

      // Written as the first was: a reply goes to the inviter (ADR-083).
      expect(mail.lastTo('sam@example.com')?.replyTo).toBe(alpha.email);

      const second = invitationToken(app, 'sam@example.com');
      expect(second).not.toBe(first);
      expect(await read(first)).toBeNull();
      expect(await read(second)).not.toBeNull();
    });

    it('copies a link for an ended invitation, with seven days again', async () => {
      const alpha = await organization('alpha');
      const sent = await invite(alpha, 'sam@example.com');
      const ago = new Date(Date.now() - DAY);
      await db
        .update(invitations)
        .set({ expiresAt: ago })
        .where(eq(invitations.id, sent.id));
      await db
        .update(authTokens)
        .set({ expiresAt: ago })
        .where(eq(authTokens.invitationId, sent.id));

      const copied = body<{ invitation: Invitation; link: string }>(
        await alpha.agent.post(`/v1/invitations/${sent.id}/link`).expect(200),
      );
      expect(copied.invitation.link).toEqual({
        status: 'copied',
        lastDay: await lastDayOfInvitation(sent.id),
      });
      expect(
        copied.invitation.link.lastDay! >
          dayIn('UTC', new Date(Date.now() + 6 * DAY)),
      ).toBe(true);
      expect(await read(copied.link.split('token=')[1])).not.toBeNull();
    });

    it('revokes: the link ends, the invitation leaves Invited, and the address may be invited again', async () => {
      const alpha = await organization('alpha');
      const sent = await invite(alpha, 'sam@example.com');
      const token = invitationToken(app, 'sam@example.com');

      await alpha.agent.delete(`/v1/invitations/${sent.id}`).expect(204);
      expect(await read(token)).toBeNull();
      expect(await list(alpha)).toEqual([]);
      await alpha.agent.post(`/v1/invitations/${sent.id}/resend`).expect(404);
      await alpha.agent.delete(`/v1/invitations/${sent.id}`).expect(404);

      await invite(alpha, 'sam@example.com');
    });

    it('keeps another organization’s invitations out of reach', async () => {
      const alpha = await organization('alpha');
      const beta = await organization('beta');
      const sent = await invite(alpha, 'sam@example.com');

      expect(await list(beta)).toEqual([]);
      await beta.agent.post(`/v1/invitations/${sent.id}/resend`).expect(404);
      await beta.agent.post(`/v1/invitations/${sent.id}/link`).expect(404);
      await beta.agent.delete(`/v1/invitations/${sent.id}`).expect(404);
    });
  });

  describe('accepting', () => {
    it('with no account: the person names themselves, chooses the password, and is signed in as a member', async () => {
      const alpha = await organization('alpha');
      await invite(alpha, 'sam@example.com', 'Admin');
      const agent = authedAgent(app);

      const res = await agent
        .post('/v1/invitations/accept')
        .send({
          token: invitationToken(app, 'sam@example.com'),
          name: 'Sam Lee',
          password: 'a-password-only-sam-knows',
        })
        .expect(200);
      const { user } = body<Accepted>(res);
      expect(user).toMatchObject({
        emailVerified: true,
        organizationId: alpha.organizationId,
      });
      // Kept signed in, as sign-in is by default (ADR-065).
      expect(String(res.headers['set-cookie'])).toContain('Expires=');

      const me = body<Me>(await agent.get('/v1/auth/me').expect(200));
      expect(me.organization?.id).toBe(alpha.organizationId);

      const [membership] = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(eq(memberships.userId, user.id));
      expect(await roleIdsOf(app, user.id)).toEqual([
        await roleIdNamed(app, alpha.organizationId, 'Admin'),
      ]);
      const [accepted] = await db
        .select({
          membershipId: invitations.membershipId,
          acceptedAt: invitations.acceptedAt,
        })
        .from(invitations)
        .where(eq(invitations.email, 'sam@example.com'));
      expect(accepted.membershipId).toBe(membership.id);
      expect(accepted.acceptedAt).not.toBeNull();
      expect(await list(alpha)).toEqual([]);

      // Their name, their password, and nobody else's.
      const [account] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, user.id));
      expect(account.name).toBe('Sam Lee');
      await authedAgent(app)
        .post('/v1/auth/login')
        .send({
          email: 'sam@example.com',
          password: 'a-password-only-sam-knows',
        })
        .expect(200);
    });

    it('follows Keep me signed in, and takes the language the page was in', async () => {
      const alpha = await organization('alpha');
      await invite(alpha, 'sam@example.com', 'Viewer', { locale: 'zh-Hans' });
      await invite(alpha, 'pat@example.com', 'Viewer', { locale: 'zh-Hans' });

      // One picked on the page.
      const res = await acceptNew(invitationToken(app, 'sam@example.com'), {
        keepSignedIn: false,
        locale: 'fr-CA',
      }).expect(200);
      expect(String(res.headers['set-cookie'])).not.toContain('Expires=');
      // None picked: the inviter's choice, which the page started in.
      await acceptNew(invitationToken(app, 'pat@example.com')).expect(200);

      const accounts = await db
        .select({ email: users.email, locale: users.locale })
        .from(users)
        .where(inArray(users.email, ['sam@example.com', 'pat@example.com']));
      expect(
        Object.fromEntries(accounts.map((row) => [row.email, row.locale])),
      ).toEqual({ 'sam@example.com': 'fr-CA', 'pat@example.com': 'zh-Hans' });
    });

    it('by a copied link: the address is not verified, and the usual verification email follows', async () => {
      const alpha = await organization('alpha');
      const sent = await invite(alpha, 'sam@example.com');
      const { link } = body<{ link: string }>(
        await alpha.agent.post(`/v1/invitations/${sent.id}/link`).expect(200),
      );

      const res = await acceptNew(link.split('token=')[1]).expect(200);
      expect(body<Accepted>(res).user.emailVerified).toBe(false);
      expect(mail.lastTo('sam@example.com')?.text).toContain(
        '/verify-email?token=',
      );
    });

    it('once: a second Join finds it ended', async () => {
      const alpha = await organization('alpha');
      await invite(alpha, 'sam@example.com');
      const token = invitationToken(app, 'sam@example.com');

      await acceptNew(token).expect(200);
      const again = await acceptNew(token).expect(400);
      expect(body<Refusal>(again).code).toBe('invitation_ended');
      const accounts = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, 'sam@example.com'));
      expect(accounts).toHaveLength(1);
    });

    it('needs a name and a password from someone signed out', async () => {
      const alpha = await organization('alpha');
      await invite(alpha, 'sam@example.com');
      const token = invitationToken(app, 'sam@example.com');

      await authedAgent(app)
        .post('/v1/invitations/accept')
        .send({ token, password: PASSWORD })
        .expect(400);
      await authedAgent(app)
        .post('/v1/invitations/accept')
        .send({ token, name: 'Sam' })
        .expect(400);
      // A name of spaces alone is refused as a field, never as an ended
      // link: the page says what to fix, and the link stays live.
      const blank = await acceptNew(token, { name: '   ' }).expect(400);
      expect(body<Refusal>(blank).code).toBeUndefined();
      expect(await read(token)).not.toBeNull();
    });

    it('refuses to make a second account for an address that has one: they sign in first', async () => {
      const alpha = await organization('alpha');
      await leftOne('beta', 'sam@example.com');
      await invite(alpha, 'sam@example.com');

      await acceptNew(invitationToken(app, 'sam@example.com')).expect(409);
    });

    it('joins an account that belongs to no organization, signed in on the invitation page', async () => {
      const alpha = await organization('alpha');
      await leftOne('beta', 'sam@example.com');
      await invite(alpha, 'sam@example.com', 'Admin');
      const token = invitationToken(app, 'sam@example.com');

      // The page signs in through sign-in itself, then accepts.
      const agent = authedAgent(app);
      await agent
        .post('/v1/auth/login')
        .send({ email: 'sam@example.com', password: PASSWORD })
        .expect(200);
      const res = await agent
        .post('/v1/invitations/accept')
        .send({ token })
        .expect(200);
      expect(body<Accepted>(res).user.organizationId).toBe(
        alpha.organizationId,
      );

      const me = body<Me>(await agent.get('/v1/auth/me').expect(200));
      expect(me.organization?.id).toBe(alpha.organizationId);
    });

    it('confirms the address of an account in no organization that joins by an emailed link', async () => {
      const alpha = await organization('alpha');
      const sam = await leftOne('beta', 'sam@example.com');
      const [account] = await db
        .update(users)
        .set({ emailVerifiedAt: null })
        .where(eq(users.email, 'sam@example.com'))
        .returning({ id: users.id });
      await db
        .delete(accountEvents)
        .where(eq(accountEvents.userId, account.id));
      await invite(alpha, 'sam@example.com');

      const res = await sam
        .post('/v1/invitations/accept')
        .send({ token: invitationToken(app, 'sam@example.com') })
        .expect(200);
      expect(body<Accepted>(res).user.emailVerified).toBe(true);

      const [row] = await db
        .select({ emailVerifiedAt: users.emailVerifiedAt })
        .from(users)
        .where(eq(users.id, account.id));
      expect(row.emailVerifiedAt).not.toBeNull();
      const events = await db
        .select({ action: accountEvents.action })
        .from(accountEvents)
        .where(eq(accountEvents.userId, account.id));
      expect(events.map((event) => event.action).sort()).toEqual([
        'account.email_verified',
        'account.invitation_accepted',
      ]);
    });

    it('refuses an account in another organization, telling its owner why and the inviter nothing', async () => {
      const alpha = await organization('alpha');
      const beta = await organization('beta');
      await invite(alpha, beta.email);

      const res = await beta.agent
        .post('/v1/invitations/accept')
        .send({ token: invitationToken(app, beta.email) })
        .expect(409);
      expect(body<Refusal>(res).message).toContain(
        'already belongs to another organization',
      );
      expect((await list(alpha))[0].link.status).toBe('emailed');
    });

    it('refuses a session of another address, which signs out first', async () => {
      const alpha = await organization('alpha');
      const beta = await organization('beta');
      await invite(alpha, 'sam@example.com');
      const token = invitationToken(app, 'sam@example.com');

      const res = await beta.agent
        .post('/v1/invitations/accept')
        .send({ token, name: 'Sam', password: PASSWORD })
        .expect(403);
      expect(body<Refusal>(res).message).toBe(
        'This invitation is for sam@example.com. Sign out, then open the link again.',
      );
      expect(await read(token)).not.toBeNull();
    });

    it('refuses an account whose deletion is scheduled until it is kept, the link live meanwhile', async () => {
      const alpha = await organization('alpha');
      const sam = await leftOne('beta', 'sam@example.com');
      await sam
        .post('/v1/account/deletion')
        .send({ password: PASSWORD })
        .expect(200);
      await invite(alpha, 'sam@example.com');
      const token = invitationToken(app, 'sam@example.com');

      const res = await sam
        .post('/v1/invitations/accept')
        .send({ token })
        .expect(409);
      expect(body<Refusal>(res)).toMatchObject({
        code: 'account_deletion_scheduled',
        details: { day: deletionDayFor(new Date()) },
      });
      expect(await read(token)).not.toBeNull();

      await sam.delete('/v1/account/deletion').expect(204);
      await sam.post('/v1/invitations/accept').send({ token }).expect(200);
    });

    it('lets nobody join while the organization is being deleted', async () => {
      const alpha = await organization('alpha');
      await invite(alpha, 'sam@example.com');
      await alpha.agent
        .post('/v1/organization/deletion')
        .send({
          organizationName: 'alpha Co',
          password: PASSWORD,
          declineExport: true,
        })
        .expect(200);

      // The page says so at once, from the read.
      const token = invitationToken(app, 'sam@example.com');
      expect((await read(token))?.organization.deletionScheduledAt).toBe(
        deletionDayFor(new Date()),
      );
      await acceptNew(token).expect(409);
    });
  });

  describe('recorded on both sides', () => {
    it('records each link with the address and the role, never the note, and the acceptance by the new member', async () => {
      const alpha = await organization('alpha');
      const viewer = await roleIdNamed(app, alpha.organizationId, 'Viewer');
      const sent = await invite(alpha, 'sam@example.com', 'Viewer', {
        note: 'Bring boots',
      });
      await alpha.agent.post(`/v1/invitations/${sent.id}/resend`).expect(200);
      await alpha.agent.post(`/v1/invitations/${sent.id}/link`).expect(200);
      const revoked = await invite(alpha, 'pat@example.com');
      await alpha.agent.delete(`/v1/invitations/${revoked.id}`).expect(204);

      const rows = await db
        .select({
          action: auditLog.action,
          actorId: auditLog.actorId,
          resourceId: auditLog.resourceId,
          payload: auditLog.payload,
        })
        .from(auditLog)
        .where(eq(auditLog.organizationId, alpha.organizationId))
        .orderBy(auditLog.id);
      const named = [{ id: viewer, label: 'Viewer' }];
      expect(
        rows.filter((row) => row.action.startsWith('invitation.')),
      ).toEqual([
        {
          action: 'invitation.sent',
          actorId: alpha.userId,
          resourceId: sent.id,
          payload: { email: 'sam@example.com', roleIds: named },
        },
        {
          action: 'invitation.resent',
          actorId: alpha.userId,
          resourceId: sent.id,
          payload: { email: 'sam@example.com', roleIds: named },
        },
        {
          action: 'invitation.link_copied',
          actorId: alpha.userId,
          resourceId: sent.id,
          payload: { email: 'sam@example.com', roleIds: named },
        },
        {
          action: 'invitation.sent',
          actorId: alpha.userId,
          resourceId: revoked.id,
          payload: { email: 'pat@example.com', roleIds: named },
        },
        {
          action: 'invitation.revoked',
          actorId: alpha.userId,
          resourceId: revoked.id,
          payload: { email: 'pat@example.com', roleIds: named },
        },
      ]);
    });

    it('records the acceptance in the organization’s log by the new member, and in the account’s history', async () => {
      const alpha = await organization('alpha');
      const sent = await invite(alpha, 'sam@example.com');
      const { user } = body<Accepted>(
        await acceptNew(invitationToken(app, 'sam@example.com')).expect(200),
      );

      const [row] = await db
        .select({
          actorId: auditLog.actorId,
          resourceType: auditLog.resourceType,
          resourceId: auditLog.resourceId,
          payload: auditLog.payload,
        })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.organizationId, alpha.organizationId),
            eq(auditLog.action, 'invitation.accepted'),
          ),
        );
      expect(row).toEqual({
        actorId: user.id,
        resourceType: 'invitation',
        resourceId: sent.id,
        payload: {
          roleIds: [
            {
              id: await roleIdNamed(app, alpha.organizationId, 'Viewer'),
              label: 'Viewer',
            },
          ],
        },
      });

      const events = await db
        .select({ action: accountEvents.action })
        .from(accountEvents)
        .where(eq(accountEvents.userId, user.id));
      expect(events.map((event) => event.action).sort()).toEqual([
        'account.email_verified',
        'account.invitation_accepted',
      ]);
    });

    describe('an acceptance whose entry cannot be written', () => {
      const faults = new RecordingTracker();
      afterEach(() => faults.stop());

      it('is reported naming the new member and the organization (ADR-084)', async () => {
        const alpha = await organization('alpha');
        await invite(alpha, 'sam@example.com');
        faults.start();
        vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(
          new Error('canceling statement due to lock timeout'),
        );

        const { user } = body<Accepted>(
          await acceptNew(invitationToken(app, 'sam@example.com')).expect(200),
        );

        const sent = await faults.sent();
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({
          tags: {
            failed: 'an audit write',
            organization: alpha.organizationId,
          },
          user: { id: user.id },
        });
      });
    });
  });

  describe('when an invitation goes', () => {
    it('deletes one 30 days after it ended or was revoked, keeping an accepted one', async () => {
      const alpha = await organization('alpha');
      const long = new Date(Date.now() - 31 * DAY);
      const recent = new Date(Date.now() - 29 * DAY);

      const expired = await invite(alpha, 'expired@example.com');
      await db
        .update(invitations)
        .set({ expiresAt: long })
        .where(eq(invitations.id, expired.id));
      const revoked = await invite(alpha, 'revoked@example.com');
      await alpha.agent.delete(`/v1/invitations/${revoked.id}`).expect(204);
      await db
        .update(invitations)
        .set({ revokedAt: long })
        .where(eq(invitations.id, revoked.id));
      const lately = await invite(alpha, 'lately@example.com');
      await db
        .update(invitations)
        .set({ expiresAt: recent })
        .where(eq(invitations.id, lately.id));
      await invite(alpha, 'accepted@example.com');
      await acceptNew(invitationToken(app, 'accepted@example.com')).expect(200);
      await db
        .update(invitations)
        .set({ expiresAt: long })
        .where(eq(invitations.email, 'accepted@example.com'));

      expect(await app.get(InvitationsSweepService).sweep()).toBe(2);

      const left = await db
        .select({ email: invitations.email })
        .from(invitations)
        .orderBy(invitations.email);
      expect(left.map((row) => row.email)).toEqual([
        'accepted@example.com',
        'lately@example.com',
      ]);
      // Their links went with them.
      const links = await db
        .select({ invitationId: authTokens.invitationId })
        .from(authTokens)
        .where(eq(authTokens.invitationId, expired.id));
      expect(links).toEqual([]);
      // The audit log keeps who invited which address (ADR-077).
      const kept = await db
        .select({ action: auditLog.action, payload: auditLog.payload })
        .from(auditLog)
        .where(inArray(auditLog.resourceId, [expired.id, revoked.id]))
        .orderBy(auditLog.id);
      expect(
        kept.map((row) => [
          row.action,
          (row.payload as { email?: string } | null)?.email,
        ]),
      ).toEqual([
        ['invitation.sent', 'expired@example.com'],
        ['invitation.sent', 'revoked@example.com'],
        ['invitation.revoked', 'revoked@example.com'],
      ]);
    });

    it('goes with the membership it made', async () => {
      const alpha = await organization('alpha');
      await invite(alpha, 'sam@example.com');
      const { user } = body<Accepted>(
        await acceptNew(invitationToken(app, 'sam@example.com')).expect(200),
      );

      await alpha.agent.delete(`/v1/users/${user.id}`).expect(204);
      expect(await db.select().from(invitations)).toEqual([]);
    });
  });

  it('stores no line for a system role, whose words are the catalogues’ (ADR-080)', async () => {
    const alpha = await organization('alpha');

    const rows = await db
      .select({ name: roles.name, description: roles.description })
      .from(roles)
      .where(eq(roles.organizationId, alpha.organizationId));
    expect(
      Object.fromEntries(rows.map((row) => [row.name, row.description])),
    ).toEqual({ Owner: null, Admin: null, Viewer: null });
  });
});
