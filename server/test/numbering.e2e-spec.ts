import type { INestApplication } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import { todayIn } from '../src/common/today';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { auditLog, documentNumbering } from '../src/database/schema';
import {
  addViewer,
  body,
  createE2eApp,
  createPartner,
  createVariant,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';
import { shippedSale } from './utils/sales';
import { clearOfMidnight, KIRITIMATI } from './utils/time-zones';

interface Series {
  prefix: string;
  digits: number;
  reset: 'never' | 'yearly' | 'monthly' | 'daily';
  next?: number;
}

interface Numbering {
  invoice: Series & { next: Record<string, number>; last: string | null };
  creditNote: Series & { next: Record<string, number>; last: string | null };
  returnAuthorization: Series & {
    next: Record<string, number>;
    last: string | null;
  };
  saleOrder: Series & { next: Record<string, number>; last: string | null };
  purchaseOrder: Series & { next: Record<string, number>; last: string | null };
  documentsInDateOrder: boolean;
  today: string;
}

interface Refusal {
  message: string;
  code?: string;
  details?: { series?: string[]; lowest?: number };
}

const DEFAULTS = {
  invoice: { prefix: 'INV-', digits: 6, reset: 'never' },
  creditNote: { prefix: 'CN-', digits: 6, reset: 'never' },
  returnAuthorization: { prefix: 'RMA-', digits: 6, reset: 'never' },
  saleOrder: { prefix: 'SO-', digits: 6, reset: 'never' },
  purchaseOrder: { prefix: 'PO-', digits: 6, reset: 'never' },
} as const;

/** The day before another, YYYY-MM-DD. */
function dayBefore(day: string): string {
  return new Date(Date.parse(day) - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Each organization's document numbering (ADR-073): its settings and who
 * may change them, the numbers they give by period, the refusals that keep
 * one number naming one document, date order, and what else reads the
 * prefixes.
 */
describe('Numbering (e2e)', () => {
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

  async function numbering(org: Org): Promise<Numbering> {
    return body<{ numbering: Numbering }>(
      await org.agent.get('/v1/organization/numbering').expect(200),
    ).numbering;
  }

  /** A save with the defaults, but for the series given. */
  function save(
    org: Org,
    changes: Partial<Record<keyof typeof DEFAULTS, Series>> & {
      documentsInDateOrder?: boolean;
    },
  ) {
    return org.agent.put('/v1/organization/numbering').send({
      ...DEFAULTS,
      documentsInDateOrder: false,
      ...changes,
    });
  }

  /** What one order needs: someone to order from, something to order. */
  async function catalogue(org: Org) {
    const partnerId = await createPartner(org.agent, {
      name: 'Pacific Capsule Supply',
      code: 'PACIFIC',
    });
    const variantId = await createVariant(org.agent, {
      type: 'material',
      name: 'Capsule shells',
      variant: { sku: 'SHELLS' },
    });
    return async (
      direction: 'sale' | 'purchase' = 'sale',
      reference?: string,
    ) =>
      body<{ order: { id: string; number: string } }>(
        await org.agent
          .post('/v1/orders')
          .send({
            partnerId,
            direction,
            ...(reference ? { reference } : {}),
            lines: [{ variantId, quantityOrdered: '10' }],
          })
          .expect(201),
      ).order;
  }

  /**
   * Draft invoices, as many as asked (up to five): one sale shipped in
   * parts, an invoice per shipment, everything an invoice needs to issue.
   */
  async function drafts(org: Org, count: number): Promise<string[]> {
    await org.agent
      .put('/v1/organization/address')
      .send({ line1: '100 Main St', country: 'CA' })
      .expect(204);
    await org.agent
      .patch('/v1/organization')
      .send({ taxRegistrationNumber: '123456789 RT0001' })
      .expect(204);
    const gst = body<{ taxCode: { id: string } }>(
      await org.agent
        .post('/v1/tax-codes')
        .send({ name: 'GST', components: [{ name: 'GST', rate: '5' }] })
        .expect(201),
    ).taxCode.id;
    const partnerId = await createPartner(org.agent, {
      name: 'Northside Pharmacy',
      code: 'NORTH',
    });
    await org.agent
      .post(`/v1/partners/${partnerId}/addresses`)
      .send({
        line1: '9 Harbour Rd',
        country: 'CA',
        isBilling: true,
        isDefault: true,
      })
      .expect(201);
    const sale = await shippedSale(org.agent, { partnerId });

    const shipments = [sale.shipmentId];
    while (shipments.length < count) {
      shipments.push(
        body<{ shipment: { id: string } }>(
          await org.agent
            .post(`/v1/orders/${sale.orderId}/shipments`)
            .send({
              fromLocationId: sale.shelf,
              lines: [{ lineId: sale.capsulesLine, quantity: '1' }],
            })
            .expect(201),
        ).shipment.id,
      );
    }

    const ids: string[] = [];
    for (const shipmentId of shipments) {
      ids.push(
        body<{ invoice: { id: string } }>(
          await org.agent
            .post('/v1/invoices')
            .send({ shipmentId, taxCodeId: gst })
            .expect(201),
        ).invoice.id,
      );
    }
    return ids;
  }

  async function issue(org: Org, id: string, invoiceDate: string) {
    return body<{ invoice: { number: string } }>(
      await org.agent
        .post(`/v1/invoices/${id}/issue`)
        .send({ invoiceDate })
        .expect(200),
    ).invoice.number;
  }

  describe('the settings', () => {
    it('start as today’s numbers, a row per series from registration', async () => {
      const org = await registerOrganization(app, 'alpha');

      const rows = await db
        .select()
        .from(documentNumbering)
        .where(eq(documentNumbering.organizationId, org.organizationId));
      expect(rows).toHaveLength(5);

      const shown = await numbering(org);
      expect(shown.invoice).toMatchObject({
        prefix: 'INV-',
        digits: 6,
        reset: 'never',
        next: { never: 1, yearly: 1, monthly: 1, daily: 1 },
        last: null,
      });
      expect(shown.purchaseOrder.prefix).toBe('PO-');
      expect(shown.documentsInDateOrder).toBe(false);
      expect(shown.today).toBe(todayIn('UTC'));
    });

    it('are read by every member and changed only with organizations.update', async () => {
      const org = await registerOrganization(app, 'alpha');
      const viewer = await addViewer(app, org, 'viewer@alpha.example.com');

      await viewer.get('/v1/organization/numbering').expect(200);
      await viewer
        .put('/v1/organization/numbering')
        .send({ ...DEFAULTS, documentsInDateOrder: false })
        .expect(403);
    });

    it('logs a change with each series as it stood', async () => {
      const org = await registerOrganization(app, 'alpha');

      await save(org, {
        saleOrder: { prefix: 'XS-', digits: 4, reset: 'never' },
      }).expect(204);

      const [entry] = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.organizationId, org.organizationId),
            eq(auditLog.action, 'organization.numbering_updated'),
          ),
        )
        .orderBy(desc(auditLog.createdAt));
      const payload = entry.payload as Record<
        string,
        { from: unknown; to: unknown }
      >;
      expect(payload.saleOrder).toEqual({
        from: { prefix: 'SO-', digits: 6, reset: 'never' },
        to: { prefix: 'XS-', digits: 4, reset: 'never' },
      });
    });

    it('refuses a prefix of the wrong form, naming the series', async () => {
      const org = await registerOrganization(app, 'alpha');

      for (const invoice of [
        { prefix: 'inv-', digits: 6, reset: 'never' },
        { prefix: 'INV-{YYYY}', digits: 6, reset: 'never' },
        { prefix: 'INV-', digits: 6, reset: 'yearly' },
        { prefix: 'ABCDEFGHIJKLMNO-', digits: 6, reset: 'never' },
      ] as const) {
        const res = await save(org, { invoice }).expect(400);
        expect(body<Refusal>(res).message).toMatch(/^The invoice prefix /);
      }
    });

    it('refuses two series that could print the same numbers', async () => {
      const org = await registerOrganization(app, 'alpha');

      const same = await save(org, {
        purchaseOrder: { prefix: 'SO-', digits: 6, reset: 'never' },
      }).expect(409);
      expect(body<Refusal>(same)).toMatchObject({
        code: 'numbering_prefix_shared',
        details: { series: ['sale_order', 'purchase_order'] },
        message:
          'Sale orders and purchase orders would print the same numbers. Give each its own prefix.',
      });

      // S{YY}- prints S26- in 2026, so it clashes with S26- typed out.
      const year = (await numbering(org)).today.slice(2, 4);
      await save(org, {
        invoice: { prefix: 'S{YY}-', digits: 6, reset: 'yearly' },
        creditNote: { prefix: `S${year}-`, digits: 6, reset: 'never' },
      }).expect(409);
    });
  });

  describe('numbers by the settings', () => {
    it('gives an order its series’ number, by the day it is made', async () => {
      const org = await registerOrganization(app, 'alpha');
      const order = await catalogue(org);
      const year = (await numbering(org)).today.slice(0, 4);

      await save(org, {
        saleOrder: { prefix: 'SO-{YYYY}-', digits: 4, reset: 'yearly' },
      }).expect(204);

      expect((await order()).number).toBe(`SO-${year}-0001`);
      expect((await order()).number).toBe(`SO-${year}-0002`);
      expect((await order('purchase')).number).toBe('PO-000001');

      const shown = await numbering(org);
      expect(shown.saleOrder.last).toBe(`SO-${year}-0002`);
      expect(shown.saleOrder.next.yearly).toBe(3);
    });

    it('takes the day in the organization’s zone', async () => {
      const org = await registerOrganization(app, 'alpha');
      const order = await catalogue(org);
      await org.agent
        .patch('/v1/organization')
        .send({ timeZone: KIRITIMATI })
        .expect(204);
      await save(org, {
        saleOrder: { prefix: 'XS{YYYY}{MM}{DD}-', digits: 3, reset: 'daily' },
      }).expect(204);

      await clearOfMidnight([KIRITIMATI]);
      const day = todayIn(KIRITIMATI).replaceAll('-', '');
      expect((await order()).number).toBe(`XS${day}-001`);
    });

    it('keeps an earlier year’s prefix for a backdated invoice', async () => {
      const org = await registerOrganization(app, 'alpha');
      const [a, b, c, d] = await drafts(org, 4);
      const today = (await numbering(org)).today;
      const year = today.slice(0, 4);
      const lastYear = String(Number(year) - 1);

      await save(org, {
        invoice: { prefix: 'INV-{YYYY}-', digits: 4, reset: 'yearly' },
      }).expect(204);

      expect(await issue(org, a, `${lastYear}-12-30`)).toBe(
        `INV-${lastYear}-0001`,
      );
      expect(await issue(org, b, today)).toBe(`INV-${year}-0001`);

      // A new prefix applies from this year on.
      await save(org, {
        invoice: { prefix: 'F{YYYY}-', digits: 4, reset: 'yearly' },
      }).expect(204);

      // Last year goes on as it was, so the backdated invoice reads like
      // the rest of its year; this year continues under the new prefix.
      expect(await issue(org, c, `${lastYear}-12-31`)).toBe(
        `INV-${lastYear}-0002`,
      );
      expect(await issue(org, d, today)).toBe(`F${year}-0002`);
    });
  });

  describe('a save while numbers are taken', () => {
    it('lands wholly before an issue or wholly after it', async () => {
      const org = await registerOrganization(app, 'alpha');
      const [a, b] = await drafts(org, 2);
      const today = (await numbering(org)).today;

      const [issued] = await Promise.all([
        issue(org, a, today),
        save(org, {
          invoice: { prefix: 'F-', digits: 6, reset: 'never' },
        }).expect(204),
      ]);

      // Before the save, it took INV-; after, F-. Never a mix, and either
      // way the counter carries on under the new prefix.
      expect(['INV-000001', 'F-000001']).toContain(issued);
      expect(await issue(org, b, today)).toBe('F-000002');
    });
  });

  describe('numbers already given', () => {
    it('refuses a next number a document already carries, by value', async () => {
      const org = await registerOrganization(app, 'alpha');
      const order = await catalogue(org);
      for (let i = 0; i < 3; i++) await order();

      const taken = await save(org, {
        saleOrder: { prefix: 'SO-', digits: 6, reset: 'never', next: 2 },
      }).expect(409);
      expect(body<Refusal>(taken)).toMatchObject({
        code: 'numbering_number_taken',
        details: { series: ['sale_order'], lowest: 4 },
        message:
          'SO-000003 is already a sale order. Under SO-, the next number must be 4 or more.',
      });

      // SO-0003 is 3 as much as SO-000003 is.
      await save(org, {
        saleOrder: { prefix: 'SO-', digits: 4, reset: 'never', next: 3 },
      }).expect(409);
    });

    it('refuses going below the numbers given while the prefix is in use', async () => {
      const org = await registerOrganization(app, 'alpha');
      const order = await catalogue(org);
      await order();

      await save(org, {
        saleOrder: { prefix: 'SO-', digits: 6, reset: 'never', next: 10 },
      }).expect(204);

      const lower = await save(org, {
        saleOrder: { prefix: 'SO-', digits: 6, reset: 'never', next: 5 },
      }).expect(409);
      expect(body<Refusal>(lower)).toMatchObject({
        code: 'numbering_number_taken',
        details: { lowest: 10 },
        message:
          'Numbers up to SO-000009 have been given. Under SO-, the next number must be 10 or more.',
      });
    });

    it('starts again by hand under a prefix no document carries', async () => {
      const org = await registerOrganization(app, 'alpha');
      const order = await catalogue(org);
      for (let i = 0; i < 3; i++) await order();

      await save(org, {
        saleOrder: { prefix: 'XS-', digits: 6, reset: 'never', next: 1 },
      }).expect(204);
      expect((await order()).number).toBe('XS-000001');

      // Changing the prefix alone carries the counter on.
      await save(org, {
        saleOrder: { prefix: 'S-', digits: 6, reset: 'never' },
      }).expect(204);
      expect((await order()).number).toBe('S-000002');
    });

    it('counts every kind of document, not only the series’ own', async () => {
      const org = await registerOrganization(app, 'alpha');
      const order = await catalogue(org);
      for (let i = 0; i < 3; i++) await order();

      // Sale orders move away from SO-; purchase orders may not take it
      // back from 1 while SO-000003 exists.
      const res = await save(org, {
        saleOrder: { prefix: 'XS-', digits: 6, reset: 'never' },
        purchaseOrder: { prefix: 'SO-', digits: 6, reset: 'never', next: 1 },
      }).expect(409);
      expect(body<Refusal>(res).details).toEqual({
        series: ['purchase_order'],
        lowest: 4,
      });
    });
  });

  describe('date order', () => {
    it('refuses an invoice dated before the latest, and gives its number back', async () => {
      const org = await registerOrganization(app, 'alpha');
      const [a, b, c] = await drafts(org, 3);
      const today = (await numbering(org)).today;

      await save(org, { documentsInDateOrder: true }).expect(204);
      expect(await issue(org, a, today)).toBe('INV-000001');

      const refused = await org.agent
        .post(`/v1/invoices/${b}/issue`)
        .send({ invoiceDate: dayBefore(today) })
        .expect(409);
      expect(body<Refusal>(refused)).toMatchObject({
        code: 'numbering_date_order',
        message: `Invoices are kept in date order, and INV-000001 is dated ${today}. Date this one ${today} or later.`,
      });

      expect(await issue(org, c, today)).toBe('INV-000002');
    });

    it('lets two issues at once give numbers in date order', async () => {
      const org = await registerOrganization(app, 'alpha');
      const [a, b] = await drafts(org, 2);
      const today = (await numbering(org)).today;
      const yesterday = dayBefore(today);
      await save(org, { documentsInDateOrder: true }).expect(204);

      await Promise.all([
        org.agent.post(`/v1/invoices/${a}/issue`).send({ invoiceDate: today }),
        org.agent
          .post(`/v1/invoices/${b}/issue`)
          .send({ invoiceDate: yesterday }),
      ]);

      const issued = await Promise.all(
        [a, b].map(async (id) =>
          body<{ invoice: { number: string | null; invoiceDate: string } }>(
            await org.agent.get(`/v1/invoices/${id}`).expect(200),
          ),
        ),
      );
      const numbered = issued
        .map(({ invoice }) => invoice)
        .filter((invoice) => invoice.number !== null)
        .sort((x, y) => x.number!.localeCompare(y.number!));
      for (let i = 1; i < numbered.length; i++) {
        expect(numbered[i].invoiceDate >= numbered[i - 1].invoiceDate).toBe(
          true,
        );
      }
    });

    it('lets a backdated invoice through when the switch is off', async () => {
      const org = await registerOrganization(app, 'alpha');
      const [a, b] = await drafts(org, 2);
      const today = (await numbering(org)).today;

      expect(await issue(org, a, today)).toBe('INV-000001');
      expect(await issue(org, b, dayBefore(today))).toBe('INV-000002');
    });
  });

  describe('what else reads the prefixes', () => {
    it('puts the kind a query’s prefix names first in the lookup', async () => {
      const org = await registerOrganization(app, 'alpha');
      const [a] = await drafts(org, 1);
      const order = await catalogue(org);

      await save(org, {
        invoice: { prefix: 'QX-', digits: 6, reset: 'never' },
      }).expect(204);
      const number = await issue(org, a, (await numbering(org)).today);
      expect(number).toBe('QX-000001');
      // An order whose reference is the same text, found first otherwise.
      await order('sale', 'QX-000001');

      const groups = body<{ groups: { kind: string }[] }>(
        await org.agent.get('/v1/lookup?q=QX-000001').expect(200),
      ).groups;
      expect(groups.map((group) => group.kind).slice(0, 2)).toEqual([
        'invoice',
        'order',
      ]);
    });

    it('writes / as _ in a document’s file name', async () => {
      const org = await registerOrganization(app, 'alpha');
      const order = await catalogue(org);
      const year = (await numbering(org)).today.slice(0, 4);

      await save(org, {
        purchaseOrder: { prefix: 'PO/{YYYY}/', digits: 4, reset: 'yearly' },
      }).expect(204);
      const po = await order('purchase');
      expect(po.number).toBe(`PO/${year}/0001`);

      const pdf = await org.agent
        .get(`/v1/orders/${po.id}/pdf`)
        .responseType('blob')
        .expect(200);
      expect(pdf.headers['content-disposition']).toMatch(
        new RegExp(`filename="PO_${year}_0001\\.pdf"`),
      );
    });
  });
});
