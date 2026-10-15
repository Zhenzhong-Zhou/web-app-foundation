import { access } from 'node:fs/promises';
import path from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { Response } from 'superagent';
import type TestAgent from 'supertest/lib/agent';

import {
  AccountDeletionService,
  deletionDayFor,
} from '../src/core/auth/account-deletion.service';
import { OrganizationDeletionService } from '../src/core/auth/organization-deletion.service';
import {
  NOT_EXPORTED,
  organizationTables,
} from '../src/core/organizations/organization-tables';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  auditLog,
  organizations,
  sessions,
  users,
} from '../src/database/schema';
import {
  addMember,
  body,
  createE2eApp,
  PASSWORD,
  registerOrganization,
} from './utils/fixtures';
import { RecordingMailService } from './utils/recording-mail';
import { resetDatabase } from './utils/reset-db';
import { shippedSale } from './utils/sales';
import { readCsv, readZip } from './utils/zip';

type Org = Awaited<ReturnType<typeof registerOrganization>>;

interface Refusal {
  code?: string;
}

interface Me {
  user: { id: string; deletionScheduledAt?: string | null };
  organization: {
    id: string;
    deletionScheduledAt: string | null;
    deletionUnderWay: boolean;
  } | null;
}

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#2a6"/></svg>',
);

/** The response as bytes, whatever its type. */
function binary(
  res: Response,
  done: (error: Error | null, body: Buffer) => void,
) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
}

/** A YYYY-MM-DD day as the English email names it, unconverted. */
function longDay(day: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/** A day long over everywhere: the deletion is due, and under way. */
const LONG_AGO = '2026-01-01';

/**
 * Deleting an organization (ADR-070): the export, scheduling with the
 * export or its decline, cancelling until the day has ended everywhere,
 * completing, and the only member's one step.
 */
describe('Organization deletion (e2e)', () => {
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

  async function exportOf(agent: TestAgent): Promise<Map<string, Buffer>> {
    const res = await agent
      .get('/v1/organization/export')
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(res.headers['content-type']).toBe('application/zip');
    return readZip(res.body as Buffer);
  }

  async function me(agent: TestAgent): Promise<Me> {
    return body<Me>(await agent.get('/v1/auth/me').expect(200));
  }

  /** An organization with records in many tables, and a file. */
  async function busy(slug: string): Promise<Org> {
    const org = await registerOrganization(app, slug);
    const { shipmentId } = await shippedSale(org.agent);
    await org.agent.post('/v1/invoices').send({ shipmentId }).expect(201);
    await org.agent
      .post('/v1/files/logo')
      .attach('file', SVG, 'logo.svg')
      .expect(201);
    return org;
  }

  /** Rows each table holds for an organization, by table. */
  async function rowsOf(organizationId: string): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const table of organizationTables()) {
      const { rows } = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from ${sql.identifier(table)}
            where organization_id = ${organizationId}`,
      );
      counts.set(table, rows[0].n);
    }
    return counts;
  }

  async function setDay(organizationId: string, day: string): Promise<void> {
    await db
      .update(organizations)
      .set({ deletionScheduledAt: day })
      .where(eq(organizations.id, organizationId));
  }

  function service() {
    return app.get(OrganizationDeletionService);
  }

  describe('the export', () => {
    it('holds every table the organization owns, and only its rows', async () => {
      const alpha = await busy('alpha');
      await busy('beta');

      const zip = await exportOf(alpha.agent);

      expect(zip.has('README.txt')).toBe(true);
      expect(zip.get('README.txt')!.toString()).toContain('alpha Co');
      const expected = organizationTables().filter(
        (table) => !NOT_EXPORTED.has(table),
      );
      for (const table of [...expected, 'organization', 'members']) {
        expect(zip.has(`${table}.csv`), table).toBe(true);
      }
      for (const table of NOT_EXPORTED.keys()) {
        expect(zip.has(`${table}.csv`), table).toBe(false);
      }

      // Every row of every table is alpha's, and invoices with their lines.
      for (const table of expected) {
        for (const row of readCsv(zip.get(`${table}.csv`)!)) {
          expect(row.organization_id, table).toBe(alpha.organizationId);
        }
      }
      expect(readCsv(zip.get('invoices.csv')!)).toHaveLength(1);
      expect(readCsv(zip.get('invoice_lines.csv')!)).toHaveLength(2);

      const [member] = readCsv(zip.get('members.csv')!);
      expect(member).toMatchObject({
        user_id: alpha.userId,
        email: alpha.email,
        role: 'Owner',
      });
      const [organization] = readCsv(zip.get('organization.csv')!);
      expect(organization.id).toBe(alpha.organizationId);

      // The logo, as the file it is kept as.
      const [logo] = readCsv(zip.get('files.csv')!);
      const kept = [...zip.keys()].filter((name) => name.startsWith('files/'));
      expect(kept).toEqual([`files/${logo.id}-${logo.original_name}`]);
      expect(zip.get(kept[0])!.length).toBeGreaterThan(0);
    });

    it('is recorded in the audit log before the download ends', async () => {
      const alpha = await busy('alpha');

      await exportOf(alpha.agent);

      const [entry] = await db
        .select({ actorId: auditLog.actorId, payload: auditLog.payload })
        .from(auditLog)
        .where(eq(auditLog.action, 'organization.exported'));
      expect(entry.actorId).toBe(alpha.userId);
      expect(entry.payload).toMatchObject({ files: 1 });
    });

    it('is the Owners’ alone', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const admin = await addMember(
        app,
        alpha,
        'admin@alpha.example.com',
        'Admin',
      );

      await admin.get('/v1/organization/export').expect(403);
    });

    it('covers every table with an organization_id, or says why not', async () => {
      const { rows } = await db.execute<{ table_name: string }>(sql`
        select distinct table_name from information_schema.columns
        where table_schema = 'public' and column_name = 'organization_id'
      `);

      expect(rows.map((row) => row.table_name).sort()).toEqual(
        organizationTables(),
      );
      for (const name of NOT_EXPORTED.keys()) {
        expect(organizationTables()).toContain(name);
      }
    });
  });

  describe('scheduling', () => {
    it('needs an export from the last 24 hours, or a decline', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      const refused = await alpha.agent
        .post('/v1/organization/deletion')
        .send({ password: PASSWORD })
        .expect(409);
      expect(body<Refusal>(refused).code).toBe('organization_export_required');

      await exportOf(alpha.agent);
      const res = await alpha.agent
        .post('/v1/organization/deletion')
        .send({ password: PASSWORD })
        .expect(200);

      expect(body<{ deletionScheduledAt: string }>(res)).toEqual({
        deletionScheduledAt: deletionDayFor(new Date()),
      });
      const [entry] = await db
        .select({ payload: auditLog.payload })
        .from(auditLog)
        .where(eq(auditLog.action, 'organization.deletion_scheduled'));
      expect(entry.payload).toMatchObject({ export: 'downloaded' });
    });

    it('tells every member, with a banner and an email', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const member = await addMember(
        app,
        alpha,
        'member@alpha.example.com',
        'Viewer',
      );

      await alpha.agent
        .post('/v1/organization/deletion')
        .send({ password: PASSWORD, declineExport: true })
        .expect(200);

      const day = deletionDayFor(new Date());
      expect((await me(member)).organization).toMatchObject({
        deletionScheduledAt: day,
        deletionUnderWay: false,
      });
      for (const to of [alpha.email, 'member@alpha.example.com']) {
        expect(mail.lastTo(to)?.subject).toMatch(/^alpha Co will be deleted/);
      }
      expect(mail.lastTo(alpha.email)?.text).toContain('Download the export');
      expect(mail.lastTo('member@alpha.example.com')?.text).not.toContain(
        'Download the export',
      );
      // Everyone keeps working; only an Owner can cancel.
      expect(mail.lastTo('member@alpha.example.com')?.text).toContain(
        'Only an Owner can cancel the deletion',
      );
      const [entry] = await db
        .select({ payload: auditLog.payload })
        .from(auditLog)
        .where(eq(auditLog.action, 'organization.deletion_scheduled'));
      expect(entry.payload).toMatchObject({ export: 'declined' });
    });

    it('refuses a wrong password, and anyone but an Owner', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const admin = await addMember(
        app,
        alpha,
        'admin@alpha.example.com',
        'Admin',
      );

      await alpha.agent
        .post('/v1/organization/deletion')
        .send({ password: 'not-the-password', declineExport: true })
        .expect(401);
      await admin
        .post('/v1/organization/deletion')
        .send({ password: PASSWORD, declineExport: true })
        .expect(403);
      await admin.delete('/v1/organization/deletion').expect(403);

      expect(
        (await me(alpha.agent)).organization?.deletionScheduledAt,
      ).toBeNull();
    });

    it('changes nothing when asked again', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const ask = () =>
        alpha.agent
          .post('/v1/organization/deletion')
          .send({ password: PASSWORD, declineExport: true })
          .expect(200);

      await ask();
      const sent = mail.sent.length;
      await setDay(alpha.organizationId, '2026-12-31');
      const again = await ask();

      expect(
        body<{ deletionScheduledAt: string }>(again).deletionScheduledAt,
      ).toBe('2026-12-31');
      expect(mail.sent.length).toBe(sent);
    });
  });

  describe('cancelling', () => {
    it('is any Owner’s, and every member is told', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const second = await addMember(
        app,
        alpha,
        'second@alpha.example.com',
        'Owner',
      );
      await alpha.agent
        .post('/v1/organization/deletion')
        .send({ password: PASSWORD, declineExport: true })
        .expect(200);

      await second.delete('/v1/organization/deletion').expect(204);

      expect(
        (await me(alpha.agent)).organization?.deletionScheduledAt,
      ).toBeNull();
      expect(mail.lastTo(alpha.email)?.subject).toBe(
        'alpha Co will not be deleted',
      );
      expect(mail.lastTo(alpha.email)?.text).toContain('Owner cancelled');
    });

    it('is refused once the day has ended everywhere', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await setDay(alpha.organizationId, LONG_AGO);

      expect((await me(alpha.agent)).organization?.deletionUnderWay).toBe(true);
      const refused = await alpha.agent
        .delete('/v1/organization/deletion')
        .expect(409);

      expect(body<Refusal>(refused).code).toBe(
        'organization_deletion_under_way',
      );
    });
  });

  describe('completing', () => {
    it('deletes every row and file, and keeps the members’ accounts', async () => {
      const alpha = await busy('alpha');
      const member = await addMember(
        app,
        alpha,
        'member@alpha.example.com',
        'Viewer',
      );
      const beta = await busy('beta');
      const betaBefore = await rowsOf(beta.organizationId);
      const [logo] = readCsv((await exportOf(alpha.agent)).get('files.csv')!);
      const stored = path.resolve(
        'storage',
        alpha.organizationId,
        logo.id,
        'full',
      );
      await access(stored);

      await setDay(alpha.organizationId, LONG_AGO);
      expect(await service().completeDue()).toEqual({
        completed: 1,
        failed: 0,
      });

      for (const [table, rows] of await rowsOf(alpha.organizationId)) {
        expect(rows, table).toBe(0);
      }
      expect(await rowsOf(beta.organizationId)).toEqual(betaBefore);
      const [gone] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, alpha.organizationId));
      expect(gone).toBeUndefined();
      await expect(access(stored)).rejects.toThrow();

      // Still signed in, to no organization; the account untouched.
      expect((await me(member)).organization).toBeNull();
      const [kept] = await db
        .select({ deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.email, 'member@alpha.example.com'));
      expect(kept.deletedAt).toBeNull();
      expect(mail.lastTo('member@alpha.example.com')?.subject).toBe(
        'alpha Co has been deleted',
      );
    });

    it('waits until the day has ended everywhere', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await alpha.agent
        .post('/v1/organization/deletion')
        .send({ password: PASSWORD, declineExport: true })
        .expect(200);

      expect(await service().completeDue()).toEqual({
        completed: 0,
        failed: 0,
      });
      expect((await me(alpha.agent)).organization).not.toBeNull();
    });

    it('moves a session working in it to the member’s next organization', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await addMember(app, alpha, 'member@alpha.example.com', 'Viewer');
      const memberId = (
        await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, 'member@alpha.example.com'))
      )[0].id;

      await setDay(alpha.organizationId, LONG_AGO);
      await service().completeDue();

      const left = await db
        .select({ currentOrgId: sessions.currentOrgId })
        .from(sessions)
        .where(eq(sessions.userId, memberId));
      expect(left).toEqual([{ currentOrgId: null }]);
    });
  });

  describe('the only member', () => {
    async function both(org: Org): Promise<string> {
      const res = await org.agent
        .post('/v1/organization/deletion')
        .send({ password: PASSWORD, declineExport: true, deleteAccount: true })
        .expect(200);
      return body<{ deletionScheduledAt: string }>(res).deletionScheduledAt;
    }

    it('deletes the organization and the account in one step', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      const day = await both(alpha);

      const session = await me(alpha.agent);
      expect(session.user.deletionScheduledAt).toBe(day);
      expect(session.organization?.deletionScheduledAt).toBe(day);
      // One email for both, not the account's own as well.
      const about = mail.sent.filter(
        (sent) => sent.to === alpha.email && sent.subject.includes('deleted'),
      );
      expect(about.map((sent) => sent.subject)).toEqual([
        `alpha Co will be deleted after ${longDay(day)}`,
      ]);
      expect(mail.lastTo(alpha.email)?.text).toContain(
        'Your account will be deleted straight after it',
      );

      await db
        .update(users)
        .set({ deletionScheduledAt: LONG_AGO })
        .where(eq(users.id, alpha.userId));
      await setDay(alpha.organizationId, LONG_AGO);

      // The account's own run waits for the organization rather than
      // cancelling for only_member…
      await app.get(AccountDeletionService).completeDue();
      const [waiting] = await db
        .select({ day: users.deletionScheduledAt, deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.id, alpha.userId));
      expect(waiting).toEqual({ day: LONG_AGO, deletedAt: null });

      // …which goes first, the account straight after, in the same run.
      await service().completeDue();
      const [deleted] = await db
        .select({ deletedAt: users.deletedAt, email: users.email })
        .from(users)
        .where(eq(users.id, alpha.userId));
      expect(deleted.deletedAt).not.toBeNull();
      expect(deleted.email).toBe(`deleted-${alpha.userId}@invalid`);
    });

    it('is refused with others in the organization', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await addMember(app, alpha, 'member@alpha.example.com', 'Viewer');

      await alpha.agent
        .post('/v1/organization/deletion')
        .send({ password: PASSWORD, declineExport: true, deleteAccount: true })
        .expect(409);
    });

    it('keeps both when either is cancelled', async () => {
      for (const route of [
        '/v1/organization/deletion',
        '/v1/account/deletion',
      ]) {
        await resetDatabase(app);
        mail.reset();
        const alpha = await registerOrganization(app, 'alpha');
        await both(alpha);

        await alpha.agent.delete(route).expect(204);

        const session = await me(alpha.agent);
        expect(session.user.deletionScheduledAt, route).toBeNull();
        expect(session.organization?.deletionScheduledAt, route).toBeNull();
        expect(mail.lastTo(alpha.email)?.text, route).toContain(
          'Your account will not be deleted either',
        );
        const cancelled = await db
          .select({ id: auditLog.id })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.organizationId, alpha.organizationId),
              eq(auditLog.action, 'organization.deletion_cancelled'),
            ),
          );
        expect(cancelled, route).toHaveLength(1);
      }
    });

    it('can ask to delete the account alone once the organization is going', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await alpha.agent
        .post('/v1/organization/deletion')
        .send({ password: PASSWORD, declineExport: true })
        .expect(200);

      await alpha.agent
        .post('/v1/account/deletion')
        .send({ password: PASSWORD })
        .expect(200);
    });
  });
});
