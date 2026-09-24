import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';

import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './utils/create-test-app';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
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
  held: string;
  free: string;
  backordered: string;
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
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

  const PASSWORD = 'correct-horse-battery';

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(ThrottlerStorage)
        .useValue(unlimitedThrottler)
        .overrideProvider(MailService)
        .useValue(new RecordingMailService()),
    );

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

    await agent
      .post('/v1/auth/register')
      .send({
        email: `owner@${slugish}.example.com`,
        password: PASSWORD,
        name: 'Owner',
        organizationName: `${slugish} Co`,
      })
      .expect(201);

    return { agent };
  }

  type Org = Awaited<ReturnType<typeof registerOrg>>;

  /**
   * 100 on a shelf; two customers each confirm 60. The first confirmed holds
   * 60, the second holds the remaining 40 and is 20 short.
   */
  async function scenario(org: Org) {
    const { agent } = org;

    const shelf = body<{ location: { id: string } }>(
      await agent
        .post('/v1/locations')
        .send({ type: 'site', name: 'Shelf' })
        .expect(201),
    ).location.id;

    const focus = body<{ product: { variants: { id: string }[] } }>(
      await agent
        .post('/v1/products')
        .send({ type: 'good', name: 'Focus', variant: { sku: 'FOCUS' } })
        .expect(201),
    ).product.variants[0].id;

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
      const partner = body<{ partner: { id: string } }>(
        await agent.post('/v1/partners').send({ name }).expect(201),
      ).partner.id;

      const order = body<{ order: OrderResponse }>(
        await agent
          .post('/v1/orders')
          .send({
            partnerId: partner,
            direction: 'sale',
            lines: [{ variantId: focus, quantityOrdered: quantity }],
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
      const alpha = await registerOrg('alpha');
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

    // Confirming never refuses for lack of stock: a real order is real.
    it('confirms an order there is no stock for', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const partner = body<{ partner: { id: string } }>(
        await alpha.agent
          .post('/v1/partners')
          .send({ name: 'Third' })
          .expect(201),
      ).partner.id;

      const third = body<{ order: OrderResponse }>(
        await alpha.agent
          .post('/v1/orders')
          .send({
            partnerId: partner,
            direction: 'sale',
            lines: [{ variantId: s.focus, quantityOrdered: '10' }],
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
      const alpha = await registerOrg('alpha');
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
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const retention = body<{ location: { id: string } }>(
        await alpha.agent
          .post('/v1/locations')
          .send({ type: 'site', name: 'Retention' })
          .expect(201),
      ).location.id;
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
      const alpha = await registerOrg('alpha');
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
      const alpha = await registerOrg('alpha');
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

    /**
     * Held stock can still be moved and corrected: those record what
     * physically happened, and refusing them would put the ledger out of
     * step with the shelf.
     */
    it('still allows transfers and corrections of held stock', async () => {
      const alpha = await registerOrg('alpha');
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
      const alpha = await registerOrg('alpha');
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

  it('does not show another organization order holds', async () => {
    const alpha = await registerOrg('alpha');
    const beta = await registerOrg('beta');
    const s = await scenario(beta);

    await alpha.agent.get(`/v1/orders/${s.first.id}/holds`).expect(404);
  });
});
