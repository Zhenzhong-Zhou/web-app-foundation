import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { auditLog, invoices, roles } from '../src/database/schema';
import {
  body,
  createE2eApp,
  createLocation,
  createVariant,
  PASSWORD,
  registerOrganization,
} from './utils/fixtures';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface Credit {
  subtotal: string;
  taxTotal: string;
  total: string;
  taxes: { name: string; amount: string }[];
  lines: {
    sku: string;
    quantity: string;
    unitPrice: string;
    netAmount: string;
  }[];
}

/**
 * Credit notes against part of an invoice (ADR-047). The claims: a credit
 * is at the invoice's price or less, never more value than a line billed,
 * never more tax than the invoice charged, and never more than an RMA line
 * authorized; and what the preview shows is what issuing stores.
 *
 * Every case starts from one issued invoice: 6 capsules and 5 scoops at
 * 12.50 CAD with GST 5% — 75.00 + 62.50 = 137.50, GST 6.88, total 144.38.
 */
describe('Credit notes (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  const TODAY = '2026-09-25';

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

  async function addMember(org: Org, email: string, roleName: string) {
    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(
          eq(roles.organizationId, org.organizationId),
          eq(roles.name, roleName),
        ),
      );

    await org.agent
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

  async function variant(org: Org, sku: string) {
    return await createVariant(org.agent, {
      type: 'good',
      name: sku,
      variant: { sku },
    });
  }

  /** The issued invoice every case starts from, and what it came from. */
  async function invoiced(org: Org) {
    await org.agent
      .put('/v1/organization/address')
      .send({ line1: '100 Main St', country: 'CA' })
      .expect(204);

    const partner = body<{ partner: { id: string } }>(
      await org.agent
        .post('/v1/partners')
        .send({ name: 'Northside Pharmacy', code: 'NORTH' })
        .expect(201),
    ).partner;

    await org.agent
      .post(`/v1/partners/${partner.id}/addresses`)
      .send({
        line1: '9 Harbour Rd',
        country: 'CA',
        isBilling: true,
        isDefault: true,
      })
      .expect(201);

    const shelf = await createLocation(org.agent, {
      type: 'site',
      name: 'Shelf',
    });

    const capsules = await variant(org, 'FOCUS-60CT');
    const scoop = await variant(org, 'SCOOP');

    for (const variantId of [capsules, scoop]) {
      await org.agent
        .post('/v1/stock/movements')
        .send({
          variantId,
          toLocationId: shelf,
          quantity: '100',
          reason: 'receipt',
        })
        .expect(201);
    }

    const order = body<{
      order: { id: string; lines: { id: string; variantId: string }[] };
    }>(
      await org.agent
        .post('/v1/orders')
        .send({
          partnerId: partner.id,
          direction: 'sale',
          lines: [
            {
              variantId: capsules,
              quantityOrdered: '10',
              unitPrice: '12.5',
              currency: 'CAD',
            },
            {
              variantId: scoop,
              quantityOrdered: '5',
              unitPrice: '12.5',
              currency: 'CAD',
            },
          ],
        })
        .expect(201),
    ).order;

    await org.agent
      .patch(`/v1/orders/${order.id}`)
      .send({ status: 'confirmed' })
      .expect(204);

    const lineOf = (variantId: string) =>
      order.lines.find((line) => line.variantId === variantId)!.id;

    const shipment = body<{ shipment: { id: string } }>(
      await org.agent
        .post(`/v1/orders/${order.id}/shipments`)
        .send({
          fromLocationId: shelf,
          lines: [
            { lineId: lineOf(capsules), quantity: '6' },
            { lineId: lineOf(scoop), quantity: '5' },
          ],
        })
        .expect(201),
    ).shipment;

    const gst = body<{ taxCode: { id: string } }>(
      await org.agent
        .post('/v1/tax-codes')
        .send({ name: 'GST', components: [{ name: 'GST', rate: '5' }] })
        .expect(201),
    ).taxCode.id;

    const draft = body<{
      invoice: { id: string; lines: { id: string; sku: string }[] };
    }>(
      await org.agent
        .post('/v1/invoices')
        .send({ shipmentId: shipment.id, taxCodeId: gst })
        .expect(201),
    ).invoice;

    await org.agent
      .post(`/v1/invoices/${draft.id}/issue`)
      .send({ invoiceDate: TODAY })
      .expect(200);

    const invoiceLine = (sku: string) =>
      draft.lines.find((line) => line.sku === sku)!.id;

    return {
      invoiceId: draft.id,
      orderId: order.id,
      shelf,
      capsules: invoiceLine('FOCUS-60CT'),
      scoop: invoiceLine('SCOOP'),
      capsulesOrderLine: lineOf(capsules),
      scoopOrderLine: lineOf(scoop),
    };
  }

  type Invoiced = Awaited<ReturnType<typeof invoiced>>;

  function preview(org: Org, inv: Invoiced, lines: object[]) {
    return org.agent
      .post(`/v1/invoices/${inv.invoiceId}/credit-notes/preview`)
      .send({ lines });
  }

  function credit(
    org: Org,
    inv: Invoiced,
    lines: object[],
    over: Record<string, unknown> = {},
  ) {
    return org.agent.post(`/v1/invoices/${inv.invoiceId}/credit-notes`).send({
      reason: 'Two arrived cracked',
      creditDate: TODAY,
      lines,
      ...over,
    });
  }

  async function credited(org: Org, id: string) {
    return body<{ creditNote: Credit }>(
      await org.agent.get(`/v1/credit-notes/${id}`).expect(200),
    ).creditNote;
  }

  describe('crediting part of an invoice', () => {
    it('credits two units at the invoice price, and leaves the invoice issued', async () => {
      const org = await registerOrganization(app, 'alpha');
      const inv = await invoiced(org);

      const issued = body<{ creditNote: { id: string; number: string } }>(
        await credit(org, inv, [
          { invoiceLineId: inv.capsules, quantity: '2' },
        ]).expect(201),
      ).creditNote;

      // Its own series, beside the invoice's.
      expect(issued.number).toBe('CN-000001');

      // 2 × 12.50 = 25.00, GST 1.25.
      const note = await credited(org, issued.id);
      expect([note.subtotal, note.taxTotal, note.total]).toEqual([
        '25.0000',
        '1.2500',
        '26.2500',
      ]);

      // The goods left and were billed; only part of the money comes back.
      const [row] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, inv.invoiceId));
      expect(row.status).toBe('issued');
    });

    it('previews exactly what issuing stores', async () => {
      const org = await registerOrganization(app, 'alpha');
      const inv = await invoiced(org);
      const lines = [{ invoiceLineId: inv.capsules, quantity: '2' }];

      const shown = body<{ credit: Credit }>(
        await preview(org, inv, lines).expect(200),
      ).credit;

      const issued = body<{ creditNote: { id: string } }>(
        await credit(org, inv, lines).expect(201),
      ).creditNote;
      const note = await credited(org, issued.id);

      expect([note.subtotal, note.taxTotal, note.total]).toEqual([
        shown.subtotal,
        shown.taxTotal,
        shown.total,
      ]);
    });

    /**
     * A lowered price covers the common cases with one rule: a restocking
     * fee is the units at 85%; a price correction is every unit at the
     * difference.
     */
    it('credits at a lowered price: a restocking fee and a price correction', async () => {
      const org = await registerOrganization(app, 'alpha');
      const inv = await invoiced(org);

      // 2 at 85% of 12.50 = 2 × 10.625 = 21.25, GST 1.0625 → 1.06.
      const fee = body<{ credit: Credit }>(
        await preview(org, inv, [
          { invoiceLineId: inv.capsules, quantity: '2', unitPrice: '10.625' },
        ]).expect(200),
      ).credit;
      expect([fee.subtotal, fee.taxTotal]).toEqual(['21.2500', '1.0600']);

      // Billed 12.50, should have been 11.50: all 6 at 1.00.
      const correction = body<{ credit: Credit }>(
        await preview(org, inv, [
          { invoiceLineId: inv.capsules, quantity: '6', unitPrice: '1' },
        ]).expect(200),
      ).credit;
      expect(correction.subtotal).toBe('6.0000');
    });

    it('refuses a price above the invoice’s, and a quantity above what was billed', async () => {
      const org = await registerOrganization(app, 'alpha');
      const inv = await invoiced(org);

      await preview(org, inv, [
        { invoiceLineId: inv.capsules, quantity: '1', unitPrice: '13' },
      ]).expect(409);

      await preview(org, inv, [
        { invoiceLineId: inv.capsules, quantity: '7' },
      ]).expect(409);
    });

    /**
     * By value, not quantity: a price correction on all six, then a return
     * of two at full price, would count eight of six — and still be allowed
     * while it credits less than was billed. What is refused is more money
     * than the line billed.
     */
    it('caps every credit on a line at the value it billed', async () => {
      const org = await registerOrganization(app, 'alpha');
      const inv = await invoiced(org);

      await credit(org, inv, [
        { invoiceLineId: inv.capsules, quantity: '6', unitPrice: '1' },
      ]).expect(201);

      // 6.00 taken of 75.00: two more at full price is 25.00, within it.
      await credit(org, inv, [
        { invoiceLineId: inv.capsules, quantity: '2' },
      ]).expect(201);

      // 44.00 left; all six again at full price is 75.00, over it.
      await credit(org, inv, [
        { invoiceLineId: inv.capsules, quantity: '6' },
      ]).expect(409);
    });

    /**
     * One unit at a time, each rounding on its own: every one of the 11
     * credits is 12.50 with GST 0.625 → 0.63, which would total 6.93 — more
     * than the 6.88 the invoice charged. The cap holds the total to 6.88.
     */
    it('never credits more tax than the invoice charged', async () => {
      const org = await registerOrganization(app, 'alpha');
      const inv = await invoiced(org);

      let taxTotal = 0;

      for (const [line, units] of [
        [inv.capsules, 6],
        [inv.scoop, 5],
      ] as const) {
        for (let i = 0; i < units; i += 1) {
          const issued = body<{ creditNote: { id: string } }>(
            await credit(org, inv, [
              { invoiceLineId: line, quantity: '1' },
            ]).expect(201),
          ).creditNote;
          taxTotal += Math.round(
            Number((await credited(org, issued.id)).taxTotal) * 100,
          );
        }
      }

      expect(taxTotal).toBe(688);
    });

    it('refuses a line twice, and a line from another invoice', async () => {
      const org = await registerOrganization(app, 'alpha');
      const inv = await invoiced(org);

      await preview(org, inv, [
        { invoiceLineId: inv.capsules, quantity: '1' },
        { invoiceLineId: inv.capsules, quantity: '1' },
      ]).expect(400);

      const other = await registerOrganization(app, 'beta');
      const theirs = await invoiced(other);

      await preview(org, inv, [
        { invoiceLineId: theirs.capsules, quantity: '1' },
      ]).expect(404);
    });

    it('refuses a date before the invoice, and a missing reason', async () => {
      const org = await registerOrganization(app, 'alpha');
      const inv = await invoiced(org);
      const lines = [{ invoiceLineId: inv.capsules, quantity: '1' }];

      await credit(org, inv, lines, { creditDate: '2026-09-01' }).expect(400);
      await credit(org, inv, lines, { reason: '' }).expect(400);
    });
  });

  describe('against an RMA', () => {
    async function rma(
      org: Org,
      inv: Invoiced,
      over: {
        resolution?: string;
        quantity?: string;
        expectsGoods?: boolean;
      } = {},
    ) {
      const created = body<{
        returnAuthorization: { id: string; lines: { id: string }[] };
      }>(
        await org.agent
          .post('/v1/return-authorizations')
          .send({
            orderId: inv.orderId,
            invoiceId: inv.invoiceId,
            reason: 'Cracked in transit',
            expectsGoods: over.expectsGoods ?? true,
            lines: [
              {
                lineId: inv.capsulesOrderLine,
                quantity: over.quantity ?? '2',
                resolution: over.resolution ?? 'credit',
              },
            ],
          })
          .expect(201),
      ).returnAuthorization;

      return { id: created.id, line: created.lines[0].id };
    }

    it('settles the RMA line, and shows it as credited', async () => {
      const org = await registerOrganization(app, 'alpha');
      const inv = await invoiced(org);
      const r = await rma(org, inv);

      await credit(org, inv, [
        {
          invoiceLineId: inv.capsules,
          quantity: '2',
          returnAuthorizationLineId: r.line,
        },
      ]).expect(201);

      const detail = body<{
        returnAuthorization: { lines: { quantityCredited: string }[] };
      }>(
        await org.agent.get(`/v1/return-authorizations/${r.id}`).expect(200),
      ).returnAuthorization;

      expect(detail.lines[0].quantityCredited).toBe('2.0000');
    });

    // Two authorized: a third unit credited under it is refused.
    it('refuses more than the RMA line authorized', async () => {
      const org = await registerOrganization(app, 'alpha');
      const inv = await invoiced(org);
      const r = await rma(org, inv);

      await credit(org, inv, [
        {
          invoiceLineId: inv.capsules,
          quantity: '2',
          returnAuthorizationLineId: r.line,
        },
      ]).expect(201);

      await credit(org, inv, [
        {
          invoiceLineId: inv.capsules,
          quantity: '1',
          returnAuthorizationLineId: r.line,
        },
      ]).expect(409);
    });

    it('refuses a line resolved as replace, a closed RMA, and another item', async () => {
      const org = await registerOrganization(app, 'alpha');
      const inv = await invoiced(org);

      const replace = await rma(org, inv, { resolution: 'replace' });
      await preview(org, inv, [
        {
          invoiceLineId: inv.capsules,
          quantity: '1',
          returnAuthorizationLineId: replace.line,
        },
      ]).expect(409);

      const closed = await rma(org, inv);
      await org.agent
        .post(`/v1/return-authorizations/${closed.id}/close`)
        .expect(204);
      await preview(org, inv, [
        {
          invoiceLineId: inv.capsules,
          quantity: '1',
          returnAuthorizationLineId: closed.line,
        },
      ]).expect(409);

      // An RMA line for capsules cannot settle the scoop's invoice line.
      const open = await rma(org, inv);
      await preview(org, inv, [
        {
          invoiceLineId: inv.scoop,
          quantity: '1',
          returnAuthorizationLineId: open.line,
        },
      ]).expect(409);
    });
  });

  describe('beside voiding', () => {
    /**
     * A void credits the whole invoice, so once part of it is credited, a
     * void would credit that part twice. The rest is credited instead.
     */
    it('refuses a void once part of the invoice is credited', async () => {
      const org = await registerOrganization(app, 'alpha');
      const inv = await invoiced(org);

      await credit(org, inv, [
        { invoiceLineId: inv.capsules, quantity: '1' },
      ]).expect(201);

      await org.agent
        .post(`/v1/invoices/${inv.invoiceId}/void`)
        .send({ reason: 'Billed twice', creditDate: TODAY })
        .expect(409);
    });

    it('refuses a credit on a voided invoice', async () => {
      const org = await registerOrganization(app, 'alpha');
      const inv = await invoiced(org);

      await org.agent
        .post(`/v1/invoices/${inv.invoiceId}/void`)
        .send({ reason: 'Billed twice', creditDate: TODAY })
        .expect(200);

      await preview(org, inv, [
        { invoiceLineId: inv.capsules, quantity: '1' },
      ]).expect(409);
    });
  });

  describe('permissions and audit', () => {
    // Money going back is the finance act, as issuing and voiding are.
    it('lets only the Owner credit', async () => {
      const org = await registerOrganization(app, 'alpha');
      const inv = await invoiced(org);
      const admin = await addMember(org, 'admin@alpha.example.com', 'Admin');

      await admin
        .post(`/v1/invoices/${inv.invoiceId}/credit-notes/preview`)
        .send({ lines: [{ invoiceLineId: inv.capsules, quantity: '1' }] })
        .expect(403);

      await admin
        .post(`/v1/invoices/${inv.invoiceId}/credit-notes`)
        .send({
          reason: 'Cracked',
          creditDate: TODAY,
          lines: [{ invoiceLineId: inv.capsules, quantity: '1' }],
        })
        .expect(403);
    });

    it('records the credit note against its invoice, and writes nothing on preview', async () => {
      const org = await registerOrganization(app, 'alpha');
      const inv = await invoiced(org);
      const lines = [{ invoiceLineId: inv.capsules, quantity: '2' }];

      await preview(org, inv, lines).expect(200);

      const issued = body<{ creditNote: { id: string } }>(
        await credit(org, inv, lines).expect(201),
      ).creditNote;

      const entries = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'credit_note.issued'));

      expect(entries).toHaveLength(1);
      expect(entries[0].resourceId).toBe(issued.id);
      expect(entries[0].resourceLabel).toBe('Northside Pharmacy · CN-000001');
      expect(entries[0].payload).toEqual({
        creditDate: TODAY,
        invoice: 'INV-000001',
        total: '26.2500',
      });
    });
  });
});
