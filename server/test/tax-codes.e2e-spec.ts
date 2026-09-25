import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { auditLog, roles, taxCodeComponents } from '../src/database/schema';
import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './utils/create-test-app';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface TaxCodeResponse {
  id: string;
  name: string;
  isActive: boolean;
  components: { name: string; rate: string }[];
}

interface RegisterResponse {
  user: { id: string; organizationId: string };
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * Tax codes are what an invoice line charges (ADR-046). What matters here is
 * that a code and its components are written together, that a change
 * replaces the set, and that only the Owner can change what customers are
 * charged.
 */
describe('Tax codes (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  const PASSWORD = 'correct-horse-battery';

  const GST_PST = {
    name: 'GST + PST (BC)',
    components: [
      { name: 'GST', rate: '5' },
      { name: 'PST', rate: '7' },
    ],
  };

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(ThrottlerStorage)
        .useValue(unlimitedThrottler)
        .overrideProvider(MailService)
        .useValue(new RecordingMailService()),
    );

    db = app.get<Database>(UNSAFE_GLOBAL_DB);
    await seedPermissions(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  async function registerOrg(slugish: string) {
    const agent = authedAgent(app);

    const res = await agent
      .post('/v1/auth/register')
      .send({
        email: `owner@${slugish}.example.com`,
        password: PASSWORD,
        name: 'Owner',
        organizationName: `${slugish} Co`,
      })
      .expect(201);

    return {
      agent,
      organizationId: body<RegisterResponse>(res).user.organizationId,
    };
  }

  async function addMember(
    owner: Awaited<ReturnType<typeof registerOrg>>,
    email: string,
    roleName: 'Admin' | 'Viewer',
  ) {
    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(
          eq(roles.organizationId, owner.organizationId),
          eq(roles.name, roleName),
        ),
      );

    await owner.agent
      .post('/v1/users')
      .send({ email, name: roleName, password: PASSWORD, roleId: role.id })
      .expect(201);

    const member = authedAgent(app);
    await member
      .post('/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return member;
  }

  async function created(agent: ReturnType<typeof authedAgent>) {
    return body<{ taxCode: TaxCodeResponse }>(
      await agent.post('/v1/tax-codes').send(GST_PST).expect(201),
    ).taxCode;
  }

  async function listed(agent: ReturnType<typeof authedAgent>) {
    return body<{ taxCodes: TaxCodeResponse[] }>(
      await agent.get('/v1/tax-codes').expect(200),
    ).taxCodes;
  }

  it('creates a code with its components and lists them together', async () => {
    const org = await registerOrg('alpha');
    const code = await created(org.agent);

    expect(code.components.map((c) => [c.name, c.rate])).toEqual([
      ['GST', '5.0000'],
      ['PST', '7.0000'],
    ]);

    const [listedCode] = await listed(org.agent);
    expect(listedCode.name).toBe('GST + PST (BC)');
    expect(listedCode.components).toHaveLength(2);
  });

  // Exempt is a code with no components, not a blank on the line.
  it('creates an exempt code with no components', async () => {
    const org = await registerOrg('alpha');

    await org.agent
      .post('/v1/tax-codes')
      .send({ name: 'Exempt', components: [] })
      .expect(201);
  });

  it('refuses a second code with the same name', async () => {
    const org = await registerOrg('alpha');
    await created(org.agent);

    await org.agent.post('/v1/tax-codes').send(GST_PST).expect(409);
  });

  it('refuses one tax listed twice, and writes nothing', async () => {
    const org = await registerOrg('alpha');

    await org.agent
      .post('/v1/tax-codes')
      .send({
        name: 'Double',
        components: [
          { name: 'GST', rate: '5' },
          { name: 'GST', rate: '5' },
        ],
      })
      .expect(400);

    expect(await listed(org.agent)).toHaveLength(0);
  });

  /**
   * The bound is the database's check, reported as a 400. The code row is
   * inserted first in the same transaction, so this also proves the
   * rollback: no code is left without its components.
   */
  it('refuses a rate over 100%, and leaves no code behind', async () => {
    const org = await registerOrg('alpha');

    await org.agent
      .post('/v1/tax-codes')
      .send({ name: 'Wrong', components: [{ name: 'GST', rate: '500' }] })
      .expect(400);

    expect(await listed(org.agent)).toHaveLength(0);
  });

  it('replaces the components as a set', async () => {
    const org = await registerOrg('alpha');
    const code = await created(org.agent);

    await org.agent
      .patch(`/v1/tax-codes/${code.id}`)
      .send({ components: [{ name: 'HST', rate: '13' }] })
      .expect(204);

    const rows = await db
      .select()
      .from(taxCodeComponents)
      .where(eq(taxCodeComponents.taxCodeId, code.id));

    expect(rows.map((row) => [row.name, row.rate])).toEqual([
      ['HST', '13.0000'],
    ]);
  });

  it('retires a code, and lists active codes first', async () => {
    const org = await registerOrg('alpha');
    const old = await created(org.agent);

    await org.agent
      .post('/v1/tax-codes')
      .send({ name: 'Zero-rated', components: [] })
      .expect(201);

    await org.agent
      .patch(`/v1/tax-codes/${old.id}`)
      .send({ isActive: false })
      .expect(204);

    const codes = await listed(org.agent);
    expect(codes.map((c) => [c.name, c.isActive])).toEqual([
      ['Zero-rated', true],
      ['GST + PST (BC)', false],
    ]);
  });

  // "Who set PST to 8%" is the question the log exists to answer.
  it('records the new components in the audit log', async () => {
    const org = await registerOrg('alpha');
    const code = await created(org.agent);

    await org.agent
      .patch(`/v1/tax-codes/${code.id}`)
      .send({
        components: [
          { name: 'GST', rate: '5' },
          { name: 'PST', rate: '8' },
        ],
      })
      .expect(204);

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'tax_code.updated'));

    expect(entry.resourceLabel).toBe('GST + PST (BC)');
    expect(entry.payload).toEqual({
      components: [
        { name: 'GST', rate: '5' },
        { name: 'PST', rate: '8' },
      ],
    });
  });

  /**
   * What a customer is charged is the Owner's decision, like the
   * organization's own settings. Admin and Viewer can see the codes, since
   * anyone drafting an invoice picks one.
   */
  it('lets Admin and Viewer read but not change codes', async () => {
    const org = await registerOrg('alpha');
    const code = await created(org.agent);

    for (const [email, role] of [
      ['admin@alpha.example.com', 'Admin'],
      ['viewer@alpha.example.com', 'Viewer'],
    ] as const) {
      const member = await addMember(org, email, role);

      expect(await listed(member)).toHaveLength(1);
      await member.post('/v1/tax-codes').send(GST_PST).expect(403);
      await member
        .patch(`/v1/tax-codes/${code.id}`)
        .send({ isActive: false })
        .expect(403);
    }
  });

  it('keeps each organization to its own codes', async () => {
    const alpha = await registerOrg('alpha');
    const beta = await registerOrg('beta');
    const theirs = await created(beta.agent);

    expect(await listed(alpha.agent)).toHaveLength(0);

    // Scoped, so not found rather than forbidden.
    await alpha.agent
      .patch(`/v1/tax-codes/${theirs.id}`)
      .send({ isActive: false })
      .expect(404);
  });
});
