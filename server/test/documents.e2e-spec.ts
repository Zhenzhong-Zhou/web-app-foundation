import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { documentText } from '../src/core/documents/document-text';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { auditLog, productVariants } from '../src/database/schema';
import { returnAuthorizationDocument } from '../src/modules/return-authorizations/return-authorization-document';
import type { ReturnAuthorizationPrint } from '../src/modules/return-authorizations/return-authorization-print.service';
import { wordsOf } from './utils/document-words';
import {
  body,
  createE2eApp,
  createLocation,
  createPartner,
  createVariant,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';
import { shippedSale } from './utils/sales';

/**
 * The three documents ADR-071 adds as PDFs: the purchase order, the pro
 * forma invoice and the return authorization. What is on the page is
 * checked by hand (MC-2509 to MC-2511); these hold the routes to their
 * rules: who gets which, what is refused, what is recorded.
 */
describe('Documents as PDF (e2e)', () => {
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

  /** A PDF, as Print opens it or Download PDF saves it. */
  async function pdf(org: Org, path: string, status = 200) {
    return org.agent.get(path).responseType('blob').expect(status);
  }

  function isPdf(res: { body: unknown }) {
    return (res.body as Buffer).toString('latin1').startsWith('%PDF-');
  }

  describe('the purchase order', () => {
    it('draws one with a line not yet priced, to print or download', async () => {
      const org = await registerOrganization(app, 'alpha');
      const supplierId = await createPartner(org.agent, {
        name: 'Pacific Capsule Supply',
        code: 'PCS',
      });
      await createLocation(org.agent, { type: 'site', name: 'Main' });
      const capsules = await createVariant(org.agent, {
        type: 'good',
        name: 'Gelatin capsules',
        variant: { sku: 'GEL-00' },
      });
      const caps = await createVariant(org.agent, {
        type: 'good',
        name: 'Caps',
        variant: { sku: 'CAP-38' },
      });

      const order = body<{ order: { id: string } }>(
        await org.agent
          .post('/v1/orders')
          .send({
            partnerId: supplierId,
            direction: 'purchase',
            lines: [
              {
                variantId: capsules,
                quantityOrdered: '20',
                unitPrice: '45',
                currency: 'CAD',
              },
              // Raised before its price is known (ADR-046).
              { variantId: caps, quantityOrdered: '4000' },
            ],
          })
          .expect(201),
      ).order;

      const shown = await pdf(org, `/v1/orders/${order.id}/pdf`);
      expect(shown.headers['content-type']).toBe('application/pdf');
      expect(shown.headers['content-disposition']).toMatch(
        /^inline; filename="PO-000001\.pdf"/,
      );
      expect(isPdf(shown)).toBe(true);

      const saved = await pdf(org, `/v1/orders/${order.id}/pdf?download=1`);
      expect(saved.headers['content-disposition']).toMatch(/^attachment;/);
    });

    it('refuses a sale, whose document is its pro forma', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shippedSale(org.agent);

      await org.agent.get(`/v1/orders/${s.orderId}/pdf`).expect(400);
    });
  });

  describe('the pro forma invoice', () => {
    async function gst(org: Org) {
      return body<{ taxCode: { id: string } }>(
        await org.agent
          .post('/v1/tax-codes')
          .send({ name: 'GST', components: [{ name: 'GST', rate: '5' }] })
          .expect(201),
      ).taxCode.id;
    }

    it('values a sale as its invoice would, and records each one made', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shippedSale(org.agent);
      const taxCodeId = await gst(org);

      const made = await pdf(
        org,
        `/v1/orders/${s.orderId}/pro-forma?taxCodeId=${taxCodeId}`,
      );
      expect(made.headers['content-disposition']).toMatch(
        /^inline; filename="SO-000001-pro-forma\.pdf"/,
      );
      expect(isPdf(made)).toBe(true);

      const entries = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'order.pro_forma_made'));
      expect(entries).toHaveLength(1);
      expect(entries[0].resourceId).toBe(s.orderId);
      // 10 and 5 at 12.50 is 187.50; GST of 9.375 rounds to 9.38.
      expect(entries[0].payload).toEqual({
        total: '196.8800',
        currency: 'CAD',
        taxCodeId,
      });
    });

    it('refuses a purchase, a sample, an unpriced or cancelled sale, and another organization’s tax code', async () => {
      const org = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');
      const s = await shippedSale(org.agent);
      const sample = await shippedSale(beta.agent, { isSample: true });
      const theirs = await gst(beta);

      const extra = await createVariant(org.agent, {
        type: 'good',
        name: 'Extra',
        variant: { sku: 'EXTRA' },
      });
      const unpriced = body<{ order: { id: string } }>(
        await org.agent
          .post('/v1/orders')
          .send({
            partnerId: s.partnerId,
            direction: 'sale',
            lines: [{ variantId: extra, quantityOrdered: '1' }],
          })
          .expect(201),
      ).order;
      const purchase = body<{ order: { id: string } }>(
        await org.agent
          .post('/v1/orders')
          .send({
            partnerId: s.partnerId,
            direction: 'purchase',
            lines: [{ variantId: extra, quantityOrdered: '1' }],
          })
          .expect(201),
      ).order;

      const proForma = (agent: Org['agent'], orderId: string, query = '') =>
        agent.get(`/v1/orders/${orderId}/pro-forma${query}`);

      await proForma(org.agent, purchase.id).expect(400);
      await proForma(beta.agent, sample.orderId).expect(409);
      await proForma(org.agent, unpriced.id).expect(409);
      await proForma(org.agent, s.orderId, `?taxCodeId=${theirs}`).expect(400);

      await org.agent
        .patch(`/v1/orders/${unpriced.id}`)
        .send({ status: 'cancelled' })
        .expect(204);
      await proForma(org.agent, unpriced.id).expect(409);

      // A refusal makes nothing, so it records nothing.
      expect(
        await db
          .select()
          .from(auditLog)
          .where(eq(auditLog.action, 'order.pro_forma_made')),
      ).toHaveLength(0);
    });
  });

  describe('the return authorization', () => {
    it('draws one, and another organization’s not at all', async () => {
      const org = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');
      const s = await shippedSale(org.agent);

      const rma = body<{ returnAuthorization: { id: string } }>(
        await org.agent
          .post('/v1/return-authorizations')
          .send({
            orderId: s.orderId,
            reason: 'Two bottles arrived cracked',
            lines: [
              { lineId: s.capsulesLine, quantity: '2', resolution: 'credit' },
            ],
          })
          .expect(201),
      ).returnAuthorization;

      const shown = await pdf(org, `/v1/return-authorizations/${rma.id}/pdf`);
      expect(shown.headers['content-disposition']).toMatch(
        /^inline; filename="RMA-000001\.pdf"/,
      );
      expect(isPdf(shown)).toBe(true);

      await beta.agent
        .get(`/v1/return-authorizations/${rma.id}/pdf`)
        .expect(404);
    });

    it('says to send the goods to the label only while it is open', () => {
      const rma: ReturnAuthorizationPrint = {
        number: 'RMA-000001',
        status: 'open',
        createdAt: new Date('2026-10-16T10:00:00Z'),
        orderNumber: 'SO-000001',
        invoiceNumber: null,
        reason: 'Arrived cracked',
        expectsGoods: true,
        note: null,
        language: 'en',
        secondLanguage: null,
        seller: { name: 'Acme', taxNumber: null, address: null },
        customerName: 'Northside Pharmacy',
        customerAddress: null,
        sendBackTo: null,
        lines: [
          {
            sku: 'FOCUS-60CT',
            description: 'Focus capsules',
            secondDescription: null,
            quantity: '2',
            resolution: 'credit',
          },
        ],
        raisedBy: null,
      };
      const english = documentText('en', null, 'CA');
      const words = (over: Partial<ReturnAuthorizationPrint>) =>
        wordsOf(returnAuthorizationDocument({ ...rma, ...over }, english));

      expect(words({})).toContain('the address on the label below');
      expect(words({})).toContain('Cut out and tape to the box');
      // Closed or cancelled, there is no label to point at.
      for (const status of ['closed', 'cancelled'] as const) {
        expect(words({ status })).not.toContain('label below');
        expect(words({ status })).not.toContain('Cut out and tape to the box');
      }
      expect(words({ expectsGoods: false })).toContain(
        'Nothing needs to be sent back.',
      );
    });

    it('names only its own lines, so one not returned refuses nothing', async () => {
      const org = await registerOrganization(app, 'alpha');
      const s = await shippedSale(org.agent);
      await org.agent
        .patch('/v1/organization')
        .send({ requiredNameLanguages: ['zh-Hans'] })
        .expect(204);
      await org.agent
        .patch(`/v1/partners/${s.partnerId}`)
        .send({ documentLanguage: 'zh-Hans', documentSecondLanguage: 'en' })
        .expect(204);
      // The capsules have their Chinese name; the scoop, on the same
      // order, has none.
      const [capsules] = await db
        .select({ productId: productVariants.productId })
        .from(productVariants)
        .where(eq(productVariants.sku, 'FOCUS-60CT'));
      await org.agent
        .put(`/v1/products/${capsules.productId}/translations`)
        .send({ translations: [{ locale: 'zh-Hans', name: '专注胶囊' }] })
        .expect(204);

      const raise = async (lineId: string) =>
        body<{ returnAuthorization: { id: string } }>(
          await org.agent
            .post('/v1/return-authorizations')
            .send({
              orderId: s.orderId,
              reason: 'Arrived cracked',
              lines: [{ lineId, quantity: '1', resolution: 'credit' }],
            })
            .expect(201),
        ).returnAuthorization.id;

      const returningCapsules = await raise(s.capsulesLine);
      expect(
        isPdf(
          await pdf(org, `/v1/return-authorizations/${returningCapsules}/pdf`),
        ),
      ).toBe(true);

      // Returned, the scoop needs its name, as an invoice would.
      const returningScoop = await raise(s.scoopLine);
      const refused = await org.agent
        .get(`/v1/return-authorizations/${returningScoop}/pdf`)
        .expect(409);
      expect(body<{ message: string }>(refused).message).toMatch(
        /^SCOOP has no .*Chinese name/,
      );
    });
  });
});
