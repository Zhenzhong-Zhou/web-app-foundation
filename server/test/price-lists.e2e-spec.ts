import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { roles } from '../src/database/schema';
import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './utils/create-test-app';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface RegisterResponse {
  user: { id: string; organizationId: string };
}

interface Line {
  id: string;
  variantId: string;
  unitPrice: string | null;
  currency: string | null;
  priceSource: 'list' | 'manual' | null;
  priceListId: string | null;
  priceNotice?: string;
}

interface OrderDetail {
  id: string;
  lines: (Line & { priceListName: string | null })[];
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * A list proposes; the line decides (ADR-049). The list's price is copied
 * onto a line added without one, and nothing reads the list again. Money
 * compared as strings, as everywhere (ADR-025).
 */
describe('Price lists (e2e)', () => {
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

  async function setup(slugish: string) {
    const agent = authedAgent(app);

    const registered = await agent
      .post('/v1/auth/register')
      .send({
        email: `owner@${slugish}.example.com`,
        password: PASSWORD,
        name: 'Owner',
        organizationName: `${slugish} Co`,
      })
      .expect(201);

    const partner = async (name: string, code: string) =>
      body<{ partner: { id: string } }>(
        await agent.post('/v1/partners').send({ name, code }).expect(201),
      ).partner.id;

    const variant = async (sku: string) =>
      body<{ product: { variants: { id: string }[] } }>(
        await agent
          .post('/v1/products')
          .send({ type: 'good', name: sku, variant: { sku } })
          .expect(201),
      ).product.variants[0].id;

    return {
      agent,
      organizationId: body<RegisterResponse>(registered).user.organizationId,
      customer: await partner('Northside Pharmacy', 'NORTH'),
      supplier: await partner('Cascade Botanicals', 'CASC'),
      focus: await variant('FOCUS-60CT'),
      calm: await variant('CALM-30CT'),
    };
  }

  type Setup = Awaited<ReturnType<typeof setup>>;

  async function priceList(
    s: Setup,
    name: string,
    direction: 'sale' | 'purchase',
    currency = 'CAD',
    items: Record<string, string> = {},
  ) {
    const id = body<{ priceList: { id: string } }>(
      await s.agent
        .post('/v1/price-lists')
        .send({ name, direction, currency })
        .expect(201),
    ).priceList.id;

    for (const [variantId, unitPrice] of Object.entries(items)) {
      await s.agent
        .put(`/v1/price-lists/${id}/items/${variantId}`)
        .send({ unitPrice })
        .expect(200);
    }

    return id;
  }

  async function assign(
    s: Setup,
    partnerId: string,
    lists: {
      salePriceListId?: string | null;
      purchasePriceListId?: string | null;
    },
    status = 204,
  ) {
    await s.agent.patch(`/v1/partners/${partnerId}`).send(lists).expect(status);
  }

  async function order(
    s: Setup,
    partnerId: string,
    direction: 'sale' | 'purchase',
    lines: Record<string, unknown>[],
    extra: Record<string, unknown> = {},
  ) {
    return body<{ order: { id: string; lines: Line[] } }>(
      await s.agent
        .post('/v1/orders')
        .send({ partnerId, direction, lines, ...extra })
        .expect(201),
    ).order;
  }

  async function detail(s: Setup, orderId: string) {
    return body<OrderDetail>(
      await s.agent.get(`/v1/orders/${orderId}`).expect(200),
    );
  }

  describe('the lists', () => {
    it('creates a list, prices items on it, and corrects one', async () => {
      const s = await setup('alpha');
      const id = await priceList(s, 'Wholesale CAD', 'sale', 'CAD', {
        [s.focus]: '18.5',
      });

      await s.agent
        .put(`/v1/price-lists/${id}/items/${s.focus}`)
        .send({ unitPrice: '19.25' })
        .expect(200);

      const res = await s.agent.get(`/v1/price-lists/${id}`).expect(200);
      expect(
        body<{ priceList: { items: { sku: string; unitPrice: string }[] } }>(
          res,
        ).priceList.items,
      ).toMatchObject([{ sku: 'FOCUS-60CT', unitPrice: '19.2500' }]);
    });

    it('refuses a second list with the same name', async () => {
      const s = await setup('alpha');
      await priceList(s, 'Wholesale CAD', 'sale');

      await s.agent
        .post('/v1/price-lists')
        .send({ name: 'Wholesale CAD', direction: 'purchase', currency: 'CAD' })
        .expect(409);
    });

    it('never changes a list’s direction or currency', async () => {
      const s = await setup('alpha');
      const id = await priceList(s, 'Wholesale CAD', 'sale');

      await s.agent
        .patch(`/v1/price-lists/${id}`)
        .send({ currency: 'USD' })
        .expect(400);
      await s.agent
        .patch(`/v1/price-lists/${id}`)
        .send({ direction: 'purchase' })
        .expect(400);
    });

    it('takes an item off, and refuses an item from another organization', async () => {
      const alpha = await setup('alpha');
      const beta = await setup('beta');
      const id = await priceList(alpha, 'Wholesale CAD', 'sale', 'CAD', {
        [alpha.focus]: '18.5',
      });

      await alpha.agent
        .delete(`/v1/price-lists/${id}/items/${alpha.focus}`)
        .expect(204);
      await alpha.agent
        .delete(`/v1/price-lists/${id}/items/${alpha.focus}`)
        .expect(404);

      await alpha.agent
        .put(`/v1/price-lists/${id}/items/${beta.focus}`)
        .send({ unitPrice: '1' })
        .expect(404);
    });
  });

  describe('which list a partner uses', () => {
    it('refuses a list of the wrong direction, or another organization’s', async () => {
      const alpha = await setup('alpha');
      const beta = await setup('beta');
      const purchase = await priceList(alpha, 'Supplier CAD', 'purchase');
      const theirs = await priceList(beta, 'Theirs', 'sale');

      await assign(alpha, alpha.customer, { salePriceListId: purchase }, 400);
      await assign(alpha, alpha.customer, { salePriceListId: theirs }, 400);
    });

    it('refuses a retired list, and clears one with null', async () => {
      const s = await setup('alpha');
      const retired = await priceList(s, 'Old', 'sale');
      const current = await priceList(s, 'Wholesale CAD', 'sale');

      await s.agent
        .patch(`/v1/price-lists/${retired}`)
        .send({ isActive: false })
        .expect(204);

      await assign(s, s.customer, { salePriceListId: retired }, 409);
      await assign(s, s.customer, { salePriceListId: current });
      await assign(s, s.customer, { salePriceListId: null });
    });

    it('takes only a sale list as the organization default', async () => {
      const s = await setup('alpha');
      const purchase = await priceList(s, 'Supplier CAD', 'purchase');
      const sale = await priceList(s, 'Retail CAD', 'sale');

      await s.agent
        .patch('/v1/organization')
        .send({ defaultSalePriceListId: purchase })
        .expect(400);
      await s.agent
        .patch('/v1/organization')
        .send({ defaultSalePriceListId: sale })
        .expect(204);
      await s.agent
        .patch('/v1/organization')
        .send({ defaultSalePriceListId: null })
        .expect(204);
    });
  });

  describe('pricing a line', () => {
    it('copies the customer’s list price onto a line added without one', async () => {
      const s = await setup('alpha');
      const wholesale = await priceList(s, 'Wholesale CAD', 'sale', 'CAD', {
        [s.focus]: '18.5',
      });
      await assign(s, s.customer, { salePriceListId: wholesale });

      const sale = await order(s, s.customer, 'sale', [
        { variantId: s.focus, quantityOrdered: '12' },
      ]);

      expect(sale.lines[0]).toMatchObject({
        unitPrice: '18.5000',
        currency: 'CAD',
        priceSource: 'list',
        priceListId: wholesale,
      });

      // Added later, by the line route, the same way.
      const added = body<{ line: Line }>(
        await s.agent
          .post(`/v1/orders/${sale.id}/lines`)
          .send({ variantId: s.calm, quantityOrdered: '1' })
          .expect(201),
      ).line;

      // Not on the list: added unpriced, and the response says why.
      expect(added).toMatchObject({ unitPrice: null, priceSource: null });
      expect(added.priceNotice).toMatch(/Wholesale CAD has no price/);

      expect((await detail(s, sale.id)).lines).toContainEqual(
        expect.objectContaining({
          variantId: s.focus,
          priceListName: 'Wholesale CAD',
        }),
      );
    });

    it('keeps a price sent with the line, and marks it as typed', async () => {
      const s = await setup('alpha');
      const wholesale = await priceList(s, 'Wholesale CAD', 'sale', 'CAD', {
        [s.focus]: '18.5',
      });
      await assign(s, s.customer, { salePriceListId: wholesale });

      const sale = await order(s, s.customer, 'sale', [
        {
          variantId: s.focus,
          quantityOrdered: '12',
          unitPrice: '17',
          currency: 'CAD',
        },
      ]);

      expect(sale.lines[0]).toMatchObject({
        unitPrice: '17.0000',
        priceSource: 'manual',
        priceListId: null,
      });
    });

    it('falls back to the organization default, and past a retired list', async () => {
      const s = await setup('alpha');
      const retail = await priceList(s, 'Retail CAD', 'sale', 'CAD', {
        [s.focus]: '24.99',
      });
      const special = await priceList(s, 'Special', 'sale', 'CAD', {
        [s.focus]: '15',
      });

      await s.agent
        .patch('/v1/organization')
        .send({ defaultSalePriceListId: retail })
        .expect(204);

      const first = await order(s, s.customer, 'sale', [
        { variantId: s.focus, quantityOrdered: '1' },
      ]);
      expect(first.lines[0]).toMatchObject({
        unitPrice: '24.9900',
        priceListId: retail,
      });

      await assign(s, s.customer, { salePriceListId: special });
      await s.agent
        .patch(`/v1/price-lists/${special}`)
        .send({ isActive: false })
        .expect(204);

      const second = await order(s, s.customer, 'sale', [
        { variantId: s.focus, quantityOrdered: '1' },
      ]);
      expect(second.lines[0]).toMatchObject({ priceListId: retail });
    });

    it('prices a purchase from the supplier’s list, never a sale default', async () => {
      const s = await setup('alpha');
      const retail = await priceList(s, 'Retail CAD', 'sale', 'CAD', {
        [s.focus]: '24.99',
      });
      await s.agent
        .patch('/v1/organization')
        .send({ defaultSalePriceListId: retail })
        .expect(204);

      const unpriced = await order(s, s.supplier, 'purchase', [
        { variantId: s.focus, quantityOrdered: '100' },
      ]);
      expect(unpriced.lines[0]).toMatchObject({ unitPrice: null });

      const cascade = await priceList(s, 'Cascade USD', 'purchase', 'USD', {
        [s.focus]: '6.2',
      });
      await assign(s, s.supplier, { purchasePriceListId: cascade });

      const priced = await order(s, s.supplier, 'purchase', [
        { variantId: s.focus, quantityOrdered: '100' },
      ]);
      expect(priced.lines[0]).toMatchObject({
        unitPrice: '6.2000',
        currency: 'USD',
        priceSource: 'list',
      });
    });

    it('never prices a sample from a list', async () => {
      const s = await setup('alpha');
      const wholesale = await priceList(s, 'Wholesale CAD', 'sale', 'CAD', {
        [s.focus]: '18.5',
      });
      await assign(s, s.customer, { salePriceListId: wholesale });

      const sample = await order(
        s,
        s.customer,
        'sale',
        [{ variantId: s.focus, quantityOrdered: '2' }],
        { isSample: true },
      );

      expect(sample.lines[0]).toMatchObject({
        unitPrice: null,
        priceSource: null,
      });
    });

    it('leaves a line unpriced rather than mix currencies on a sale', async () => {
      const s = await setup('alpha');
      const usdList = await priceList(s, 'Export USD', 'sale', 'USD', {
        [s.calm]: '14',
      });
      await assign(s, s.customer, { salePriceListId: usdList });

      const sale = await order(s, s.customer, 'sale', [
        {
          variantId: s.focus,
          quantityOrdered: '1',
          unitPrice: '24.99',
          currency: 'CAD',
        },
      ]);

      const added = body<{ line: Line }>(
        await s.agent
          .post(`/v1/orders/${sale.id}/lines`)
          .send({ variantId: s.calm, quantityOrdered: '1' })
          .expect(201),
      ).line;

      expect(added).toMatchObject({ unitPrice: null, currency: null });
      expect(added.priceNotice).toMatch(/This sale is in CAD/);
    });
  });

  describe('after the line has its price', () => {
    it('keeps the line’s price when the list changes', async () => {
      const s = await setup('alpha');
      const wholesale = await priceList(s, 'Wholesale CAD', 'sale', 'CAD', {
        [s.focus]: '18.5',
      });
      await assign(s, s.customer, { salePriceListId: wholesale });

      const sale = await order(s, s.customer, 'sale', [
        { variantId: s.focus, quantityOrdered: '12' },
      ]);

      await s.agent
        .put(`/v1/price-lists/${wholesale}/items/${s.focus}`)
        .send({ unitPrice: '21' })
        .expect(200);

      expect((await detail(s, sale.id)).lines[0]).toMatchObject({
        unitPrice: '18.5000',
        priceSource: 'list',
      });
    });

    it('marks a price typed over a list price as the person’s own', async () => {
      const s = await setup('alpha');
      const wholesale = await priceList(s, 'Wholesale CAD', 'sale', 'CAD', {
        [s.focus]: '18.5',
      });
      await assign(s, s.customer, { salePriceListId: wholesale });

      const sale = await order(s, s.customer, 'sale', [
        { variantId: s.focus, quantityOrdered: '12' },
      ]);

      await s.agent
        .patch(`/v1/orders/${sale.id}/lines/${sale.lines[0].id}`)
        .send({ quantityOrdered: '12', unitPrice: '17', currency: 'CAD' })
        .expect(204);

      expect((await detail(s, sale.id)).lines[0]).toMatchObject({
        unitPrice: '17.0000',
        priceSource: 'manual',
        priceListId: null,
        priceListName: null,
      });
    });

    it('duplicates an order without re-pricing it', async () => {
      const s = await setup('alpha');
      const wholesale = await priceList(s, 'Wholesale CAD', 'sale', 'CAD', {
        [s.focus]: '18.5',
      });
      await assign(s, s.customer, { salePriceListId: wholesale });

      const sale = await order(s, s.customer, 'sale', [
        { variantId: s.focus, quantityOrdered: '12' },
      ]);

      await s.agent
        .put(`/v1/price-lists/${wholesale}/items/${s.focus}`)
        .send({ unitPrice: '21' })
        .expect(200);

      const copy = body<{ order: { lines: Line[] } }>(
        await s.agent.post(`/v1/orders/${sale.id}/duplicate`).expect(201),
      ).order;

      expect(copy.lines[0]).toMatchObject({
        unitPrice: '18.5000',
        priceSource: 'list',
        priceListId: wholesale,
      });
    });
  });

  describe('permissions', () => {
    it('keeps the lists to the Owner, while an Admin still gets list prices', async () => {
      const s = await setup('alpha');
      const wholesale = await priceList(s, 'Wholesale CAD', 'sale', 'CAD', {
        [s.focus]: '18.5',
      });
      await assign(s, s.customer, { salePriceListId: wholesale });

      const [admin] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(
            eq(roles.organizationId, s.organizationId),
            eq(roles.name, 'Admin'),
          ),
        );

      await s.agent
        .post('/v1/users')
        .send({
          email: 'admin@alpha.example.com',
          name: 'Admin',
          password: PASSWORD,
          roleId: admin.id,
        })
        .expect(201);

      const agent = authedAgent(app);
      await agent
        .post('/v1/auth/login')
        .send({ email: 'admin@alpha.example.com', password: PASSWORD })
        .expect(200);

      await agent.get('/v1/price-lists').expect(403);
      await agent
        .post('/v1/price-lists')
        .send({ name: 'Mine', direction: 'sale', currency: 'CAD' })
        .expect(403);

      const sale = body<{ order: { lines: Line[] } }>(
        await agent
          .post('/v1/orders')
          .send({
            partnerId: s.customer,
            direction: 'sale',
            lines: [{ variantId: s.focus, quantityOrdered: '1' }],
          })
          .expect(201),
      ).order;

      expect(sale.lines[0]).toMatchObject({ unitPrice: '18.5000' });
    });
  });
});
