import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { stockLevels } from '../src/database/schema';
import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './utils/create-test-app';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface MovementResponse {
  movement: {
    id: string;
    reason: string;
    referenceType: string | null;
    referenceId: string | null;
  };
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * Samples, and stock that is not for sending (ADR-042).
 *
 * A posted sample is a sale flagged as one. A hand-out is a `sample` movement
 * with an optional recipient, checked against the organization so a recall can
 * trust it. And a location marked unavailable — a retention bin — holds stock
 * that may be moved but never sent: shipped, sampled or issued from it by
 * accident is the mistake this closes.
 */
describe('Samples (e2e)', () => {
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

  /** A product with 50 on a shelf, and a prospect to send some to. */
  async function scenario(org: Org) {
    const shelf = body<{ location: { id: string } }>(
      await org.agent
        .post('/v1/locations')
        .send({ type: 'site', name: 'Shelf' })
        .expect(201),
    ).location.id;

    const variant = body<{ product: { variants: { id: string }[] } }>(
      await org.agent
        .post('/v1/products')
        .send({ type: 'good', name: 'Focus', variant: { sku: 'FOCUS' } })
        .expect(201),
    ).product.variants[0].id;

    await org.agent
      .post('/v1/stock/movements')
      .send({
        variantId: variant,
        toLocationId: shelf,
        quantity: '50',
        reason: 'receipt',
      })
      .expect(201);

    const prospect = body<{ partner: { id: string } }>(
      await org.agent
        .post('/v1/partners')
        .send({ name: 'Prospect Pharmacy', code: 'PROS' })
        .expect(201),
    ).partner.id;

    return { shelf, variant, prospect };
  }

  async function onHand(variantId: string, locationId: string) {
    const [level] = await db
      .select()
      .from(stockLevels)
      .where(
        and(
          eq(stockLevels.variantId, variantId),
          eq(stockLevels.locationId, locationId),
        ),
      );
    return level?.quantity ?? '0.0000';
  }

  describe('hand-outs', () => {
    /** The recipient is what a recall finds: free stock still left the door. */
    it('records who a sample went to', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const { movement } = body<MovementResponse>(
        await alpha.agent
          .post('/v1/stock/movements')
          .send({
            variantId: s.variant,
            fromLocationId: s.shelf,
            quantity: '2',
            reason: 'sample',
            recipientPartnerId: s.prospect,
            note: 'Trade show',
          })
          .expect(201),
      );

      expect(movement.referenceType).toBe('partner');
      expect(movement.referenceId).toBe(s.prospect);
      expect(await onHand(s.variant, s.shelf)).toBe('48.0000');
    });

    it('sends a sample with no recipient', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const { movement } = body<MovementResponse>(
        await alpha.agent
          .post('/v1/stock/movements')
          .send({
            variantId: s.variant,
            fromLocationId: s.shelf,
            quantity: '1',
            reason: 'sample',
          })
          .expect(201),
      );

      expect(movement.referenceType).toBeNull();
    });

    // Another tenant's partner would put a stranger in this organization's
    // recall trail.
    it('refuses a recipient from another organization', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');
      const s = await scenario(alpha);
      const theirs = await scenario(beta);

      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: s.variant,
          fromLocationId: s.shelf,
          quantity: '1',
          reason: 'sample',
          recipientPartnerId: theirs.prospect,
        })
        .expect(400);

      expect(await onHand(s.variant, s.shelf)).toBe('50.0000');
    });

    it('refuses a recipient on anything but a sample', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: s.variant,
          fromLocationId: s.shelf,
          quantity: '1',
          reason: 'shipment',
          recipientPartnerId: s.prospect,
        })
        .expect(400);
    });

    /**
     * References are the server's to set: an order, a run, a shipment. A
     * client naming one could claim a movement belongs to another document —
     * or another tenant's — and poison the trail every recall reads.
     */
    it('refuses a reference set by the client', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: s.variant,
          fromLocationId: s.shelf,
          quantity: '1',
          reason: 'shipment',
          referenceType: 'shipment',
          referenceId: '00000000-0000-7000-8000-000000000000',
        })
        .expect(400);
    });
  });

  describe('stock not for sending', () => {
    async function retain(org: Org, shelf: string) {
      await org.agent
        .patch(`/v1/locations/${shelf}`)
        .send({ isAvailable: false })
        .expect(204);
    }

    it('refuses to sample or ship from a location marked unavailable', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);
      await retain(alpha, s.shelf);

      for (const reason of ['sample', 'shipment']) {
        await alpha.agent
          .post('/v1/stock/movements')
          .send({
            variantId: s.variant,
            fromLocationId: s.shelf,
            quantity: '1',
            reason,
          })
          .expect(409);
      }

      expect(await onHand(s.variant, s.shelf)).toBe('50.0000');
    });

    // Retained stock is still ours: moving it back to a shelf is allowed.
    it('still allows moving stock out of it', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);
      await retain(alpha, s.shelf);

      const back = body<{ location: { id: string } }>(
        await alpha.agent
          .post('/v1/locations')
          .send({ type: 'site', name: 'Back shelf' })
          .expect(201),
      ).location.id;

      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: s.variant,
          fromLocationId: s.shelf,
          toLocationId: back,
          quantity: '5',
          reason: 'transfer',
        })
        .expect(201);
    });
  });

  describe('posted samples', () => {
    it('flags a sale as a sample', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      const order = body<{ order: { id: string; isSample: boolean } }>(
        await alpha.agent
          .post('/v1/orders')
          .send({
            partnerId: s.prospect,
            direction: 'sale',
            isSample: true,
            lines: [
              {
                variantId: s.variant,
                quantityOrdered: '3',
                unitPrice: '0',
                currency: 'CAD',
              },
            ],
          })
          .expect(201),
      ).order;

      expect(order.isSample).toBe(true);
    });

    // Nobody sends a supplier a sample by buying from them.
    it('refuses a sample flag on a purchase', async () => {
      const alpha = await registerOrg('alpha');
      const s = await scenario(alpha);

      await alpha.agent
        .post('/v1/orders')
        .send({
          partnerId: s.prospect,
          direction: 'purchase',
          isSample: true,
          lines: [{ variantId: s.variant, quantityOrdered: '3' }],
        })
        .expect(400);
    });
  });
});
