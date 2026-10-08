import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { auditLog } from '../src/database/schema';
import {
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
      'Reference',
      'Direction',
      'Status',
      'Partner',
    ]);
    // Sorted as asked, every row, quantities as data.
    expect(first).toMatch(/^PO-SEP,purchase,draft,Northside,2026-09-15,1,3/);
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
      '参考号',
      '方向',
      '状态',
      '合作伙伴',
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
    ['/v1/orders/export', 'Reference'],
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
