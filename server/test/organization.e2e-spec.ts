import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { addresses, auditLog, roles } from '../src/database/schema';
import {
  body,
  createE2eApp,
  PASSWORD,
  registerOrganization,
} from './utils/fixtures';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface OrganizationResponse {
  id: string;
  name: string;
  taxRegistrationNumber: string | null;
  address: {
    line1: string;
    line2: string | null;
    city: string | null;
    country: string;
  } | null;
}

/**
 * The organization's own details, which every invoice prints (ADR-046).
 * One registered address, updated in place; a tax number that can be
 * cleared; both the Owner's to change.
 */
describe('Organization (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  const HEAD_OFFICE = {
    line1: '100 Main St',
    city: 'Vancouver',
    region: 'BC',
    postalCode: 'V6B 1A1',
    country: 'ca',
  };

  beforeAll(async () => {
    app = await createE2eApp();
    db = app.get<Database>(UNSAFE_GLOBAL_DB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  async function addMember(
    owner: Awaited<ReturnType<typeof registerOrganization>>,
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

  async function current(agent: ReturnType<typeof authedAgent>) {
    return body<{ organization: OrganizationResponse }>(
      await agent.get('/v1/organization').expect(200),
    ).organization;
  }

  it('starts with no tax number and no address', async () => {
    const org = await registerOrganization(app, 'alpha');
    const organization = await current(org.agent);

    expect(organization.id).toBe(org.organizationId);
    expect(organization.name).toBe('alpha Co');
    expect(organization.taxRegistrationNumber).toBeNull();
    expect(organization.address).toBeNull();
  });

  it('sets the tax number, and clears it with an empty string', async () => {
    const org = await registerOrganization(app, 'alpha');

    await org.agent
      .patch('/v1/organization')
      .send({ taxRegistrationNumber: '123456789 RT0001' })
      .expect(204);

    expect((await current(org.agent)).taxRegistrationNumber).toBe(
      '123456789 RT0001',
    );

    await org.agent
      .patch('/v1/organization')
      .send({ taxRegistrationNumber: '' })
      .expect(204);

    expect((await current(org.agent)).taxRegistrationNumber).toBeNull();
  });

  /**
   * One row, updated in place: "the address on our invoices" never has two
   * answers. Sent whole, so a field left out the second time is cleared.
   */
  it('sets the registered address, then replaces it in place', async () => {
    const org = await registerOrganization(app, 'alpha');

    await org.agent
      .put('/v1/organization/address')
      .send({ ...HEAD_OFFICE, line2: 'Suite 200' })
      .expect(204);

    const first = await current(org.agent);
    expect(first.address?.line1).toBe('100 Main St');
    expect(first.address?.line2).toBe('Suite 200');
    // Uppercased, as partner addresses are.
    expect(first.address?.country).toBe('CA');

    await org.agent
      .put('/v1/organization/address')
      .send({ ...HEAD_OFFICE, line1: '200 Main St' })
      .expect(204);

    const second = await current(org.agent);
    expect(second.address?.line1).toBe('200 Main St');
    expect(second.address?.line2).toBeNull();

    const rows = await db
      .select()
      .from(addresses)
      .where(eq(addresses.ownerOrganizationId, org.organizationId));
    expect(rows).toHaveLength(1);
    expect(rows[0].isBilling).toBe(true);
    expect(rows[0].isDefault).toBe(true);
  });

  it('records a tax number change with what it replaced', async () => {
    const org = await registerOrganization(app, 'alpha');

    await org.agent
      .patch('/v1/organization')
      .send({ taxRegistrationNumber: '123456789 RT0001' })
      .expect(204);

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'organization.updated'));

    expect(entry.resourceId).toBe(org.organizationId);
    expect(entry.resourceLabel).toBe('alpha Co');
    expect(entry.payload).toEqual({
      taxRegistrationNumber: { from: null, to: '123456789 RT0001' },
    });
  });

  // What the organization prints is the Owner's, as it always was.
  it('lets Admin and Viewer read but not change it', async () => {
    const org = await registerOrganization(app, 'alpha');

    for (const [email, role] of [
      ['admin@alpha.example.com', 'Admin'],
      ['viewer@alpha.example.com', 'Viewer'],
    ] as const) {
      const member = await addMember(org, email, role);

      await member.get('/v1/organization').expect(200);
      await member
        .patch('/v1/organization')
        .send({ taxRegistrationNumber: 'X' })
        .expect(403);
      await member
        .put('/v1/organization/address')
        .send(HEAD_OFFICE)
        .expect(403);
    }
  });

  it('only ever shows the signed-in organization', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const beta = await registerOrganization(app, 'beta');

    await beta.agent
      .put('/v1/organization/address')
      .send(HEAD_OFFICE)
      .expect(204);

    expect((await current(alpha.agent)).address).toBeNull();
    expect((await current(beta.agent)).address?.line1).toBe('100 Main St');
  });
});
