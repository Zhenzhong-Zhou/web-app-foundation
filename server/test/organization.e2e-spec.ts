import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { addresses, auditLog } from '../src/database/schema';
import {
  addMember,
  body,
  createE2eApp,
  registerOrganization,
} from './utils/fixtures';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface OrganizationResponse {
  id: string;
  name: string;
  taxRegistrationNumber: string | null;
  licenceNotInForcePolicy: string;
  licenceExpiredPolicy: string;
  licenceRequired: boolean;
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
 * cleared; both the Owner's to change. And its licence policy at release
 * (ADR-050), which nothing reads until release checks it.
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

  it('renames the organization, recording what it replaced', async () => {
    const org = await registerOrganization(app, 'alpha');

    await org.agent
      .patch('/v1/organization')
      .send({ name: 'Northside Naturals' })
      .expect(204);

    expect((await current(org.agent)).name).toBe('Northside Naturals');
    const me = body<{ organization: { name: string } }>(
      await org.agent.get('/v1/auth/me').expect(200),
    );
    expect(me.organization.name).toBe('Northside Naturals');

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'organization.updated'));
    expect(entry.payload).toEqual({
      name: { from: 'alpha Co', to: 'Northside Naturals' },
    });
  });

  it('refuses a blank, missing or overlong name', async () => {
    const org = await registerOrganization(app, 'alpha');

    for (const name of ['   ', null, 'x'.repeat(101)]) {
      await org.agent.patch('/v1/organization').send({ name }).expect(400);
    }
    expect((await current(org.agent)).name).toBe('alpha Co');

    // Spaces around a name are trimmed, as at registration.
    await org.agent
      .patch('/v1/organization')
      .send({ name: '  Spaced Out  ' })
      .expect(204);
    expect((await current(org.agent)).name).toBe('Spaced Out');
  });

  /**
   * The cautious reading of a regime nobody has configured: a licence not
   * yet in force is refused, an expired one needs an override, and a recipe
   * with none is fine — so a business making nothing regulated never meets
   * any of this.
   */
  it('starts with the default licence policy', async () => {
    const org = await registerOrganization(app, 'alpha');
    const organization = await current(org.agent);

    expect(organization.licenceNotInForcePolicy).toBe('block');
    expect(organization.licenceExpiredPolicy).toBe('override');
    expect(organization.licenceRequired).toBe(false);
  });

  it('sets the licence policy and records what it replaced', async () => {
    const org = await registerOrganization(app, 'alpha');

    await org.agent
      .patch('/v1/organization')
      .send({
        licenceNotInForcePolicy: 'override',
        licenceExpiredPolicy: 'block',
        licenceRequired: true,
      })
      .expect(204);

    const organization = await current(org.agent);
    expect(organization.licenceNotInForcePolicy).toBe('override');
    expect(organization.licenceExpiredPolicy).toBe('block');
    expect(organization.licenceRequired).toBe(true);

    // When the policy was loosened or tightened, and from what, is the
    // question an audit of a batch starts from.
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'organization.updated'));

    expect(entry.payload).toEqual({
      licenceNotInForcePolicy: { from: 'block', to: 'override' },
      licenceExpiredPolicy: { from: 'override', to: 'block' },
      licenceRequired: { from: false, to: true },
    });
  });

  it('changes one licence setting without touching the others', async () => {
    const org = await registerOrganization(app, 'alpha');

    await org.agent
      .patch('/v1/organization')
      .send({ licenceExpiredPolicy: 'allow' })
      .expect(204);

    const organization = await current(org.agent);
    expect(organization.licenceExpiredPolicy).toBe('allow');
    expect(organization.licenceNotInForcePolicy).toBe('block');
    expect(organization.licenceRequired).toBe(false);
  });

  /**
   * Every state needs an answer, so null is refused rather than cleared —
   * it would otherwise reach the NOT NULL column as a server error. A
   * string "true" is refused too: the pipe does no implicit conversion.
   */
  it('refuses an unknown or empty licence policy', async () => {
    const org = await registerOrganization(app, 'alpha');

    for (const change of [
      { licenceExpiredPolicy: 'warn' },
      { licenceExpiredPolicy: null },
      { licenceNotInForcePolicy: null },
      { licenceRequired: 'true' },
      { licenceRequired: null },
    ]) {
      await org.agent.patch('/v1/organization').send(change).expect(400);
    }

    const organization = await current(org.agent);
    expect(organization.licenceNotInForcePolicy).toBe('block');
    expect(organization.licenceExpiredPolicy).toBe('override');
    expect(organization.licenceRequired).toBe(false);
  });

  // Saving the form as it stands is not a change worth a history line.
  it('records nothing when the licence policy is saved unchanged', async () => {
    const org = await registerOrganization(app, 'alpha');

    await org.agent
      .patch('/v1/organization')
      .send({
        licenceNotInForcePolicy: 'block',
        licenceExpiredPolicy: 'override',
        licenceRequired: false,
      })
      .expect(204);

    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'organization.updated'));

    expect(entries).toHaveLength(0);
  });

  // What the organization prints is the Owner's, as it always was.
  it('lets Admin and Viewer read but not change it', async () => {
    const org = await registerOrganization(app, 'alpha');

    for (const [email, role] of [
      ['admin@alpha.example.com', 'Admin'],
      ['viewer@alpha.example.com', 'Viewer'],
    ] as const) {
      const member = await addMember(app, org, email, role);

      await member.get('/v1/organization').expect(200);
      await member
        .patch('/v1/organization')
        .send({ taxRegistrationNumber: 'X' })
        .expect(403);
      await member
        .put('/v1/organization/address')
        .send(HEAD_OFFICE)
        .expect(403);
      // Loosening the licence policy is the same route, and the same rule.
      await member
        .patch('/v1/organization')
        .send({ licenceExpiredPolicy: 'allow' })
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
