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

  it.each([
    ['/v1/invoices/export', 'Number'],
    ['/v1/credit-notes/export', 'Number'],
    ['/v1/stock/export', 'SKU'],
    ['/v1/stock/movements/export', 'When'],
    ['/v1/orders/export', 'Reference'],
  ])('writes %s, a header alone when nothing matches', async (path, first) => {
    const alpha = await registerOrganization(app, 'alpha');

    const res = await alpha.agent.get(path).expect(200);
    const lines = linesOf(res.text);
    expect(lines).toHaveLength(1);
    expect(lines[0].split(',')[0]).toBe(first);
  });
});
