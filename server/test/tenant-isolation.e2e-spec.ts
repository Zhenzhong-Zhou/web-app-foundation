import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { organizations, roles, users } from '../src/database/schema';
import { runInTenantContext } from '../src/database/tenant-context';
import { TenantDb } from '../src/database/tenant-db.service';
import { createTestApp } from './utils/create-test-app';
import { resetDatabase } from './utils/reset-db';

/**
 * ADR-003 calls the organization_id filter the single highest-risk area of the
 * codebase and says it needs a test. This is that test.
 *
 * A bug here is not a broken feature — it is one customer reading another
 * customer's data, which is a breach you have to disclose.
 *
 * Setup deliberately uses the unscoped handle: to prove TenantDb filters, the
 * test must first plant rows it should never return.
 */
describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let tenantDb: TenantDb;
  let db: Database;

  const actor = randomUUID();

  beforeAll(async () => {
    app = await createTestApp();
    tenantDb = app.get(TenantDb);
    db = app.get<Database>(UNSAFE_GLOBAL_DB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  /** Two organizations, each with one identically-named role. */
  async function seedTwoOrgs() {
    const [orgA] = await db
      .insert(organizations)
      .values({ name: 'Org A', slug: 'org-a' })
      .returning();
    const [orgB] = await db
      .insert(organizations)
      .values({ name: 'Org B', slug: 'org-b' })
      .returning();

    const [roleA] = await db
      .insert(roles)
      .values({ organizationId: orgA.id, name: 'Owner' })
      .returning();
    const [roleB] = await db
      .insert(roles)
      .values({ organizationId: orgB.id, name: 'Owner' })
      .returning();

    return { orgA, orgB, roleA, roleB };
  }

  it('select() returns only the current organization rows', async () => {
    const { orgA, roleA } = await seedTwoOrgs();

    const rows = await runInTenantContext(
      { userId: actor, organizationId: orgA.id },
      () => tenantDb.select(roles),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(roleA.id);
  });

  it('throws without tenant context instead of returning everything', async () => {
    await seedTwoOrgs();

    // The dangerous failure mode is silent: an unscoped query looks like a
    // working query until someone notices the row count.
    expect(() => tenantDb.select(roles)).toThrow(/No tenant context/);
  });

  it('insert() stamps the current organization', async () => {
    const { orgA } = await seedTwoOrgs();

    await runInTenantContext({ userId: actor, organizationId: orgA.id }, () =>
      tenantDb.insert(roles, { name: 'Viewer' }),
    );

    const [inserted] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'Viewer'));

    expect(inserted.organizationId).toBe(orgA.id);
  });

  it('update() cannot modify another organization row, even by id', async () => {
    const { orgA, roleB } = await seedTwoOrgs();

    // Targets org B's row explicitly while acting as org A.
    await runInTenantContext({ userId: actor, organizationId: orgA.id }, () =>
      tenantDb.update(roles, { name: 'Hijacked' }, eq(roles.id, roleB.id)),
    );

    const [after] = await db.select().from(roles).where(eq(roles.id, roleB.id));
    expect(after.name).toBe('Owner');
  });

  it('delete() cannot remove another organization row, even by id', async () => {
    const { orgA, roleB } = await seedTwoOrgs();

    await runInTenantContext({ userId: actor, organizationId: orgA.id }, () =>
      tenantDb.delete(roles, eq(roles.id, roleB.id)),
    );

    const survivors = await db
      .select()
      .from(roles)
      .where(eq(roles.id, roleB.id));
    expect(survivors).toHaveLength(1);
  });

  it('rejects tables without organization_id at compile time', () => {
    // @ts-expect-error users is global identity and has no organization_id
    // (ADR-004). If this line ever stops erroring, ts-jest fails the suite —
    // which is the regression this test exists to catch.
    const rejected = () => tenantDb.select(users);

    expect(typeof rejected).toBe('function');
  });
});
