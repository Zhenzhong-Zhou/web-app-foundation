import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { auditLog, invoices, roles } from '../src/database/schema';
import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './utils/create-test-app';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface InvoiceResponse {
  id: string;
  status: string;
  number: string | null;
  currency: string;
  orderId: string;
  shipmentId: string;
  dueDate: string | null;
  note: string | null;
  total: string | null;
  lines: {
    id: string;
    sku: string;
    description: string;
    quantity: string;
    unitPrice: string;
    taxCodeId: string | null;
    taxCodeName: string | null;
  }[];
}

interface RegisterResponse {
  user: { id: string; organizationId: string };
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * Invoice drafts (ADR-046). The claim this suite exists to prove: a draft
 * bills exactly what one shipment carried, at the order's prices, and only
 * a draft can be edited or deleted.
 */
describe('Invoices (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  const PASSWORD = 'correct-horse-battery';

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(ThrottlerStorage)
        .useValue(unlimitedThrottler)
        .overrideProvider(MailService)
        .useValue(new RecordingMailService()),
    );

    db = app.get<Database>(UNSAFE_GLOBAL_DB);
    await seedPermissions(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  async function registerOrg(slugish: string) {
    const agent = authedAgent(app);

    const res = await agent
      .post('/v1/auth/register')
      .send({
        email: `owner@${slugish}.example.com`,
        password: PASSWORD,
        name: 'Owner',
        organizationName: `${slugish} Co`,
      })
      .expect(201);

    return {
      agent,
      organizationId: body<RegisterResponse>(res).user.organizationId,
    };
  }

  type Org = Awaited<ReturnType<typeof registerOrg>>;

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

  async function variant(org: Org, sku: string, name: string) {
    return body<{ product: { variants: { id: string }[] } }>(
      await org.agent
        .post('/v1/products')
        .send({ type: 'good', name, variant: { sku } })
        .expect(201),
    ).product.variants[0].id;
  }

  /**
   * Two untracked items on one shelf, a confirmed sale priced in CAD, and
   * one shipment carrying part of it: 6 of 10 capsules, all 5 scoops.
   */
  async function shipped(org: Org, options: { isSample?: boolean } = {}) {
    const partner = body<{ partner: { id: string } }>(
      await org.agent
        .post('/v1/partners')
        .send({ name: 'Northside Pharmacy', code: 'NORTH' })
        .expect(201),
    ).partner;

    const shelf = body<{ location: { id: string } }>(
      await org.agent
        .post('/v1/locations')
        .send({ type: 'site', name: 'Shelf' })
        .expect(201),
    ).location.id;

    const capsules = await variant(org, 'FOCUS-60CT', 'Focus');
    const scoop = await variant(org, 'SCOOP', 'Scoop');

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

    const price = options.isSample
      ? {}
      : { unitPrice: '12.5', currency: 'CAD' };

    const order = body<{
      order: { id: string; lines: { id: string; variantId: string }[] };
    }>(
      await org.agent
        .post('/v1/orders')
        .send({
          partnerId: partner.id,
          direction: 'sale',
          isSample: options.isSample ?? false,
          lines: [
            { variantId: capsules, quantityOrdered: '10', ...price },
            { variantId: scoop, quantityOrdered: '5', ...price },
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

    return { orderId: order.id, shipmentId: shipment.id };
  }

  async function taxCode(org: Org, name = 'GST', rate = '5') {
    return body<{ taxCode: { id: string } }>(
      await org.agent
        .post('/v1/tax-codes')
        .send({ name, components: [{ name, rate }] })
        .expect(201),
    ).taxCode.id;
  }

  async function draft(org: Org, shipmentId: string, taxCodeId?: string) {
    return body<{ invoice: InvoiceResponse }>(
      await org.agent
        .post('/v1/invoices')
        .send({ shipmentId, taxCodeId })
        .expect(201),
    ).invoice;
  }

  async function read(org: Org, invoiceId: string) {
    return body<{ invoice: InvoiceResponse }>(
      await org.agent.get(`/v1/invoices/${invoiceId}`).expect(200),
    ).invoice;
  }

  describe('creating a draft', () => {
    it('bills exactly what the shipment carried, at the order price', async () => {
      const org = await registerOrg('alpha');
      const s = await shipped(org);

      const invoice = await draft(org, s.shipmentId);

      expect(invoice.status).toBe('draft');
      // No number until issue: a deleted draft would otherwise leave a gap.
      expect(invoice.number).toBeNull();
      expect(invoice.total).toBeNull();
      expect(invoice.currency).toBe('CAD');
      expect(invoice.orderId).toBe(s.orderId);

      // 6 of the 10 ordered, because 6 is what this shipment carried.
      expect(
        invoice.lines.map((line) => [
          line.sku,
          line.description,
          line.quantity,
          line.unitPrice,
        ]),
      ).toEqual([
        ['FOCUS-60CT', 'Focus', '6.0000', '12.5000'],
        ['SCOOP', 'Scoop', '5.0000', '12.5000'],
      ]);
    });

    it('applies the chosen tax code to every line', async () => {
      const org = await registerOrg('alpha');
      const s = await shipped(org);
      const gst = await taxCode(org);

      const invoice = await draft(org, s.shipmentId, gst);
      const detail = await read(org, invoice.id);

      expect(detail.lines.map((line) => line.taxCodeName)).toEqual([
        'GST',
        'GST',
      ]);
    });

    it('refuses a second invoice for the same shipment', async () => {
      const org = await registerOrg('alpha');
      const s = await shipped(org);
      await draft(org, s.shipmentId);

      // One standing invoice per shipment, held by the partial unique index.
      await org.agent
        .post('/v1/invoices')
        .send({ shipmentId: s.shipmentId })
        .expect(409);
    });

    it('refuses a voided shipment', async () => {
      const org = await registerOrg('alpha');
      const s = await shipped(org);

      await org.agent
        .post(`/v1/orders/${s.orderId}/shipments/${s.shipmentId}/void`)
        .send({ reason: 'Box never left' })
        .expect(204);

      await org.agent
        .post('/v1/invoices')
        .send({ shipmentId: s.shipmentId })
        .expect(409);
    });

    // Samples ship and trace like sales, but are never invoiced (ADR-042).
    it('refuses a sample', async () => {
      const org = await registerOrg('alpha');
      const s = await shipped(org, { isSample: true });

      await org.agent
        .post('/v1/invoices')
        .send({ shipmentId: s.shipmentId })
        .expect(409);

      expect(await db.select().from(invoices)).toHaveLength(0);
    });

    it('refuses a retired tax code, and another organization’s', async () => {
      const org = await registerOrg('alpha');
      const other = await registerOrg('beta');
      const s = await shipped(org);

      const retired = await taxCode(org, 'Old PST', '7');
      await org.agent
        .patch(`/v1/tax-codes/${retired}`)
        .send({ isActive: false })
        .expect(204);

      await org.agent
        .post('/v1/invoices')
        .send({ shipmentId: s.shipmentId, taxCodeId: retired })
        .expect(409);

      // An id from a body, so a 400 rather than a 404 — the same as a
      // partner from another organization on an order.
      await org.agent
        .post('/v1/invoices')
        .send({ shipmentId: s.shipmentId, taxCodeId: await taxCode(other) })
        .expect(400);
    });

    it('does not invoice another organization’s shipment', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');
      const theirs = await shipped(beta);

      await alpha.agent
        .post('/v1/invoices')
        .send({ shipmentId: theirs.shipmentId })
        .expect(404);
    });
  });

  describe('editing a draft', () => {
    it('changes the due date, note, a price and a tax code', async () => {
      const org = await registerOrg('alpha');
      const s = await shipped(org);
      const gst = await taxCode(org);
      const exempt = body<{ taxCode: { id: string } }>(
        await org.agent
          .post('/v1/tax-codes')
          .send({ name: 'Exempt', components: [] })
          .expect(201),
      ).taxCode.id;

      const invoice = await draft(org, s.shipmentId, gst);
      const scoopLine = invoice.lines.find((line) => line.sku === 'SCOOP')!;

      await org.agent
        .patch(`/v1/invoices/${invoice.id}`)
        .send({ dueDate: '2026-10-31', note: 'Thank you — PO 4471' })
        .expect(204);

      await org.agent
        .patch(`/v1/invoices/${invoice.id}/lines/${scoopLine.id}`)
        .send({ unitPrice: '10', taxCodeId: exempt })
        .expect(204);

      const detail = await read(org, invoice.id);
      expect(detail.dueDate).toBe('2026-10-31');
      expect(detail.note).toBe('Thank you — PO 4471');

      const scoop = detail.lines.find((line) => line.sku === 'SCOOP')!;
      expect(scoop.unitPrice).toBe('10.0000');
      expect(scoop.taxCodeName).toBe('Exempt');

      // The other line keeps the invoice's code.
      const capsules = detail.lines.find((line) => line.sku === 'FOCUS-60CT')!;
      expect(capsules.taxCodeName).toBe('GST');
    });

    // The invoice bills what left; a different quantity is a different
    // shipment. Refused by the whitelist, since the field does not exist.
    it('refuses a quantity change', async () => {
      const org = await registerOrg('alpha');
      const s = await shipped(org);
      const invoice = await draft(org, s.shipmentId);

      await org.agent
        .patch(`/v1/invoices/${invoice.id}/lines/${invoice.lines[0].id}`)
        .send({ quantity: '1' })
        .expect(400);
    });

    it('refuses a day that does not exist', async () => {
      const org = await registerOrg('alpha');
      const s = await shipped(org);
      const invoice = await draft(org, s.shipmentId);

      await org.agent
        .patch(`/v1/invoices/${invoice.id}`)
        .send({ dueDate: '2026-02-30' })
        .expect(400);
    });

    it('clears the due date and note with empty values', async () => {
      const org = await registerOrg('alpha');
      const s = await shipped(org);
      const invoice = await draft(org, s.shipmentId);

      await org.agent
        .patch(`/v1/invoices/${invoice.id}`)
        .send({ dueDate: '2026-10-31', note: 'Net 30' })
        .expect(204);

      await org.agent
        .patch(`/v1/invoices/${invoice.id}`)
        .send({ dueDate: null, note: '' })
        .expect(204);

      const detail = await read(org, invoice.id);
      expect(detail.dueDate).toBeNull();
      expect(detail.note).toBeNull();
    });

    it('refuses a line from another invoice', async () => {
      const org = await registerOrg('alpha');
      const first = await draft(org, (await shipped(org)).shipmentId);

      const other = await registerOrg('beta');
      const theirs = await draft(other, (await shipped(other)).shipmentId);

      await org.agent
        .patch(`/v1/invoices/${first.id}/lines/${theirs.lines[0].id}`)
        .send({ unitPrice: '1' })
        .expect(404);
    });

    it('records a price change with what it replaced', async () => {
      const org = await registerOrg('alpha');
      const s = await shipped(org);
      const invoice = await draft(org, s.shipmentId);

      await org.agent
        .patch(`/v1/invoices/${invoice.id}/lines/${invoice.lines[0].id}`)
        .send({ unitPrice: '11' })
        .expect(204);

      const [entry] = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'invoice.line_updated'));

      expect(entry.resourceId).toBe(invoice.id);
      expect(entry.payload).toEqual({
        unitPrice: { from: '12.5000', to: '11' },
      });
    });
  });

  describe('deleting a draft', () => {
    it('removes it, and the shipment can be invoiced again', async () => {
      const org = await registerOrg('alpha');
      const s = await shipped(org);
      const invoice = await draft(org, s.shipmentId);

      await org.agent.delete(`/v1/invoices/${invoice.id}`).expect(204);
      await org.agent.get(`/v1/invoices/${invoice.id}`).expect(404);

      await draft(org, s.shipmentId);
    });
  });

  describe('listing', () => {
    it('lists an order’s invoices, newest first', async () => {
      const org = await registerOrg('alpha');
      const s = await shipped(org);
      const invoice = await draft(org, s.shipmentId);

      const page = body<{
        entries: { id: string; partnerName: string }[];
        nextCursor: string | null;
      }>(await org.agent.get(`/v1/invoices?orderId=${s.orderId}`).expect(200));

      expect(page.entries.map((entry) => entry.id)).toEqual([invoice.id]);
      expect(page.entries[0].partnerName).toBe('Northside Pharmacy');
      expect(page.nextCursor).toBeNull();
    });

    it('does not show another organization’s invoices', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');
      const theirs = await draft(beta, (await shipped(beta)).shipmentId);

      const page = body<{ entries: unknown[] }>(
        await alpha.agent.get('/v1/invoices').expect(200),
      );
      expect(page.entries).toHaveLength(0);

      // Scoped, so not found rather than forbidden.
      await alpha.agent.get(`/v1/invoices/${theirs.id}`).expect(404);
    });
  });

  describe('permissions', () => {
    /**
     * Drafting is operational, so Admin holds it; issuing is the finance
     * act and stays with the Owner (next step). A Viewer reads.
     */
    it('lets Admin draft and a Viewer only read', async () => {
      const org = await registerOrg('alpha');
      const s = await shipped(org);

      const admin = await addMember(org, 'admin@alpha.example.com', 'Admin');
      const viewer = await addMember(org, 'viewer@alpha.example.com', 'Viewer');

      await viewer
        .post('/v1/invoices')
        .send({ shipmentId: s.shipmentId })
        .expect(403);

      const invoice = body<{ invoice: InvoiceResponse }>(
        await admin
          .post('/v1/invoices')
          .send({ shipmentId: s.shipmentId })
          .expect(201),
      ).invoice;

      await viewer.get(`/v1/invoices/${invoice.id}`).expect(200);
      await viewer.delete(`/v1/invoices/${invoice.id}`).expect(403);
    });
  });
});
