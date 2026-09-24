import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { lots } from '../src/database/schema';
import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './utils/create-test-app';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface Trace {
  lot: { code: string; sku: string };
  balances: { locationName: string; quantity: string }[];
  sources: {
    kind: 'receipt' | 'production';
    supplierName: string | null;
    runReference: string | null;
  }[];
  madeFrom: { code: string; depth: number }[];
  wentInto: { code: string; depth: number }[];
  recipients: {
    partnerName: string | null;
    lotCode: string;
    shipped: string;
    sampled: string;
    returned: string;
  }[];
}

interface OrderResponse {
  id: string;
  lines: { id: string }[];
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * The recall question, end to end (ADR-044). An ingredient lot is bought from
 * a supplier, blended into a batch, and the batch goes to a customer, a
 * prospect's sample, and somewhere unrecorded — then some comes back. Tracing
 * the ingredient must reach every one of them; tracing the batch must reach
 * back to the supplier.
 */
describe('Lot trace (e2e)', () => {
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

  async function created<T>(
    request: ReturnType<Org['agent']['post']>,
  ): Promise<T> {
    return body<T>(await request.expect(201));
  }

  async function lotId(code: string) {
    const [lot] = await db.select().from(lots).where(eq(lots.code, code));
    return lot.id;
  }

  async function story(org: Org) {
    const { agent } = org;

    const shelf = (
      await created<{ location: { id: string } }>(
        agent.post('/v1/locations').send({ type: 'site', name: 'Shelf' }),
      )
    ).location.id;

    const partner = async (name: string, code: string) =>
      (
        await created<{ partner: { id: string } }>(
          agent.post('/v1/partners').send({ name, code }),
        )
      ).partner.id;

    const supplier = await partner('Herb Supply Co', 'HERB');
    const customer = await partner('Northside Pharmacy', 'NORTH');
    const prospect = await partner('Prospect Health', 'PROS');

    const variant = async (sku: string, type: string) =>
      (
        await created<{ product: { variants: { id: string }[] } }>(
          agent.post('/v1/products').send({
            type,
            name: sku,
            variant: { sku, tracksLots: true },
          }),
        )
      ).product.variants[0].id;

    const blend = await variant('BLEND', 'material');
    const focus = await variant('FOCUS', 'good');

    // Bought from a supplier, received into lot BF-1.
    const purchase = (
      await created<{ order: OrderResponse }>(
        agent.post('/v1/orders').send({
          partnerId: supplier,
          direction: 'purchase',
          reference: 'PO-1',
          lines: [{ variantId: blend, quantityOrdered: '100' }],
        }),
      )
    ).order;
    await agent
      .patch(`/v1/orders/${purchase.id}`)
      .send({ status: 'confirmed' })
      .expect(204);
    await agent
      .post(`/v1/orders/${purchase.id}/lines/${purchase.lines[0].id}/receipts`)
      .send({ toLocationId: shelf, quantity: '100', lot: { code: 'BF-1' } })
      .expect(201);

    // Blended into batch FOC-1, in place on the shelf.
    const bom = (
      await created<{ bom: { id: string } }>(
        agent.post('/v1/boms').send({
          outputVariantId: focus,
          outputQuantity: '10',
          lines: [{ componentVariantId: blend, quantity: '5' }],
        }),
      )
    ).bom.id;
    await agent.post(`/v1/boms/${bom}/promote`).expect(204);

    const run = (
      await created<{ productionOrder: { id: string } }>(
        agent.post('/v1/production-orders').send({
          outputVariantId: focus,
          bomId: bom,
          locationId: shelf,
          quantityPlanned: '100',
          reference: 'RUN-1',
        }),
      )
    ).productionOrder.id;
    await agent
      .post(`/v1/production-orders/${run}/release`)
      .send({ sourceLocationId: shelf })
      .expect(200);
    await agent
      .post(`/v1/production-orders/${run}/output`)
      .send({ quantity: '100', lot: { code: 'FOC-1' } })
      .expect(201);
    await agent.post(`/v1/production-orders/${run}/close`).send({}).expect(200);

    // Out: sold to a customer, sampled to a prospect, shipped with no order.
    const sale = (
      await created<{ order: OrderResponse }>(
        agent.post('/v1/orders').send({
          partnerId: customer,
          direction: 'sale',
          reference: 'SO-1',
          lines: [{ variantId: focus, quantityOrdered: '30' }],
        }),
      )
    ).order;
    await agent
      .patch(`/v1/orders/${sale.id}`)
      .send({ status: 'confirmed' })
      .expect(204);
    await agent
      .post(`/v1/orders/${sale.id}/shipments`)
      .send({
        fromLocationId: shelf,
        lines: [{ lineId: sale.lines[0].id, quantity: '30' }],
      })
      .expect(201);

    await agent
      .post('/v1/stock/movements')
      .send({
        variantId: focus,
        lotId: await lotId('FOC-1'),
        fromLocationId: shelf,
        quantity: '2',
        reason: 'sample',
        recipientPartnerId: prospect,
      })
      .expect(201);

    await agent
      .post('/v1/stock/movements')
      .send({
        variantId: focus,
        lotId: await lotId('FOC-1'),
        fromLocationId: shelf,
        quantity: '5',
        reason: 'shipment',
      })
      .expect(201);

    // Some comes back.
    await agent
      .post(`/v1/orders/${sale.id}/returns`)
      .send({
        toLocationId: shelf,
        lines: [
          {
            lineId: sale.lines[0].id,
            lots: [{ lotId: await lotId('FOC-1'), quantity: '4' }],
          },
        ],
      })
      .expect(201);
  }

  async function trace(org: Org, code: string) {
    return body<Trace>(
      await org.agent
        .get(`/v1/stock/lots/${await lotId(code)}/trace`)
        .expect(200),
    );
  }

  it('follows an ingredient through the batch to everyone who received it', async () => {
    const alpha = await registerOrg('alpha');
    await story(alpha);

    const found = await trace(alpha, 'BF-1');

    expect(found.lot).toMatchObject({ code: 'BF-1', sku: 'BLEND' });
    expect(found.sources).toMatchObject([
      { kind: 'receipt', supplierName: 'Herb Supply Co' },
    ]);
    expect(found.wentInto).toMatchObject([{ code: 'FOC-1', depth: 1 }]);

    // The ingredient's own movements never name a customer; the batch's do.
    const byWho = found.recipients.map((row) => [
      row.partnerName,
      row.lotCode,
      row.shipped,
      row.sampled,
      row.returned,
    ]);
    expect(byWho).toEqual([
      ['Northside Pharmacy', 'FOC-1', '30.0000', '0', '4.0000'],
      ['Prospect Health', 'FOC-1', '0', '2.0000', '0'],
      // Shipped with no order: kept, with nobody to name.
      [null, 'FOC-1', '5.0000', '0', '0'],
    ]);
  });

  it('follows a batch back to the supplier of what went into it', async () => {
    const alpha = await registerOrg('alpha');
    await story(alpha);

    const found = await trace(alpha, 'FOC-1');

    expect(found.sources).toMatchObject([
      { kind: 'production', runReference: 'RUN-1' },
    ]);
    expect(found.madeFrom).toMatchObject([{ code: 'BF-1', depth: 1 }]);
    expect(found.wentInto).toEqual([]);

    // 100 made, 30 shipped, 2 sampled, 5 shipped unrecorded, 4 back.
    expect(found.balances).toEqual([
      expect.objectContaining({ locationName: 'Shelf', quantity: '67.0000' }),
    ]);
  });

  it('does not trace another organization lot', async () => {
    const alpha = await registerOrg('alpha');
    const beta = await registerOrg('beta');
    await story(beta);

    await alpha.agent
      .get(`/v1/stock/lots/${await lotId('FOC-1')}/trace`)
      .expect(404);
  });
});
