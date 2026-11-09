import type { INestApplication } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { auditLog } from '../src/database/schema';
import {
  body,
  createE2eApp,
  createPartner,
  createVariant,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

/**
 * CSV exports (ADR-057, step 5): every row the list's filters match, as a
 * file a spreadsheet opens in any language, formula-safe, and audited.
 */
describe('Exports (e2e)', () => {
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

  /** The rows of a CSV, without its BOM, split simply (no quoted commas here). */
  function linesOf(text: string): string[] {
    return text
      .replace(/^\uFEFF/, '')
      .trimEnd()
      .split('\r\n');
  }

  async function twoOrders(org: Org) {
    const variant = await createVariant(org.agent, {
      type: 'good',
      name: 'Focus 60ct',
      variant: { sku: 'FOCUS-60', tracksLots: false },
    });
    const northside = await createPartner(org.agent, { name: 'Northside' });
    const sly = await createPartner(org.agent, { name: '=1+2' });
    for (const [partnerId, reference, expectedAt] of [
      [northside, 'PO-SEP', '2026-09-15'],
      [sly, 'PO-OCT', '2026-10-15'],
    ]) {
      await org.agent
        .post('/v1/orders')
        .send({
          partnerId,
          direction: 'purchase',
          reference,
          expectedAt,
          lines: [{ variantId: variant, quantityOrdered: '3' }],
        })
        .expect(201);
    }
  }

  it('writes every matching order as a CSV a spreadsheet opens', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await twoOrders(alpha);

    const res = await alpha.agent
      .get('/v1/orders/export?status=all&sort=expectedAt')
      .expect(200);

    expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="orders-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    // The byte-order mark, for Excel.
    expect(res.text.startsWith('\uFEFF')).toBe(true);

    const [header, first, second, ...rest] = linesOf(res.text);
    expect(header.split(',').slice(0, 4)).toEqual([
      'Number',
      'Reference',
      'Direction',
      'Status',
    ]);
    // Sorted as asked, every row, quantities as data; ours, then theirs.
    expect(first).toMatch(
      /^PO-\d{6},PO-SEP,purchase,draft,Northside,2026-09-15,1,3/,
    );
    // A partner named like a formula stays text.
    expect(second).toContain(",'=1+2,");
    expect(rest).toEqual([]);
  });

  it('writes its headers in the language asked for', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await twoOrders(alpha);

    const res = await alpha.agent
      .get('/v1/orders/export?status=all')
      .set('Accept-Language', 'zh-Hans')
      .expect(200);

    expect(linesOf(res.text)[0].split(',').slice(0, 4)).toEqual([
      '编号',
      '参考号',
      '方向',
      '状态',
    ]);
  });

  it("keeps to the list's filters, and audits what left", async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await twoOrders(alpha);

    const res = await alpha.agent
      .get('/v1/orders/export?status=all&from=2026-10-01')
      .expect(200);
    expect(linesOf(res.text)).toHaveLength(2);

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, alpha.organizationId),
          eq(auditLog.action, 'list.exported'),
        ),
      );
    expect(entry.payload).toMatchObject({
      list: 'orders',
      rows: 1,
      filters: { status: 'all', from: '2026-10-01' },
    });
  });

  it('writes the catalogue, a row per variant', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await createVariant(alpha.agent, {
      type: 'good',
      name: 'Focus 60ct',
      variant: { sku: 'FOCUS-60', tracksLots: true },
    });

    const lines = linesOf(
      (await alpha.agent.get('/v1/products/export').expect(200)).text,
    );
    expect(lines[0].split(',').slice(0, 2)).toEqual(['SKU', 'Item']);
    expect(lines[1]).toMatch(/^FOCUS-60,Focus 60ct,/);
    expect(lines[1]).toContain(',true,false,');
  });

  it('writes partners with their billing address on one line', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const partner = await createPartner(alpha.agent, {
      name: 'Northside Pharmacy',
      code: 'NORTH',
    });
    await alpha.agent
      .post(`/v1/partners/${partner}/addresses`)
      .send({
        line1: '12 King St',
        city: 'Toronto',
        region: 'ON',
        postalCode: 'M5H 1A1',
        country: 'CA',
        isBilling: true,
      })
      .expect(201);

    const res = await alpha.agent.get('/v1/partners/export').expect(200);
    expect(res.text).toContain(
      'Northside Pharmacy,NORTH,,,false,"12 King St, Toronto, ON, M5H 1A1, CA"',
    );
  });

  // What the list shows, by its own query and in its order (ADR-092,
  // #306's 20), and History keeps the filters but not the search, text a
  // person typed (ADR-018).
  it('writes the items the list shows, by its own query and in its order', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const herbs = body<{ category: { id: string } }>(
      await alpha.agent
        .post('/v1/products/categories')
        .send({ name: 'Herbs' })
        .expect(201),
    ).category.id;
    const added = async (
      name: string,
      sku: string,
      fields: Record<string, unknown> = {},
    ) =>
      body<{ product: { id: string } }>(
        await alpha.agent
          .post('/v1/products')
          .send({ type: 'good', name, variant: { sku }, ...fields })
          .expect(201),
      ).product.id;
    await added('Focus 60ct', 'FOCUS-60');
    const calm = await added('Calm 90ct', 'CALM-90');
    await added('Ashwagandha', 'ASH-1', {
      type: 'material',
      categoryId: herbs,
    });
    await alpha.agent
      .patch(`/v1/products/${calm}`)
      .send({ isActive: false })
      .expect(204);

    const skus = async (query: string) =>
      linesOf(
        (await alpha.agent.get(`/v1/products/export${query}`).expect(200)).text,
      )
        .slice(1)
        .map((line) => line.split(',')[0]);

    expect(await skus('')).toEqual(['ASH-1', 'FOCUS-60']);
    expect(await skus('?search=focus')).toEqual(['FOCUS-60']);
    expect(await skus('?discontinued=only')).toEqual(['CALM-90']);
    expect(await skus('?discontinued=include&order=desc')).toEqual([
      'FOCUS-60',
      'CALM-90',
      'ASH-1',
    ]);
    expect(await skus('?type=material')).toEqual(['ASH-1']);
    expect(await skus(`?category=${herbs}`)).toEqual(['ASH-1']);
    expect(await skus('?category=uncategorised')).toEqual(['FOCUS-60']);
    // The quick filter's old word, before the list hid the discontinued.
    await alpha.agent.get('/v1/products/export?discontinued=true').expect(400);

    const entries = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, alpha.organizationId),
          eq(auditLog.action, 'list.exported'),
        ),
      );
    const filters = entries.map(
      (entry) => (entry.payload as { filters: object }).filters,
    );
    expect(filters).toEqual(
      expect.arrayContaining([
        {},
        { discontinued: 'only' },
        { type: 'material' },
        { categoryId: { id: herbs, label: 'Herbs' } },
        { category: 'uncategorised' },
      ]),
    );
    expect(JSON.stringify(filters)).not.toContain('focus');

    // In words in History: the filters as the list names them.
    const history = await alpha.agent
      .get('/v1/audit?action=list.exported')
      .expect(200);
    const texts = body<{
      entries: { details: { value: { text: string } | null }[] }[];
    }>(history).entries.flatMap((entry) =>
      entry.details.map((detail) => detail.value?.text),
    );
    expect(texts).toEqual(
      expect.arrayContaining([
        'Discontinued Discontinued only',
        'Type Raw materials',
        'Category Herbs',
        'Category Uncategorised',
      ]),
    );
  });

  // The type and the category in the reader's words (ADR-092), and the
  // product's and the variant's names in every language they have one in
  // (#306's 21).
  it('writes the type and the category in the reader’s words, and every language’s names', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const category = async (name: string, parentId?: string) =>
      body<{ category: { id: string } }>(
        await alpha.agent
          .post('/v1/products/categories')
          .send({ name, parentId })
          .expect(201),
      ).category.id;
    const adaptogens = await category('Adaptogens', await category('Herbs'));
    const created = body<{
      product: { id: string; variants: { id: string }[] };
    }>(
      await alpha.agent
        .post('/v1/products')
        .send({
          type: 'material',
          name: 'Ashwagandha',
          categoryId: adaptogens,
          variant: { sku: 'ASH-60', name: '60ct' },
        })
        .expect(201),
    ).product;
    await alpha.agent
      .put(`/v1/products/${created.id}/translations`)
      .send({
        translations: [
          { locale: 'en', name: 'Ashwagandha root' },
          { locale: 'zh-Hans', name: '南非醉茄' },
        ],
      })
      .expect(204);
    await alpha.agent
      .put(
        `/v1/products/${created.id}/variants/${created.variants[0].id}/translations`,
      )
      .send({ translations: [{ locale: 'zh-Hans', name: '60粒' }] })
      .expect(204);

    const [header, row] = linesOf(
      (
        await alpha.agent
          .get('/v1/products/export')
          .set('Accept-Language', 'zh-Hans')
          .expect(200)
      ).text,
    ).map((line) => line.split(','));
    expect(
      Object.fromEntries(header.map((name, at) => [name, row[at]])),
    ).toEqual({
      SKU: 'ASH-60',
      物品: 'Ashwagandha',
      规格: '60ct',
      类型: '原材料',
      分类: 'Herbs › Adaptogens',
      单位: 'each',
      批次管理: 'false',
      已停用: 'false',
      英文名称: 'Ashwagandha root',
      法文名称: '',
      中文名称: '南非醉茄',
      英文规格名称: '',
      法文规格名称: '',
      中文规格名称: '60粒',
    });
  });

  // Past 50,000 rows the refusal names what narrows this list, which has
  // no dates (#306's 38).
  it('refuses past 50,000 rows, naming what narrows the list', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const created = body<{ product: { id: string } }>(
      await alpha.agent
        .post('/v1/products')
        .send({ type: 'good', name: 'Bulk', variant: { sku: 'BULK-0' } })
        .expect(201),
    ).product;
    await db.execute(sql`
      insert into product_variants (organization_id, product_id, sku)
      select ${alpha.organizationId}::uuid, ${created.id}::uuid, 'BULK-' || n
      from generate_series(1, 50000) n
    `);

    const res = await alpha.agent.get('/v1/products/export').expect(400);
    expect(body<{ message: string }>(res).message).toBe(
      'More than 50,000 rows match. Choose a type or a category, or search, and export again.',
    );
    await alpha.agent.get('/v1/products/export?type=material').expect(200);
  });

  it('writes the partners the list shows: its search and Retired', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await createPartner(alpha.agent, { name: 'Northside Pharmacy' });
    const mill = await createPartner(alpha.agent, { name: 'Old Mill Herbs' });
    await alpha.agent
      .patch(`/v1/partners/${mill}`)
      .send({ isActive: false })
      .expect(204);

    const names = async (query: string) =>
      linesOf(
        (await alpha.agent.get(`/v1/partners/export${query}`).expect(200)).text,
      )
        .slice(1)
        .map((line) => line.split(',')[0]);

    expect(await names('')).toEqual(['Northside Pharmacy', 'Old Mill Herbs']);
    expect(await names('?search=north')).toEqual(['Northside Pharmacy']);
    expect(await names('?retired=true')).toEqual(['Old Mill Herbs']);
  });

  it("writes one price list's items, and audits which list left", async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const list = (
      await alpha.agent
        .post('/v1/price-lists')
        .send({ name: 'Wholesale', direction: 'sale', currency: 'CAD' })
        .expect(201)
    ).body as { priceList: { id: string } };

    const res = await alpha.agent
      .get(`/v1/price-lists/${list.priceList.id}/export`)
      .expect(200);
    expect(linesOf(res.text)[0]).toBe('SKU,Item,Unit,Price,Currency');

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, alpha.organizationId),
          eq(auditLog.action, 'list.exported'),
        ),
      );
    expect(entry).toMatchObject({
      resourceType: 'price_list',
      resourceId: list.priceList.id,
    });
  });

  it('writes the audit log, and its own export is an entry in it', async () => {
    const alpha = await registerOrganization(app, 'alpha');

    const res = await alpha.agent.get('/v1/audit/export').expect(200);
    expect(linesOf(res.text)[0].split(',')[0]).toBe('When');

    const entries = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, alpha.organizationId),
          eq(auditLog.action, 'list.exported'),
        ),
      );
    expect(entries.map((entry) => entry.resourceType)).toEqual(['audit']);
  });

  it.each([
    ['/v1/invoices/export', 'Number'],
    ['/v1/credit-notes/export', 'Number'],
    ['/v1/stock/export', 'SKU'],
    ['/v1/stock/movements/export', 'When'],
    ['/v1/stock/reorder-points/export', 'SKU'],
    ['/v1/orders/export', 'Number'],
    ['/v1/products/export', 'SKU'],
    ['/v1/partners/export', 'Name'],
    ['/v1/costs/valuation/export', 'SKU'],
  ])('writes %s, a header alone when nothing matches', async (path, first) => {
    const alpha = await registerOrganization(app, 'alpha');

    const res = await alpha.agent.get(path).expect(200);
    const lines = linesOf(res.text);
    expect(lines).toHaveLength(1);
    expect(lines[0].split(',')[0]).toBe(first);
  });
});
