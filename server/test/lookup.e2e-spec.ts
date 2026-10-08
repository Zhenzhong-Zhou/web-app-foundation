import type { INestApplication } from '@nestjs/common';
import { inArray } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { permissions, rolePermissions, roles } from '../src/database/schema';
import {
  addMember,
  body,
  createE2eApp,
  createLocation,
  createPartner,
  createVariant,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

interface LookupResponse {
  groups: {
    kind: string;
    results: {
      id: string;
      title: string;
      detail: string | null;
      close: boolean;
    }[];
  }[];
}

/**
 * The top bar's lookup (ADR-056, step 5): every kind a member may see, in
 * one answer; exact matches ranked before close ones; Chinese by pinyin;
 * nothing from another organization, nothing a member's role hides.
 */
describe('Lookup (e2e)', () => {
  let app: INestApplication;
  let db: Database;

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

  type Org = Awaited<ReturnType<typeof registerOrganization>>;

  /** An organization with a partner in each script, an item and two lots. */
  async function stocked(slug: string) {
    const org = await registerOrganization(app, slug);
    const shelf = await createLocation(org.agent, {
      type: 'site',
      name: 'Main',
    });
    const variant = await createVariant(org.agent, {
      type: 'good',
      name: 'Focus 60ct',
      variant: { sku: 'FOCUS-60', tracksLots: true },
    });
    await createPartner(org.agent, { name: 'Northside Pharmacy' });
    await createPartner(org.agent, { name: '明德药房' });

    for (const code of ['BF-2609', 'BF-2609-B']) {
      await org.agent
        .post('/v1/stock/movements')
        .send({
          variantId: variant,
          toLocationId: shelf,
          quantity: '10',
          reason: 'receipt',
          lot: { code },
        })
        .expect(201);
    }

    return org;
  }

  async function lookup(org: Org | { agent: Org['agent'] }, q: string) {
    return body<LookupResponse>(
      await org.agent.get(`/v1/lookup?q=${encodeURIComponent(q)}`).expect(200),
    ).groups;
  }

  const titles = (groups: LookupResponse['groups'], kind: string) =>
    groups.find((group) => group.kind === kind)?.results.map((r) => r.title);

  it('groups what it finds by kind, the exact match first', async () => {
    const alpha = await stocked('alpha');

    const groups = await lookup(alpha, 'BF-2609');
    // Exactly a lot's code, so lots lead; the exact one before the longer.
    expect(groups[0].kind).toBe('lot');
    expect(titles(groups, 'lot')).toEqual(['BF-2609', 'BF-2609-B']);

    // Part of a code finds it too, as the one exact match; BF-2609 may
    // follow as a close match, never before it.
    const part = (await lookup(alpha, '2609-b')).find(
      (group) => group.kind === 'lot',
    );
    expect(part?.results[0]).toMatchObject({
      title: 'BF-2609-B',
      close: false,
    });
    expect(part?.results.slice(1).every((result) => result.close)).toBe(true);
  });

  it('finds an item by SKU or name, and a Chinese partner by pinyin', async () => {
    const alpha = await stocked('alpha');

    expect(titles(await lookup(alpha, 'focus-60'), 'item')).toEqual([
      'Focus 60ct',
    ]);
    expect(titles(await lookup(alpha, 'mdyf'), 'partner')).toEqual([
      '明德药房',
    ]);
    expect(titles(await lookup(alpha, '明德'), 'partner')).toEqual([
      '明德药房',
    ]);
  });

  it('forgives a typo with a close match, after any exact one', async () => {
    const alpha = await stocked('alpha');

    const items = (await lookup(alpha, 'fokus')).find(
      (group) => group.kind === 'item',
    );
    expect(items?.results).toEqual([
      expect.objectContaining({ title: 'Focus 60ct', close: true }),
    ]);

    const partnersFound = (await lookup(alpha, 'nortside')).find(
      (group) => group.kind === 'partner',
    );
    expect(partnersFound?.results[0]).toMatchObject({
      title: 'Northside Pharmacy',
      close: true,
    });
  });

  it("never finds another organization's records", async () => {
    await stocked('alpha');
    const beta = await registerOrganization(app, 'beta');

    expect(await lookup(beta, '2609')).toEqual([]);
    expect(await lookup(beta, 'focus')).toEqual([]);
  });

  it('leaves out every kind the member may not view', async () => {
    const alpha = await stocked('alpha');

    // Stock only: no products.view, no partners.view.
    const [role] = await db
      .insert(roles)
      .values({
        organizationId: alpha.organizationId,
        name: 'Stock only',
        isSystem: false,
      })
      .returning();
    const rows = await db
      .select()
      .from(permissions)
      .where(inArray(permissions.key, ['stock.view']));
    await db
      .insert(rolePermissions)
      .values(rows.map((p) => ({ roleId: role.id, permissionId: p.id })));
    const member = await addMember(
      app,
      alpha,
      'stock-only@example.com',
      'Stock only',
    );

    const kinds = (await lookup({ agent: member }, 'focus')).map((g) => g.kind);
    expect(kinds).not.toContain('item');

    const lotsOnly = (await lookup({ agent: member }, '2609')).map(
      (g) => g.kind,
    );
    expect(lotsOnly).toEqual(['lot']);
  });

  it('asks for at least two characters, after trimming', async () => {
    const alpha = await registerOrganization(app, 'alpha');

    await alpha.agent.get('/v1/lookup?q=a').expect(400);
    await alpha.agent.get('/v1/lookup?q=%20%20a%20').expect(400);
    await alpha.agent.get(`/v1/lookup?q=${'x'.repeat(101)}`).expect(400);
  });
});
