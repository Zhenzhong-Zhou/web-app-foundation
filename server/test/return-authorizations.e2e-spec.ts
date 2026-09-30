import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  auditLog,
  orderLines,
  orderReturns,
  orders,
  returnAuthorizations,
  roles,
} from '../src/database/schema';
import {
  body,
  createE2eApp,
  createVariant,
  PASSWORD,
  registerOrganization,
} from './utils/fixtures';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';
import { shippedSale } from './utils/sales';

interface RmaResponse {
  id: string;
  number: string;
  status: string;
  orderId: string;
  invoiceId: string | null;
  invoiceNumber?: string | null;
  expectsGoods: boolean;
  lines: {
    id: string;
    sku: string;
    quantity: string;
    resolution: string;
    quantityReceived?: string;
    quantityCredited?: string;
  }[];
}

/**
 * Return authorizations (ADR-047): raised authorized, per-line resolutions,
 * held to what the customer holds, cancelled only while nothing has
 * happened under them; and returns held to them, at the dock or linked
 * afterwards.
 */
describe('Return authorizations (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  const REASON = 'Two bottles arrived cracked';

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

  /** The usual shipped sale (utils/sales.ts); a sample carries no prices. */
  async function shipped(org: Org, options: { isSample?: boolean } = {}) {
    return shippedSale(org.agent, options);
  }

  type Shipped = Awaited<ReturnType<typeof shipped>>;

  function raise(org: Org, s: Shipped, over: Record<string, unknown> = {}) {
    return org.agent.post('/v1/return-authorizations').send({
      orderId: s.orderId,
      reason: REASON,
      lines: [{ lineId: s.capsulesLine, quantity: '2', resolution: 'credit' }],
      ...over,
    });
  }

  async function raised(
    org: Org,
    s: Shipped,
    over: Record<string, unknown> = {},
  ) {
    return body<{ returnAuthorization: RmaResponse }>(
      await raise(org, s, over).expect(201),
    ).returnAuthorization;
  }

  async function read(org: Org, id: string) {
    return body<{ returnAuthorization: RmaResponse }>(
      await org.agent.get(`/v1/return-authorizations/${id}`).expect(200),
    ).returnAuthorization;
  }

  /** The shipment invoiced and issued, with everything issuing needs. */
  async function issuedInvoice(org: Org, s: Shipped, issue = true) {
    await org.agent
      .put('/v1/organization/address')
      .send({ line1: '100 Main St', country: 'CA' })
      .expect(204);
    await org.agent
      .post(`/v1/partners/${s.partnerId}/addresses`)
      .send({
        line1: '9 Harbour Rd',
        country: 'CA',
        isBilling: true,
        isDefault: true,
      })
      .expect(201);
    const gst = body<{ taxCode: { id: string } }>(
      await org.agent
        .post('/v1/tax-codes')
        .send({ name: 'GST', components: [{ name: 'GST', rate: '5' }] })
        .expect(201),
    ).taxCode.id;

    const invoice = body<{ invoice: { id: string } }>(
      await org.agent
        .post('/v1/invoices')
        .send({ shipmentId: s.shipmentId, taxCodeId: gst })
        .expect(201),
    ).invoice;

    if (issue) {
      await org.agent
        .post(`/v1/invoices/${invoice.id}/issue`)
        .send({ invoiceDate: '2026-09-25' })
        .expect(200);
    }

    return invoice.id;
  }

  describe('raising', () => {
    it('numbers it and records a resolution per line', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);

      const rma = await raised(org, s, {
        lines: [
          { lineId: s.capsulesLine, quantity: '2', resolution: 'credit' },
          { lineId: s.scoopLine, quantity: '1', resolution: 'replace' },
        ],
      });

      expect(rma.number).toBe('RMA-000001');
      expect(rma.status).toBe('open');
      // Goods are expected unless the customer was told to keep them.
      expect(rma.expectsGoods).toBe(true);

      const detail = await read(org, rma.id);
      expect(
        detail.lines.map((line) => [
          line.sku,
          line.quantity,
          line.resolution,
          line.quantityReceived,
          line.quantityCredited,
        ]),
      ).toEqual([
        ['FOCUS-60CT', '2.0000', 'credit', '0.0000', '0.0000'],
        ['SCOOP', '1.0000', 'replace', '0.0000', '0.0000'],
      ]);
    });

    /**
     * The ceiling is what the customer holds: shipped less returned. 6
     * capsules went and 2 came back, so 4 can be authorized, not 5.
     */
    it('refuses more than the customer holds', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);

      await org.agent
        .post(`/v1/orders/${s.orderId}/returns`)
        .send({
          toLocationId: s.shelf,
          lines: [{ lineId: s.capsulesLine, quantity: '2' }],
        })
        .expect(201);

      await raise(org, s, {
        lines: [
          { lineId: s.capsulesLine, quantity: '5', resolution: 'credit' },
        ],
      }).expect(409);

      await raise(org, s, {
        lines: [
          { lineId: s.capsulesLine, quantity: '4', resolution: 'credit' },
        ],
      }).expect(201);

      // And the refusal took no number.
      const [row] = await db.select().from(returnAuthorizations);
      expect(row.number).toBe('RMA-000001');
    });

    it('refuses a line twice, and a line from another order', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);

      await raise(org, s, {
        lines: [
          { lineId: s.capsulesLine, quantity: '1', resolution: 'credit' },
          { lineId: s.capsulesLine, quantity: '1', resolution: 'credit' },
        ],
      }).expect(400);

      const other = await registerOrganization(app, 'beta');
      const theirs = await shipped(other);

      await raise(org, s, {
        lines: [
          { lineId: theirs.capsulesLine, quantity: '1', resolution: 'credit' },
        ],
      }).expect(404);
    });

    it('refuses a draft sale, which has shipped nothing', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);

      const draft = body<{ order: { id: string; lines: { id: string }[] } }>(
        await org.agent
          .post('/v1/orders')
          .send({
            partnerId: s.partnerId,
            direction: 'sale',
            lines: [
              {
                variantId: await variant(org, 'DRAFTED'),
                quantityOrdered: '3',
                unitPrice: '1',
                currency: 'CAD',
              },
            ],
          })
          .expect(201),
      ).order;

      await org.agent
        .post('/v1/return-authorizations')
        .send({
          orderId: draft.id,
          reason: REASON,
          lines: [
            { lineId: draft.lines[0].id, quantity: '1', resolution: 'none' },
          ],
        })
        .expect(409);
    });

    // Nothing on a sample was billed, so nothing on it can be credited.
    it('refuses credit on a sample, and allows a replacement', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org, { isSample: true });

      await raise(org, s).expect(409);

      await raise(org, s, {
        lines: [
          { lineId: s.capsulesLine, quantity: '1', resolution: 'replace' },
        ],
      }).expect(201);
    });
  });

  describe('the quoted invoice', () => {
    it('records an issued invoice for this order', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);
      const invoiceId = await issuedInvoice(org, s);

      const rma = await raised(org, s, { invoiceId });
      const detail = await read(org, rma.id);

      expect(detail.invoiceId).toBe(invoiceId);
      expect(detail.invoiceNumber).toBe('INV-000001');
    });

    it('refuses a draft invoice, and another organization’s', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);
      const draftId = await issuedInvoice(org, s, false);

      // A draft is owed nothing yet, so nothing on it can be credited.
      await raise(org, s, { invoiceId: draftId }).expect(409);

      const other = await registerOrganization(app, 'beta');
      const theirs = await issuedInvoice(other, await shipped(other));

      // An id from a body: 400, as a partner from elsewhere is.
      await raise(org, s, { invoiceId: theirs }).expect(400);
    });
  });

  describe('cancelling and closing', () => {
    it('cancels one nothing has happened under', async () => {
      const org = await registerOrganization(app, 'alpha');
      const rma = await raised(org, await shipped(org));

      await org.agent
        .post(`/v1/return-authorizations/${rma.id}/cancel`)
        .expect(204);

      expect((await read(org, rma.id)).status).toBe('cancelled');

      // Terminal: neither cancelled again nor closed.
      await org.agent
        .post(`/v1/return-authorizations/${rma.id}/cancel`)
        .expect(409);
      await org.agent
        .post(`/v1/return-authorizations/${rma.id}/close`)
        .expect(409);
    });

    it('closes an open one', async () => {
      const org = await registerOrganization(app, 'alpha');
      const rma = await raised(org, await shipped(org));

      await org.agent
        .post(`/v1/return-authorizations/${rma.id}/close`)
        .expect(204);

      const [row] = await db
        .select()
        .from(returnAuthorizations)
        .where(eq(returnAuthorizations.id, rma.id));

      expect(row.status).toBe('closed');
      expect(row.closedAt).not.toBeNull();
      expect(row.closedBy).not.toBeNull();
    });
  });

  describe('receiving against it', () => {
    /** Capsules back to the shelf, against an RMA or not. */
    function returnCapsules(
      org: Org,
      s: Shipped,
      quantity: string,
      returnAuthorizationId?: string,
    ) {
      return org.agent.post(`/v1/orders/${s.orderId}/returns`).send({
        toLocationId: s.shelf,
        lines: [{ lineId: s.capsulesLine, quantity }],
        returnAuthorizationId,
      });
    }

    async function returnedOnLine(lineId: string) {
      const [row] = await db
        .select()
        .from(orderLines)
        .where(eq(orderLines.id, lineId));
      return row.quantityReturned;
    }

    it('counts a return that names it, across more than one box', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);
      const rma = await raised(org, s);

      await returnCapsules(org, s, '1', rma.id).expect(201);
      await returnCapsules(org, s, '1', rma.id).expect(201);

      const [line] = (await read(org, rma.id)).lines;
      expect(line.quantityReceived).toBe('2.0000');
    });

    /**
     * What came back against one RMA is not counted against another, nor
     * for another item. Each figure is this line's alone.
     */
    it('counts only its own returns, for its own item', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);

      const first = await raised(org, s);
      const second = await raised(org, s, {
        lines: [
          { lineId: s.capsulesLine, quantity: '2', resolution: 'credit' },
          { lineId: s.scoopLine, quantity: '1', resolution: 'credit' },
        ],
      });

      await returnCapsules(org, s, '2', first.id).expect(201);

      const [firstLine] = (await read(org, first.id)).lines;
      expect(firstLine.quantityReceived).toBe('2.0000');

      // Nothing came back against the second, for either item.
      const others = (await read(org, second.id)).lines;
      expect(others.map((line) => line.quantityReceived)).toEqual([
        '0.0000',
        '0.0000',
      ]);
    });

    /**
     * 2 authorized: a third box is refused, and moves nothing — the check
     * and the movement are one transaction.
     */
    it('refuses more than it authorized, and moves nothing', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);
      const rma = await raised(org, s);

      await returnCapsules(org, s, '2', rma.id).expect(201);
      await returnCapsules(org, s, '1', rma.id).expect(409);

      expect(await returnedOnLine(s.capsulesLine)).toBe('2.0000');
    });

    it('refuses an item not on it', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);
      const rma = await raised(org, s);

      await org.agent
        .post(`/v1/orders/${s.orderId}/returns`)
        .send({
          toLocationId: s.shelf,
          lines: [{ lineId: s.scoopLine, quantity: '1' }],
          returnAuthorizationId: rma.id,
        })
        .expect(409);
    });

    it('refuses one that is closed, or told the customer to keep the goods', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);

      const closed = await raised(org, s);
      await org.agent
        .post(`/v1/return-authorizations/${closed.id}/close`)
        .expect(204);
      await returnCapsules(org, s, '1', closed.id).expect(409);

      const keep = await raised(org, s, { expectsGoods: false });
      await returnCapsules(org, s, '1', keep.id).expect(409);
    });

    // Goods on the dock are a fact: a return with no RMA is still recorded.
    it('still receives a return that names no RMA', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);

      await returnCapsules(org, s, '1').expect(201);
      expect(await returnedOnLine(s.capsulesLine)).toBe('1.0000');
    });

    it('is no longer cancelled once goods are back', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);
      const rma = await raised(org, s);

      await returnCapsules(org, s, '1', rma.id).expect(201);

      await org.agent
        .post(`/v1/return-authorizations/${rma.id}/cancel`)
        .expect(409);
      await org.agent
        .post(`/v1/return-authorizations/${rma.id}/close`)
        .expect(204);
    });
  });

  describe('linking a return received without it', () => {
    async function unannounced(org: Org, s: Shipped, quantity: string) {
      return body<{ orderReturn: { id: string } }>(
        await org.agent
          .post(`/v1/orders/${s.orderId}/returns`)
          .send({
            toLocationId: s.shelf,
            lines: [{ lineId: s.capsulesLine, quantity }],
          })
          .expect(201),
      ).orderReturn.id;
    }

    function link(org: Org, rmaId: string, returnId: string) {
      return org.agent
        .post(`/v1/return-authorizations/${rmaId}/returns`)
        .send({ returnId });
    }

    it('counts it, once', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);
      const returnId = await unannounced(org, s, '2');
      const rma = await raised(org, s);

      await link(org, rma.id, returnId).expect(204);

      const [line] = (await read(org, rma.id)).lines;
      expect(line.quantityReceived).toBe('2.0000');

      // Once: not again, and not to another RMA.
      await link(org, rma.id, returnId).expect(409);
      const other = await raised(org, s);
      await link(org, other.id, returnId).expect(409);
    });

    it('refuses a return that brought more than it has left', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);
      const returnId = await unannounced(org, s, '3');
      const rma = await raised(org, s);

      await link(org, rma.id, returnId).expect(409);

      const [row] = await db
        .select()
        .from(orderReturns)
        .where(eq(orderReturns.id, returnId));
      expect(row.returnAuthorizationId).toBeNull();
    });

    it('refuses a return that brought an item not on it', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);

      const returnId = body<{ orderReturn: { id: string } }>(
        await org.agent
          .post(`/v1/orders/${s.orderId}/returns`)
          .send({
            toLocationId: s.shelf,
            lines: [{ lineId: s.scoopLine, quantity: '1' }],
          })
          .expect(201),
      ).orderReturn.id;

      const rma = await raised(org, s);
      await link(org, rma.id, returnId).expect(409);
    });

    it('records the link on the RMA', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);
      const returnId = await unannounced(org, s, '1');
      const rma = await raised(org, s);

      await link(org, rma.id, returnId).expect(204);

      const [entry] = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'return_authorization.return_linked'));

      expect(entry.resourceId).toBe(rma.id);
      expect(entry.payload).toEqual({
        returnId,
        returnAuthorization: 'RMA-000001',
      });
    });
  });

  describe('raising a replacement', () => {
    function replace(org: Org, rmaId: string) {
      return org.agent.post(`/v1/return-authorizations/${rmaId}/replacement`);
    }

    /**
     * Only the replace lines, at zero, in the original's currency, linked
     * back — and confirm accepts it as it stands, since zero is a price.
     */
    it('raises a draft sale at zero for the replace lines only', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);
      const rma = await raised(org, s, {
        lines: [
          { lineId: s.capsulesLine, quantity: '2', resolution: 'credit' },
          { lineId: s.scoopLine, quantity: '1', resolution: 'replace' },
        ],
      });

      const order = body<{ order: { id: string } }>(
        await replace(org, rma.id).expect(201),
      ).order;

      const [row] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(row.status).toBe('draft');
      expect(row.direction).toBe('sale');
      expect(row.returnAuthorizationId).toBe(rma.id);
      expect(row.note).toBe('Replacement for RMA-000001');

      const lines = await db
        .select()
        .from(orderLines)
        .where(eq(orderLines.orderId, order.id));
      expect(
        lines.map((line) => [
          line.sku,
          line.quantityOrdered,
          line.unitPrice,
          line.currency,
        ]),
      ).toEqual([['SCOOP', '1.0000', '0.0000', 'CAD']]);

      await org.agent
        .patch(`/v1/orders/${order.id}`)
        .send({ status: 'confirmed' })
        .expect(204);
    });

    it('refuses an RMA with nothing to replace', async () => {
      const org = await registerOrganization(app, 'alpha');
      const rma = await raised(org, await shipped(org));

      await replace(org, rma.id).expect(409);
    });

    // One standing replacement: the same goods are not sent twice.
    it('raises one at a time, and another once the first is cancelled', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);
      const rma = await raised(org, s, {
        lines: [{ lineId: s.scoopLine, quantity: '1', resolution: 'replace' }],
      });

      const first = body<{ order: { id: string } }>(
        await replace(org, rma.id).expect(201),
      ).order;
      await replace(org, rma.id).expect(409);

      await org.agent
        .patch(`/v1/orders/${first.id}`)
        .send({ status: 'cancelled' })
        .expect(204);
      await replace(org, rma.id).expect(201);
    });

    // A sample's replacement is a sample: unpriced, and still confirmable.
    it('replaces a sample with a sample', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org, { isSample: true });
      const rma = await raised(org, s, {
        lines: [
          { lineId: s.capsulesLine, quantity: '1', resolution: 'replace' },
        ],
      });

      const order = body<{ order: { id: string } }>(
        await replace(org, rma.id).expect(201),
      ).order;

      const [row] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(row.isSample).toBe(true);

      await org.agent
        .patch(`/v1/orders/${order.id}`)
        .send({ status: 'confirmed' })
        .expect(204);
    });
  });

  describe('listing', () => {
    it('lists an order’s RMAs, filtered by status', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);
      const first = await raised(org, s);
      const second = await raised(org, s);

      await org.agent
        .post(`/v1/return-authorizations/${first.id}/close`)
        .expect(204);

      const open = body<{ entries: { id: string; partnerName: string }[] }>(
        await org.agent
          .get(`/v1/return-authorizations?orderId=${s.orderId}&status=open`)
          .expect(200),
      );

      expect(open.entries.map((entry) => entry.id)).toEqual([second.id]);
      expect(open.entries[0].partnerName).toBe('Northside Pharmacy');
    });

    it('keeps each organization to its own', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');
      const theirs = await raised(beta, await shipped(beta));

      const page = body<{ entries: unknown[] }>(
        await alpha.agent.get('/v1/return-authorizations').expect(200),
      );
      expect(page.entries).toHaveLength(0);

      await alpha.agent
        .get(`/v1/return-authorizations/${theirs.id}`)
        .expect(404);
      await alpha.agent
        .post(`/v1/return-authorizations/${theirs.id}/close`)
        .expect(404);
    });
  });

  describe('permissions and audit', () => {
    /**
     * Customer service is operational, so Admin raises and settles RMAs; a
     * Viewer reads them.
     */
    it('lets Admin raise and a Viewer only read', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shipped(org);

      const admin = await addMember(org, 'admin@alpha.example.com', 'Admin');
      const viewer = await addMember(org, 'viewer@alpha.example.com', 'Viewer');

      await viewer
        .post('/v1/return-authorizations')
        .send({
          orderId: s.orderId,
          reason: REASON,
          lines: [
            { lineId: s.capsulesLine, quantity: '1', resolution: 'credit' },
          ],
        })
        .expect(403);

      const rma = body<{ returnAuthorization: RmaResponse }>(
        await admin
          .post('/v1/return-authorizations')
          .send({
            orderId: s.orderId,
            reason: REASON,
            lines: [
              { lineId: s.capsulesLine, quantity: '1', resolution: 'credit' },
            ],
          })
          .expect(201),
      ).returnAuthorization;

      await viewer.get(`/v1/return-authorizations/${rma.id}`).expect(200);
      await viewer
        .post(`/v1/return-authorizations/${rma.id}/close`)
        .expect(403);
    });

    it('records who raised it, and names it by customer and number', async () => {
      const org = await registerOrganization(app, 'alpha');
      const rma = await raised(org, await shipped(org));

      const [entry] = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'return_authorization.created'));

      expect(entry.resourceId).toBe(rma.id);
      expect(entry.resourceLabel).toBe('Northside Pharmacy · RMA-000001');
    });
  });
});
