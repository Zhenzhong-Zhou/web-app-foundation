import type { INestApplication } from '@nestjs/common';

import {
  addMember,
  body,
  createE2eApp,
  customRole,
  registerOrganization,
} from './utils/fixtures';
import {
  closeShort,
  item,
  order,
  partner,
  receiveLine,
  site,
} from './utils/reorder-world';
import { resetDatabase } from './utils/reset-db';

type Org = Awaited<ReturnType<typeof registerOrganization>>;

interface Delivery {
  orderId: string;
  number: string;
  partnerName: string;
  expectedAt: string | null;
  late: boolean;
  line: {
    id: string;
    variantId: string;
    productId: string;
    sku: string;
    tracksLots: boolean;
    unitOfMeasure: string;
    quantityOrdered: string;
    quantityFulfilled: string;
    quantityOutstanding: string;
  };
}

/**
 * The deliveries a receipt of an item may be (ADR-093, v3): Stock asks
 * which one before receiving an item still to come, so ordered stock is
 * received on its order, not beside it, which would leave the order open
 * and count the stock twice. They are Coming's purchases, line by line.
 */
describe('Deliveries a receipt may be (e2e)', () => {
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

  async function deliveries(org: Org, variantId: string) {
    return body<Delivery[]>(
      await org.agent
        .get(`/v1/orders/deliveries?variantId=${variantId}`)
        .expect(200),
    );
  }

  /** The item's Coming as Stock's row shows it. */
  async function coming(org: Org, sku: string) {
    const rows = body<{ entries: { sku: string; coming: string }[] }>(
      await org.agent.get(`/v1/stock/by-code?search=${sku}`).expect(200),
    ).entries;
    return rows.find((row) => row.sku === sku)?.coming;
  }

  it('lists each confirmed purchase still to come, the day expected first, and receiving on it lowers Coming', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const vitc = await item(alpha.agent, 'VITC');
    const shelf = await site(alpha.agent, 'SHELF');
    const harbour = await partner(alpha.agent, 'Harbour Supply');
    const later = await order(alpha.agent, 'purchase', harbour, vitc, '30', {
      expectedAt: '2099-02-01',
    });
    const sooner = await order(alpha.agent, 'purchase', harbour, vitc, '48', {
      expectedAt: '2099-01-01',
    });
    // Not deliveries: a draft, a sale, and a line closed short.
    await order(alpha.agent, 'purchase', harbour, vitc, '5', { draft: true });
    await order(alpha.agent, 'sale', harbour, vitc, '7');
    const closed = await order(alpha.agent, 'purchase', harbour, vitc, '9');
    await closeShort(alpha.agent, closed);

    const [first, second, ...rest] = await deliveries(alpha, vitc);
    // Its item, as the catalogue names it, whose lot tracking Receive can
    // start (review 3).
    const options = body<{ id: string; productId: string }[]>(
      await alpha.agent.get('/v1/products/variants').expect(200),
    );
    const productId = options.find((option) => option.id === vitc)!.productId;
    expect(first).toEqual({
      orderId: sooner.id,
      number: sooner.number,
      partnerName: 'Harbour Supply',
      expectedAt: '2099-01-01',
      late: false,
      line: {
        id: sooner.lineId,
        variantId: vitc,
        productId,
        sku: 'VITC',
        tracksLots: false,
        unitOfMeasure: 'each',
        quantityOrdered: '48.0000',
        quantityFulfilled: '0.0000',
        quantityOutstanding: '48.0000',
      },
    });
    expect([second.orderId, second.expectedAt]).toEqual([
      later.id,
      '2099-02-01',
    ]);
    expect(second.line.quantityOutstanding).toBe('30.0000');
    expect(rest).toEqual([]);
    expect(await coming(alpha, 'VITC')).toBe('78.0000');

    // Received on its order: Coming and what is still to come both fall,
    // and a line received in full is no delivery any more.
    await receiveLine(alpha.agent, sooner, shelf, '20');
    expect(await coming(alpha, 'VITC')).toBe('58.0000');
    const [partly] = await deliveries(alpha, vitc);
    expect(partly.line.quantityOutstanding).toBe('28.0000');
    expect(partly.line.quantityFulfilled).toBe('20.0000');

    await receiveLine(alpha.agent, sooner, shelf, '28');
    expect(
      (await deliveries(alpha, vitc)).map((delivery) => delivery.orderId),
    ).toEqual([later.id]);
    expect(await coming(alpha, 'VITC')).toBe('30.0000');
  });

  it('lists none of another organization’s, and asks orders.view and orders.receive', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const beta = await registerOrganization(app, 'beta');
    const vitc = await item(alpha.agent, 'VITC');
    const harbour = await partner(alpha.agent, 'Harbour Supply');
    await order(alpha.agent, 'purchase', harbour, vitc, '48');

    expect(await deliveries(beta, vitc)).toEqual([]);

    await customRole(app, alpha.organizationId, 'Viewing', ['orders.view']);
    const viewer = await addMember(
      app,
      alpha,
      'viewing@example.com',
      'Viewing',
    );
    await viewer.get(`/v1/orders/deliveries?variantId=${vitc}`).expect(403);
    await alpha.agent.get('/v1/orders/deliveries?variantId=VITC').expect(400);
  });
});
