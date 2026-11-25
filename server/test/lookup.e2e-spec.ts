import type { INestApplication } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import sharp from 'sharp';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { permissions, rolePermissions, roles } from '../src/database/schema';
import {
  addMember,
  body,
  correctedLot,
  createE2eApp,
  createLocation,
  createPartner,
  createVariant,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';
import { captureStatements, type SentStatement } from './utils/statements';

interface LookupResponse {
  groups: {
    kind: string;
    results: {
      id: string;
      title: string;
      detail: string | null;
      status: string | null;
      direction: string | null;
      fulfillment: string | null;
      expiresAt: string | null;
      expiry: string | null;
      supplierLot: string | null;
      isAssigned: boolean | null;
      formerCode: string | null;
      coverFileId: string | null;
      type: string | null;
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

  // A lot made here keeps the supplier's lot beside its code: either
  // finds it, the start of either first, and exactly either puts Lots
  // first; its row carries what its second line says (#618).
  it('finds a lot by its supplier’s lot as by its code, exactly either putting lots first, with its expiry and its marks (ADR-094, R6)', async () => {
    const alpha = await stocked('alpha');
    const back = await createLocation(alpha.agent, {
      type: 'site',
      name: 'Back',
    });
    const calm = await createVariant(alpha.agent, {
      type: 'good',
      name: 'Calm 30ct',
      variant: { sku: 'CALM-30', tracksLots: true },
    });
    const receipt = async (lot: Record<string, unknown>) =>
      body<{ lotCode: string }>(
        await alpha.agent
          .post('/v1/stock/movements')
          .send({
            variantId: calm,
            toLocationId: back,
            quantity: '5',
            reason: 'receipt',
            lot,
          })
          .expect(201),
      ).lotCode;
    const made = await receipt({
      makeCode: true,
      supplierLot: 'Hx-2609',
      expiry: 'unknown',
    });
    const toAdd = await receipt({ makeCode: true, expiresAt: '2099-01-01' });
    // Newer, so it would come first among equals: the middle of a code.
    await receipt({ code: 'ZZ-HX-26' });
    // An order found by its partner's name, a kind listed before Lots.
    const partnerId = await createPartner(alpha.agent, {
      name: 'HX-2609 Supplies',
    });
    await alpha.agent
      .post('/v1/orders')
      .send({
        partnerId,
        direction: 'purchase',
        lines: [{ variantId: calm, quantityOrdered: '1' }],
      })
      .expect(201);

    const exact = await lookup(alpha, 'hx-2609');
    expect(exact.map((group) => group.kind)).toEqual([
      'lot',
      'order',
      'partner',
    ]);
    expect(exact[0].results.filter((result) => !result.close)).toEqual([
      expect.objectContaining({
        title: made,
        detail: 'CALM-30',
        expiresAt: null,
        expiry: 'unknown',
        supplierLot: 'Hx-2609',
        isAssigned: true,
      }),
    ]);
    expect(exact[2].results[0]).toMatchObject({
      expiry: null,
      supplierLot: null,
      isAssigned: null,
    });

    // The start of the supplier's lot before the middle of a code.
    expect(
      (await lookup(alpha, 'HX-26'))
        .find((group) => group.kind === 'lot')
        ?.results.filter((result) => !result.close)
        .map((result) => result.title),
    ).toEqual([made, 'ZZ-HX-26']);

    // A code made here with none to show says so; a printed one has none
    // to add.
    const lotOf = async (q: string) =>
      (await lookup(alpha, q)).find((group) => group.kind === 'lot')
        ?.results[0];
    expect(await lotOf(toAdd)).toMatchObject({
      title: toAdd,
      expiresAt: '2099-01-01',
      expiry: 'date',
      supplierLot: null,
      isAssigned: true,
    });
    expect(await lotOf('BF-2609')).toMatchObject({
      title: 'BF-2609',
      expiry: 'none',
      supplierLot: null,
      isAssigned: false,
    });
  });

  // A lot is found by a code it had before Edit lot details corrected it,
  // as by its own: any part of it, typed whole as exact, after a lot whose
  // code it is today; the hit says which, and a close match reads today's
  // code alone (ADR-094 amended, R9, R10, F8).
  it('finds a lot by a former code, whole or in part, saying which, after a lot whose code it is today (R10)', async () => {
    const alpha = await stocked('alpha');
    const shelf = await createLocation(alpha.agent, {
      type: 'site',
      name: 'Back',
    });
    const ash = await createVariant(alpha.agent, {
      type: 'good',
      name: 'Ashwagandha 60ct',
      variant: { sku: 'ASH-60CT', tracksLots: true },
    });
    const calm = await createVariant(alpha.agent, {
      type: 'good',
      name: 'Calm 30ct',
      variant: { sku: 'CALM-30', tracksLots: true },
    });
    const corrected = await correctedLot(alpha.agent, {
      variantId: ash,
      toLocationId: shelf,
      from: 'ASH-06O1',
      to: 'ASH-0601',
    });
    const receive = (variantId: string, code: string) =>
      alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId,
          toLocationId: shelf,
          quantity: '5',
          reason: 'receipt',
          lot: { code },
        })
        .expect(201);
    // Another item's lot whose code it is today, and a lot starting with it.
    await receive(calm, 'ASH-06O1');
    await receive(ash, 'ASH-06O1-B');

    const lotsFor = async (q: string) =>
      (await lookup(alpha, q))
        .find((group) => group.kind === 'lot')
        ?.results.filter((result) => !result.close)
        .map(({ id, title, detail, formerCode }) => ({
          id,
          title,
          detail,
          formerCode,
        }));

    expect(await lotsFor('ash-06o1')).toEqual([
      expect.objectContaining({
        title: 'ASH-06O1',
        detail: 'CALM-30',
        formerCode: null,
      }),
      {
        id: corrected,
        title: 'ASH-0601',
        detail: 'ASH-60CT',
        formerCode: 'ASH-06O1',
      },
      expect.objectContaining({ title: 'ASH-06O1-B', formerCode: null }),
    ]);
    // Any part of it, as of a code today.
    expect(await lotsFor('6O1')).toContainEqual({
      id: corrected,
      title: 'ASH-0601',
      detail: 'ASH-60CT',
      formerCode: 'ASH-06O1',
    });
    // Found by its code today too: no "was" to explain it.
    expect(await lotsFor('ASH-06')).toContainEqual({
      id: corrected,
      title: 'ASH-0601',
      detail: 'ASH-60CT',
      formerCode: null,
    });
  });

  // #546: an item's result carries its type, for its icon where it has
  // no cover, as Items draws it; other kinds none.
  it("names an item's type, and none for other kinds", async () => {
    const alpha = await stocked('alpha');
    await createVariant(alpha.agent, {
      type: 'material',
      name: 'Focus blend',
      variant: { sku: 'FOCUS-BLEND' },
    });

    const items = (await lookup(alpha, 'focus')).find(
      (group) => group.kind === 'item',
    )?.results;
    expect(
      Object.fromEntries(items?.map((item) => [item.detail, item.type]) ?? []),
    ).toEqual({ 'FOCUS-60': 'good', 'FOCUS-BLEND': 'material' });

    const lots = (await lookup(alpha, 'BF-2609')).find(
      (group) => group.kind === 'lot',
    );
    expect(lots?.results.every((result) => result.type === null)).toBe(true);
  });

  // ADR-066: an item's result carries its product's cover; others none.
  it("shows an item's cover, and none for other kinds", async () => {
    const alpha = await stocked('alpha');
    const [product] = body<{ entries: { id: string; displayName: string }[] }>(
      await alpha.agent.get('/v1/products').expect(200),
    ).entries.filter((row) => row.displayName === 'Focus 60ct');
    const photo = await sharp({
      create: { width: 400, height: 400, channels: 3, background: '#2a6' },
    })
      .jpeg()
      .toBuffer();
    const fileId = body<{ file: { id: string } }>(
      await alpha.agent
        .post('/v1/files/product-image')
        .attach('file', photo, 'focus.jpg')
        .expect(201),
    ).file.id;
    await alpha.agent
      .post(`/v1/products/${product.id}/images`)
      .send({ fileId })
      .expect(201);

    const groups = await lookup(alpha, 'focus-60');
    const item = groups.find((group) => group.kind === 'item')?.results[0];
    expect(item?.coverFileId).toBe(fileId);

    const lots = (await lookup(alpha, 'BF-2609')).find(
      (group) => group.kind === 'lot',
    );
    expect(lots?.results.every((result) => result.coverFileId === null)).toBe(
      true,
    );
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

  // #308's 12: a typo is a search that finds next to nothing. Four
  // partners named as typed leave room for an item whose name is a close
  // match; a fifth partner fills the lookup, and no kind is asked for a
  // close match at all.
  it('adds no close match once five records match as typed (#308’s 12)', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await createVariant(alpha.agent, {
      type: 'good',
      name: 'Harbor Tea',
      variant: { sku: 'TEA-1', tracksLots: false },
    });
    for (const name of [
      'Harbour',
      'Harbour North',
      'Harbour South',
      'Harbour East',
    ]) {
      await createPartner(alpha.agent, { name });
    }
    const everything = async () =>
      (await lookup(alpha, 'harbour')).flatMap((group) => group.results);

    expect(await everything()).toContainEqual(
      expect.objectContaining({ title: 'Harbor Tea', close: true }),
    );

    await createPartner(alpha.agent, { name: 'Harbour West' });
    const results = await everything();
    expect(results).toHaveLength(5);
    expect(results.every((result) => !result.close)).toBe(true);
  });

  // ADR-051's amendment for #225 and #276: an order's partner arm is an
  // array of the matching partners' ids. None matches a number, and the
  // empty array must not hide the order its number finds, in either pass.
  it('finds an order by its number when no partner matches, exactly or by a typo', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const partnerId = await createPartner(alpha.agent, {
      name: 'Acme Supplies',
    });
    const variantId = await createVariant(alpha.agent, {
      type: 'good',
      name: 'Widget',
      variant: { sku: 'WIDGET-1', tracksLots: false },
    });
    await alpha.agent
      .post('/v1/orders')
      .send({
        partnerId,
        direction: 'purchase',
        lines: [{ variantId, quantityOrdered: '10' }],
      })
      .expect(201);

    const orderFound = async (q: string) =>
      (await lookup(alpha, q)).find((group) => group.kind === 'order')?.results;

    expect(await orderFound('PO-000001')).toEqual([
      expect.objectContaining({ title: 'PO-000001', close: false }),
    ]);
    // A zero short, so nothing exact: the close pass finds it.
    expect(await orderFound('PO-00001')).toEqual([
      expect.objectContaining({ title: 'PO-000001', close: true }),
    ]);
  });

  // 126: Movements' find box says an order's state in words, as Orders
  // does: its direction and how much of it has come, none for other kinds.
  it("says an order's direction and how much of it has come, and neither for other kinds", async () => {
    const alpha = await stocked('alpha');
    const shelf = await createLocation(alpha.agent, {
      type: 'site',
      name: 'Shelf A',
    });
    const partnerId = await createPartner(alpha.agent, {
      name: 'Lakeshore Packaging',
    });
    const variantId = await createVariant(alpha.agent, {
      type: 'good',
      name: 'Widget',
      variant: { sku: 'WIDGET-1', tracksLots: false },
    });
    const order = body<{ order: { id: string; lines: { id: string }[] } }>(
      await alpha.agent
        .post('/v1/orders')
        .send({
          partnerId,
          direction: 'purchase',
          lines: [{ variantId, quantityOrdered: '10' }],
        })
        .expect(201),
    ).order;
    await alpha.agent
      .patch(`/v1/orders/${order.id}`)
      .send({ status: 'confirmed' })
      .expect(204);
    await alpha.agent
      .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
      .send({ toLocationId: shelf, quantity: '4' })
      .expect(201);

    const orders = (await lookup(alpha, 'PO-000001')).find(
      (group) => group.kind === 'order',
    )?.results;
    expect(orders).toEqual([
      expect.objectContaining({
        title: 'PO-000001',
        detail: 'Lakeshore Packaging',
        status: 'confirmed',
        direction: 'purchase',
        fulfillment: 'part',
      }),
    ]);

    const lots = (await lookup(alpha, 'BF-2609')).find(
      (group) => group.kind === 'lot',
    )?.results;
    expect(
      lots?.every(
        (result) => result.direction === null && result.fulfillment === null,
      ),
    ).toBe(true);
  });

  // ADR-051's amendment for #225: each pass is one statement, its kinds
  // joined by union all. A typo that finds nothing exact, for the Owner, who
  // sees all eight kinds, sent up to eighteen: the threshold setting, then
  // each kind's exact and close matches one after another. Now the setting,
  // the exact pass, the close pass and the prefixes, four at most.
  it('sends a typo in four statements at most, one a pass', async () => {
    const alpha = await stocked('alpha');
    await createPartner(alpha.agent, { name: 'Focus Health' });

    const { result: groups, statements: sent } = await captureStatements(() =>
      lookup(alpha, 'fokus'),
    );
    const statements = lookupStatements(sent);

    // Close matches in two kinds, so the prefixes are read too.
    expect(groups.map((group) => group.kind)).toEqual(['item', 'partner']);
    expect(groups.flatMap((group) => group.results).every((r) => r.close)).toBe(
      true,
    );
    expect(statements[0]).toContain('pg_trgm.word_similarity_threshold');
    expect(statements.length).toBeLessThanOrEqual(4);
  });

  // Each kind's branch of the one statement keeps its own order and limit.
  it("brings five of each kind that matches more, in each kind's order", async () => {
    const alpha = await registerOrganization(app, 'alpha');
    // Made one after another, so the newest come first among equals.
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await createVariant(alpha.agent, {
        type: 'good',
        name: `Tea ${n}`,
        variant: { sku: `HARBOUR-${n}`, tracksLots: false },
      });
    }
    for (const name of [
      'Harbour',
      'Harbour North',
      'Harbour South',
      'Harbour East',
      'Harbour West',
      'Old Harbour',
    ]) {
      await createPartner(alpha.agent, { name });
    }

    const groups = await lookup(alpha, 'harbour');
    expect(groups.map((group) => group.kind)).toEqual(['item', 'partner']);
    // Each SKU starts with the search, so the newest five.
    expect(titles(groups, 'item')).toEqual([
      'Tea 6',
      'Tea 5',
      'Tea 4',
      'Tea 3',
      'Tea 2',
    ]);
    // The exact name, then those that start with it, newest first; Old
    // Harbour, the newest of all but a match anywhere, is the sixth.
    expect(titles(groups, 'partner')).toEqual([
      'Harbour',
      'Harbour West',
      'Harbour East',
      'Harbour South',
      'Harbour North',
    ]);
  });

  it("never finds another organization's records", async () => {
    await stocked('alpha');
    const beta = await registerOrganization(app, 'beta');

    expect(await lookup(beta, '2609')).toEqual([]);
    expect(await lookup(beta, 'focus')).toEqual([]);
  });

  // #186: every join carries the organization, so each finds its own
  // records through it, and none of a twin's with the same names and codes.
  it("finds its own records through each join, none of a twin organization's", async () => {
    const results = async (org: Org, q: string, kind: string) =>
      (await lookup(org, q)).find((group) => group.kind === kind)?.results ??
      [];

    const found = async (org: Org) => {
      const [partner] = await results(org, 'Northside', 'partner');
      const [item] = await results(org, 'focus-60', 'item');
      await org.agent
        .post('/v1/orders')
        .send({
          partnerId: partner.id,
          direction: 'purchase',
          reference: 'REF-186',
          lines: [{ variantId: item.id, quantityOrdered: '10' }],
        })
        .expect(201);

      return {
        orders: await results(org, 'Northside', 'order'),
        partners: await results(org, 'Northside', 'partner'),
        items: await results(org, 'focus-60', 'item'),
        lots: await results(org, 'BF-2609', 'lot'),
      };
    };
    const ids = (records: Awaited<ReturnType<typeof found>>) =>
      Object.values(records).flatMap((rows) => rows.map((row) => row.id));

    const alpha = await found(await stocked('alpha'));
    const beta = await found(await stocked('beta'));

    for (const records of [alpha, beta]) {
      expect(records.orders).toEqual([
        expect.objectContaining({ detail: 'Northside Pharmacy', close: false }),
      ]);
      expect(records.partners.map((row) => row.title)).toEqual([
        'Northside Pharmacy',
      ]);
      expect(records.items).toEqual([
        expect.objectContaining({ title: 'Focus 60ct', detail: 'FOCUS-60' }),
      ]);
      expect(records.lots.map((row) => [row.title, row.detail])).toEqual([
        ['BF-2609', 'FOCUS-60'],
        ['BF-2609-B', 'FOCUS-60'],
      ]);
    }
    expect(ids(alpha).filter((id) => ids(beta).includes(id))).toEqual([]);
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

  it('asks for at least two characters, or one Chinese character, after trimming', async () => {
    const alpha = await registerOrganization(app, 'alpha');

    await alpha.agent.get('/v1/lookup?q=a').expect(400);
    await alpha.agent.get('/v1/lookup?q=%20%20a%20').expect(400);
    await alpha.agent
      .get(`/v1/lookup?q=${encodeURIComponent('，')}`)
      .expect(400);
    await alpha.agent.get(`/v1/lookup?q=${'x'.repeat(101)}`).expect(400);
    await alpha.agent
      .get(`/v1/lookup?q=${encodeURIComponent(' 鱼 ')}`)
      .expect(200);
  });

  it('finds an item by one Chinese character of its name', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await createVariant(alpha.agent, {
      type: 'good',
      name: '深海鱼油',
      variant: { sku: 'OIL-90', tracksLots: false },
    });

    expect(titles(await lookup(alpha, '鱼'), 'item')).toEqual(['深海鱼油']);
  });

  // The ranking Products and the pickers share (item-search's itemRank).
  it("ranks an exact match on the reader's name for an item first", async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { product } = body<{ product: { id: string } }>(
      await alpha.agent
        .post('/v1/products')
        .send({
          type: 'good',
          name: 'Focus',
          variant: { sku: 'FOCUS-60', tracksLots: false },
        })
        .expect(201),
    );
    await alpha.agent
      .put(`/v1/products/${product.id}/translations`)
      .send({ translations: [{ locale: 'zh-Hans', name: '专注胶囊' }] })
      .expect(204);
    // Made second, so the newer, which comes first among equals.
    await createVariant(alpha.agent, {
      type: 'good',
      name: '安神专注胶囊',
      variant: { sku: 'CALM-60', tracksLots: false },
    });

    for (const q of ['专注胶囊', 'zhuanzhujiaonang']) {
      const groups = body<LookupResponse>(
        await alpha.agent
          .get(`/v1/lookup?q=${encodeURIComponent(q)}`)
          .set('Accept-Language', 'zh-Hans')
          .expect(200),
      ).groups;
      expect(titles(groups, 'item')).toEqual(['专注胶囊', '安神专注胶囊']);
    }
  });
});

/**
 * The statements one lookup sent, of all a request sent: on the connection
 * whose transaction set the close-match threshold, from that setting up to
 * its commit. Begin and commit are the transaction's own, not the lookup's
 * statements.
 */
function lookupStatements(sent: SentStatement[]): string[] {
  const start = sent.findIndex(({ text }) =>
    text.includes('pg_trgm.word_similarity_threshold'),
  );
  if (start < 0) return [];

  const statements: string[] = [];
  for (const { text, client } of sent.slice(start)) {
    if (client !== sent[start].client) continue;
    if (/^\s*commit\b/i.test(text)) break;
    statements.push(text);
  }
  return statements;
}
