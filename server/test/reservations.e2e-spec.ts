import type { INestApplication } from '@nestjs/common';

import {
  body,
  createE2eApp,
  createLocation,
  createPartner,
  createVariant,
  registerOrganization,
} from './utils/fixtures';
import {
  item,
  order,
  partner,
  receive,
  recipe,
  run,
  site,
} from './utils/reorder-world';
import { resetDatabase } from './utils/reset-db';

interface OrderResponse {
  id: string;
  lines: { id: string }[];
}

interface Hold {
  lineId: string;
  outstanding: string;
  held: string;
  short: string;
}

interface Availability {
  sku: string;
  onHand: string;
  notUsable: string;
  expired: string;
  issued: string;
  unavailable: string;
  held: string;
  free: string;
  backordered: string;
}

interface Refusal {
  message: string;
  code?: string;
  details?: { productId?: string };
}

/**
 * Reservations (ADR-045). Holds are computed from open confirmed sale lines,
 * earliest confirmed first, against stock at available locations. What is
 * pinned here: the priority, the backorder, release on cancel, retention
 * stock not counting, and every path that takes stock respecting holds it
 * does not own.
 */
describe('Reservations (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  type Org = Awaited<ReturnType<typeof registerOrganization>>;

  /**
   * 100 on a shelf; two customers each confirm 60. The first confirmed holds
   * 60, the second holds the remaining 40 and is 20 short.
   */
  async function scenario(org: Org) {
    const { agent } = org;

    const shelf = await createLocation(agent, { type: 'site', name: 'Shelf' });

    const focus = await createVariant(agent, {
      type: 'good',
      name: 'Focus',
      variant: { sku: 'FOCUS' },
    });

    await agent
      .post('/v1/stock/movements')
      .send({
        variantId: focus,
        toLocationId: shelf,
        quantity: '100',
        reason: 'receipt',
      })
      .expect(201);

    const sale = async (name: string, quantity: string) => {
      const partner = await createPartner(agent, { name });

      const order = body<{ order: OrderResponse }>(
        await agent
          .post('/v1/orders')
          .send({
            partnerId: partner,
            direction: 'sale',
            lines: [
              {
                variantId: focus,
                quantityOrdered: quantity,
                unitPrice: '10',
                currency: 'CAD',
              },
            ],
          })
          .expect(201),
      ).order;

      await agent
        .patch(`/v1/orders/${order.id}`)
        .send({ status: 'confirmed' })
        .expect(204);

      return order;
    };

    const first = await sale('First Pharmacy', '60');
    const second = await sale('Second Pharmacy', '60');

    return { shelf, focus, first, second };
  }

  async function holds(org: Org, orderId: string) {
    return body<Hold[]>(
      await org.agent.get(`/v1/orders/${orderId}/holds`).expect(200),
    )[0];
  }

  describe('holds', () => {
    it('holds for the earliest confirmed first, and backorders the rest', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const s = await scenario(alpha);

      expect(await holds(alpha, s.first.id)).toMatchObject({
        held: '60.0000',
        short: '0.0000',
      });
      expect(await holds(alpha, s.second.id)).toMatchObject({
        held: '40.0000',
        short: '20.0000',
      });

      const [row] = body<Availability[]>(
        await alpha.agent.get('/v1/stock/availability').expect(200),
      );
      expect(row).toMatchObject({
        sku: 'FOCUS',
        onHand: '100.0000',
        held: '100.0000',
        free: '0.0000',
        backordered: '20.0000',
      });
    });

    // The Inventory page's "Promised to customers" table asks for only these:
    // at ADR-051's large scale the full list was 5,000 rows a call.
    it('lists only what something is promised from, when asked', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const s = await scenario(alpha);

      const calm = await createVariant(alpha.agent, {
        type: 'good',
        name: 'Calm',
        variant: { sku: 'CALM' },
      });

      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: calm,
          toLocationId: s.shelf,
          quantity: '10',
          reason: 'receipt',
        })
        .expect(201);

      const skus = async (query: string) => {
        const res = await alpha.agent
          .get(`/v1/stock/availability${query}`)
          .expect(200);
        return body<Availability[]>(res).map((row) => row.sku);
      };

      expect(await skus('')).toEqual(['CALM', 'FOCUS']);
      expect(await skus('?promised=true')).toEqual(['FOCUS']);
    });

    // Inventory for one item, opened by a row's stock on Items, listed
    // every item's promises below it (ADR-092's review, 6).
    it('lists one item alone when asked, refusing another organization’s', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');
      const s = await scenario(alpha);
      const calm = body<{
        product: { id: string; variants: { id: string }[] };
      }>(
        await alpha.agent
          .post('/v1/products')
          .send({ type: 'good', name: 'Calm', variant: { sku: 'CALM' } })
          .expect(201),
      ).product;
      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: calm.variants[0].id,
          toLocationId: s.shelf,
          quantity: '10',
          reason: 'receipt',
        })
        .expect(201);
      const [focus] = body<{ entries: { id: string }[] }>(
        await alpha.agent.get('/v1/products?search=FOCUS').expect(200),
      ).entries;

      const skus = async (query: string) => {
        const res = await alpha.agent
          .get(`/v1/stock/availability${query}`)
          .expect(200);
        return body<Availability[]>(res).map((row) => row.sku);
      };

      expect(await skus(`?productId=${calm.id}`)).toEqual(['CALM']);
      expect(await skus(`?promised=true&productId=${calm.id}`)).toEqual([]);
      expect(await skus(`?promised=true&productId=${focus.id}`)).toEqual([
        'FOCUS',
      ]);
      await beta.agent
        .get(`/v1/stock/availability?productId=${calm.id}`)
        .expect(400);
    });

    // Confirming never refuses for lack of stock: a real order is real.
    it('confirms an order there is no stock for', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const s = await scenario(alpha);

      const partner = await createPartner(alpha.agent, { name: 'Third' });

      const third = body<{ order: OrderResponse }>(
        await alpha.agent
          .post('/v1/orders')
          .send({
            partnerId: partner,
            direction: 'sale',
            lines: [
              {
                variantId: s.focus,
                quantityOrdered: '10',
                unitPrice: '10',
                currency: 'CAD',
              },
            ],
          })
          .expect(201),
      ).order;

      await alpha.agent
        .patch(`/v1/orders/${third.id}`)
        .send({ status: 'confirmed' })
        .expect(204);

      expect(await holds(alpha, third.id)).toMatchObject({
        held: '0.0000',
        short: '10.0000',
      });
    });

    it('releases a hold when its order is cancelled', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const s = await scenario(alpha);

      await alpha.agent
        .patch(`/v1/orders/${s.first.id}`)
        .send({ status: 'cancelled' })
        .expect(204);

      expect(await holds(alpha, s.second.id)).toMatchObject({
        held: '60.0000',
        short: '0.0000',
      });
    });

    // Retained or quarantined stock cannot be promised (ADR-042).
    it('does not count stock at an unavailable location', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const s = await scenario(alpha);

      const retention = await createLocation(alpha.agent, {
        type: 'site',
        name: 'Retention',
      });
      await alpha.agent
        .patch(`/v1/locations/${retention}`)
        .send({ isAvailable: false })
        .expect(204);

      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: s.focus,
          fromLocationId: s.shelf,
          toLocationId: retention,
          quantity: '10',
          reason: 'transfer',
        })
        .expect(201);

      expect(await holds(alpha, s.second.id)).toMatchObject({
        held: '30.0000',
        short: '30.0000',
      });
    });
  });

  describe('taking stock', () => {
    it('lets an order ship its own hold, but not another order', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const s = await scenario(alpha);

      // The second order holds 40; 50 would take 10 of the first's.
      await alpha.agent
        .post(`/v1/orders/${s.second.id}/shipments`)
        .send({
          fromLocationId: s.shelf,
          lines: [{ lineId: s.second.lines[0].id, quantity: '50' }],
        })
        .expect(409);

      await alpha.agent
        .post(`/v1/orders/${s.second.id}/shipments`)
        .send({
          fromLocationId: s.shelf,
          lines: [{ lineId: s.second.lines[0].id, quantity: '40' }],
        })
        .expect(201);

      await alpha.agent
        .post(`/v1/orders/${s.first.id}/shipments`)
        .send({
          fromLocationId: s.shelf,
          lines: [{ lineId: s.first.lines[0].id, quantity: '60' }],
        })
        .expect(201);
    });

    // A hand-out or a one-off shipment may take only what nobody holds.
    it('refuses a sample or one-off shipment of held stock', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const s = await scenario(alpha);

      for (const reason of ['sample', 'shipment']) {
        await alpha.agent
          .post('/v1/stock/movements')
          .send({
            variantId: s.focus,
            fromLocationId: s.shelf,
            quantity: '1',
            reason,
          })
          .expect(409);
      }
    });

    // Whose hold it is, in the reader's language too (#129).
    it('says who holds the stock in the reader’s language', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const s = await scenario(alpha);

      const handOut = (language: string) =>
        alpha.agent
          .post('/v1/stock/movements')
          .set('Accept-Language', language)
          .send({
            variantId: s.focus,
            fromLocationId: s.shelf,
            quantity: '1',
            reason: 'sample',
          })
          .expect(409);
      // The second order holds 40; 50 would take 10 of the first's.
      const ship = (language: string) =>
        alpha.agent
          .post(`/v1/orders/${s.second.id}/shipments`)
          .set('Accept-Language', language)
          .send({
            fromLocationId: s.shelf,
            lines: [{ lineId: s.second.lines[0].id, quantity: '50' }],
          })
          .expect(409);
      const message = async (refusal: ReturnType<typeof ship>) =>
        body<{ message: string }>(await refusal).message;

      expect(await message(handOut('fr-CA'))).toMatch(
        /réservé pour des commandes confirmées\.$/,
      );
      expect(await message(handOut('zh-Hans'))).toMatch(
        /已为 已确认的订单 预留。$/,
      );
      expect(await message(ship('fr-CA'))).toMatch(
        /réservé pour d’autres commandes\.$/,
      );
      expect(await message(ship('zh-Hans'))).toMatch(/已为 其他订单 预留。$/);
    });

    /**
     * Held stock can still be moved and corrected: those record what
     * physically happened, and refusing them would put the ledger out of
     * step with the shelf.
     */
    it('still allows transfers and corrections of held stock', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const s = await scenario(alpha);

      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: s.focus,
          fromLocationId: s.shelf,
          quantity: '1',
          reason: 'adjustment',
          reasonDetail: 'damaged',
          note: 'Crushed box',
        })
        .expect(201);
    });

    it('frees stock for others once an order ships', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const s = await scenario(alpha);

      await alpha.agent
        .post(`/v1/orders/${s.first.id}/shipments`)
        .send({
          fromLocationId: s.shelf,
          lines: [{ lineId: s.first.lines[0].id, quantity: '60' }],
        })
        .expect(201);

      // 40 left, all the second order's: nothing free for a sample.
      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: s.focus,
          fromLocationId: s.shelf,
          quantity: '1',
          reason: 'sample',
        })
        .expect(409);

      // Closing the second short frees what it held.
      await alpha.agent
        .post(`/v1/orders/${s.second.id}/lines/${s.second.lines[0].id}/close`)
        .send({ reason: 'Customer took what we had elsewhere' })
        .expect(204);

      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: s.focus,
          fromLocationId: s.shelf,
          quantity: '1',
          reason: 'sample',
        })
        .expect(201);
    });
  });

  /**
   * Holds draw on usable stock alone (ADR-045 amended by ADR-093): an
   * expired lot and what a released run was issued stay on the shelf,
   * but hold nothing and leave Free, so a row's Free and its status
   * cannot disagree, and a shipment may not take them from an order
   * that needs them.
   */
  describe('usable stock', () => {
    async function availabilityOf(org: Org, sku: string) {
      const rows = body<Availability[]>(
        await org.agent.get('/v1/stock/availability').expect(200),
      );
      return rows.find((row) => row.sku === sku);
    }

    async function productOf(org: Org, sku: string) {
      const [entry] = body<{ entries: { id: string }[] }>(
        await org.agent.get(`/v1/products?search=${sku}`).expect(200),
      ).entries;
      return entry.id;
    }

    /** 40 in an expired lot and 60 in a good one, on one shelf. */
    async function expiredWorld(org: Org) {
      const vitc = await item(org.agent, 'VITC', true);
      const shelf = await site(org.agent, 'SHELF');
      await receive(org.agent, vitc, shelf, '40', {
        code: 'L-OLD',
        expiresAt: '2020-01-01',
      });
      await receive(org.agent, vitc, shelf, '60', {
        code: 'L-NEW',
        expiresAt: '2099-01-01',
      });
      return { vitc, shelf };
    }

    it('leaves an expired lot, an issued quantity and a place not available out of Free, each said beside On hand', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const bottle = await item(alpha.agent, 'BOTTLE', true);
      const focus = await item(alpha.agent, 'FOCUS-60CT');
      const shelf = await site(alpha.agent, 'SHELF');
      const kitchen = await site(alpha.agent, 'KITCHEN');
      const quarantine = await site(alpha.agent, 'QUARANTINE', false);
      await receive(alpha.agent, bottle, shelf, '40', {
        code: 'L-OLD',
        expiresAt: '2020-01-01',
      });
      await receive(alpha.agent, bottle, shelf, '500', {
        code: 'L-NEW',
        expiresAt: '2099-01-01',
      });
      await receive(alpha.agent, bottle, quarantine, '30', { code: 'L-NEW' });
      const bomId = await recipe(alpha.agent, focus, bottle, '1');
      // Earliest expiry first issues the expired 40, then 60 good ones.
      await run(
        alpha.agent,
        { outputId: focus, bomId, locationId: kitchen, quantityPlanned: '100' },
        shelf,
      );
      const customer = await partner(alpha.agent, 'Northside Pharmacy');
      await order(alpha.agent, 'sale', customer, bottle, '400');

      expect(await availabilityOf(alpha, 'BOTTLE')).toMatchObject({
        onHand: '570.0000',
        notUsable: '130.0000',
        expired: '40.0000',
        issued: '60.0000',
        unavailable: '30.0000',
        held: '400.0000',
        // 440 usable on the shelf, less the 400 held.
        free: '40.0000',
        backordered: '0.0000',
      });
    });

    it('holds for the earliest confirmed first from usable stock, and the last goes short', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const { vitc } = await expiredWorld(alpha);
      const customer = await partner(alpha.agent, 'Northside Pharmacy');
      const first = await order(alpha.agent, 'sale', customer, vitc, '50');
      const second = await order(alpha.agent, 'sale', customer, vitc, '50');

      expect(await holds(alpha, first.id)).toMatchObject({
        held: '50.0000',
        short: '0.0000',
      });
      expect(await holds(alpha, second.id)).toMatchObject({
        held: '10.0000',
        short: '40.0000',
      });
      expect(await availabilityOf(alpha, 'VITC')).toMatchObject({
        onHand: '100.0000',
        notUsable: '40.0000',
        held: '60.0000',
        free: '0.0000',
        backordered: '40.0000',
      });
    });

    it('refuses a shipment that would take expired stock another order needs, saying how many, with the item', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const { vitc, shelf } = await expiredWorld(alpha);
      const customer = await partner(alpha.agent, 'Northside Pharmacy');
      await order(alpha.agent, 'sale', customer, vitc, '50');
      const second = await order(alpha.agent, 'sale', customer, vitc, '50');

      const shipping = (quantity: string, language = 'en') =>
        alpha.agent
          .post(`/v1/orders/${second.id}/shipments`)
          .set('Accept-Language', language)
          .send({
            fromLocationId: shelf,
            lines: [{ lineId: second.lineId, quantity }],
          });

      // Its own 10, and nothing more: the rest on the shelf is the
      // first order's 50 and 40 expired.
      const refusal = body<Refusal>(await shipping('20').expect(409));
      expect(refusal.message).toBe(
        'Only 10.0000 VITC can be taken: 50.0000 is held for other orders, and 40.0000 more is expired or issued to a run. Where it stands, on the item’s page, shows which.',
      );
      expect(refusal.code).toBe('stock_not_usable');
      expect(refusal.details).toEqual({
        productId: await productOf(alpha, 'VITC'),
      });
      expect(
        body<Refusal>(await shipping('20', 'zh-Hans').expect(409)).message,
      ).toMatch(/另有 40\.0000 已过期或已领用。/);
      expect(
        body<Refusal>(await shipping('20', 'fr-CA').expect(409)).message,
      ).toMatch(/40\.0000 de plus est périmé/);

      await shipping('10').expect(201);
    });

    it('refuses a shipment that would take stock issued to a run another order needs', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const bottle = await item(alpha.agent, 'BOTTLE');
      const focus = await item(alpha.agent, 'FOCUS-60CT');
      const shelf = await site(alpha.agent, 'SHELF');
      await receive(alpha.agent, bottle, shelf, '100');
      const customer = await partner(alpha.agent, 'Northside Pharmacy');
      await order(alpha.agent, 'sale', customer, bottle, '60');
      const bomId = await recipe(alpha.agent, focus, bottle, '1');
      // Made where it is kept: release moves nothing, and the 30 stay
      // on the shelf, issued.
      await run(
        alpha.agent,
        { outputId: focus, bomId, locationId: shelf, quantityPlanned: '30' },
        shelf,
      );
      const second = await order(alpha.agent, 'sale', customer, bottle, '30');

      expect(await holds(alpha, second.id)).toMatchObject({
        held: '10.0000',
        short: '20.0000',
      });

      const refusal = body<Refusal>(
        await alpha.agent
          .post(`/v1/orders/${second.id}/shipments`)
          .send({
            fromLocationId: shelf,
            lines: [{ lineId: second.lineId, quantity: '20' }],
          })
          .expect(409),
      );
      expect(refusal.message).toMatch(
        /^Only 10\.0000 BOTTLE can be taken: 60\.0000 is held for other orders, and 30\.0000 more is expired or issued to a run\./,
      );
      expect(refusal.code).toBe('stock_not_usable');
    });
  });

  it('does not show another organization order holds', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const beta = await registerOrganization(app, 'beta');
    const s = await scenario(beta);

    await alpha.agent.get(`/v1/orders/${s.first.id}/holds`).expect(404);
  });
});
