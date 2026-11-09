import type { INestApplication } from '@nestjs/common';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { products, productVariants } from '../src/database/schema';
import {
  addViewer,
  body,
  createE2eApp,
  registerOrganization,
} from './utils/fixtures';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface VariantResponse {
  id: string;
  sku: string;
  name: string | null;
  tracksLots: boolean;
  isActive: boolean;
}

interface VariantPickerResponse {
  id: string;
  sku: string;
  variantName: string | null;
  productName: string;
  type: string;
  unitOfMeasure: string;
  tracksLots: boolean;
}

interface ProductResponse {
  id: string;
  type: string;
  name: string;
  isActive: boolean;
  variants: VariantResponse[];
}

/**
 * The first feature module, and the first table pair where an invariant spans
 * two inserts: ADR-023 says every product has at least one variant, and a
 * transaction is what makes that true rather than merely intended.
 */
describe('Products (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  const product = {
    type: 'good',
    name: 'Vitamin D3',
    variant: { sku: 'VD3-60', name: '60ct', tracksLots: true },
  };

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

  describe('POST /v1/products', () => {
    it('creates the product and its first variant together', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      const res = await alpha.agent
        .post('/v1/products')
        .send(product)
        .expect(201);
      const created = body<{ product: ProductResponse }>(res).product;

      expect(created.variants).toHaveLength(1);
      expect(created.variants[0].sku).toBe('VD3-60');
      expect(created.variants[0].tracksLots).toBe(true);

      // ADR-023's invariant, asserted against rows rather than a response: a
      // product with no variant is one nothing can ever be counted against.
      expect(await db.select().from(products)).toHaveLength(1);
      expect(await db.select().from(productVariants)).toHaveLength(1);
    });

    it('creates a variant even when the product has no variation', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      await alpha.agent
        .post('/v1/products')
        .send({
          type: 'supply',
          name: 'Blue pens',
          variant: { sku: 'PEN-BLUE' },
        })
        .expect(201);

      const [variant] = await db.select().from(productVariants);

      // Name null, variant present. The UI hides this row behind one SKU
      // field; the schema does not, which is what keeps stock queries free of
      // a branch.
      expect(variant.name).toBeNull();
      expect(variant.tracksLots).toBe(false);
    });

    it('rejects a duplicate SKU and leaves no orphaned product', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await alpha.agent.post('/v1/products').send(product).expect(201);

      const res = await alpha.agent
        .post('/v1/products')
        .send({ ...product, name: 'Vitamin D3 again' })
        .expect(409);

      // Names the SKU: the caller needs to know whether they meant the
      // existing item or have a collision in their own numbering.
      expect(JSON.stringify(res.body)).toContain('VD3-60');

      // The rollback. Without the transaction, the product insert would have
      // committed before the variant failed.
      expect(await db.select().from(products)).toHaveLength(1);
    });

    // A code in use names the item that has it and asks for another
    // (#306's 35), adding, adding a variant or renaming one alike; its id
    // beside, for the form to open it (ADR-092).
    it('refuses a code in use, naming the item that has it and asking for another', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const holder = body<{ product: ProductResponse }>(
        await alpha.agent.post('/v1/products').send(product).expect(201),
      ).product;
      const other = body<{ product: ProductResponse }>(
        await alpha.agent
          .post('/v1/products')
          .send({ type: 'good', name: 'Calm', variant: { sku: 'CALM-90' } })
          .expect(201),
      ).product;

      const refusals = [
        await alpha.agent
          .post('/v1/products')
          .send({ ...product, name: 'Vitamin D3 again' })
          .expect(409),
        await alpha.agent
          .post(`/v1/products/${other.id}/variants`)
          .send({ sku: 'VD3-60' })
          .expect(409),
        await alpha.agent
          .patch(`/v1/products/${other.id}/variants/${other.variants[0].id}`)
          .send({ sku: 'VD3-60' })
          .expect(409),
      ];
      for (const refusal of refusals) {
        expect(refusal.body).toMatchObject({
          message:
            'Code VD3-60 is already used by Vitamin D3. Choose another code.',
          code: 'code_in_use',
          details: { productId: holder.id },
        });
      }

      const chinese = await alpha.agent
        .post('/v1/products')
        .set('Accept-Language', 'zh-Hans')
        .send({ ...product, name: 'Vitamin D3 again' })
        .expect(409);
      expect(chinese.body).toMatchObject({
        message: '编码 VD3-60 已被 Vitamin D3 使用。请换一个编码。',
      });
    });

    it('allows the same SKU in another organization', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');

      await alpha.agent.post('/v1/products').send(product).expect(201);

      // Unique per organization, never globally — rejecting this would reveal
      // that another tenant exists.
      await beta.agent.post('/v1/products').send(product).expect(201);

      expect(await db.select().from(productVariants)).toHaveLength(2);
    });

    it('rejects an unknown type', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      await alpha.agent
        .post('/v1/products')
        .send({ ...product, type: 'widget' })
        .expect(400);
    });

    it('rejects a product with no variant', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      await alpha.agent
        .post('/v1/products')
        .send({ type: 'good', name: 'Vitamin D3' })
        .expect(400);
    });

    it('refuses a Viewer, which lacks products.create', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');

      await viewer.post('/v1/products').send(product).expect(403);
      expect(await db.select().from(products)).toHaveLength(0);
    });

    it('requires a session', async () => {
      await authedAgent(app).post('/v1/products').send(product).expect(401);
    });
  });

  describe('GET /v1/products', () => {
    it('does not show another organization catalogue', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');

      await beta.agent.post('/v1/products').send(product).expect(201);

      const res = await alpha.agent.get('/v1/products').expect(200);
      expect(body<{ entries: unknown[] }>(res).entries).toHaveLength(0);
      expect(await db.select().from(products)).toHaveLength(1);
    });

    it('is readable by a Viewer, which holds products.view', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await alpha.agent.post('/v1/products').send(product).expect(201);
      const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');

      const res = await viewer.get('/v1/products').expect(200);
      expect(body<{ entries: unknown[] }>(res).entries).toHaveLength(1);
    });
  });

  describe('GET /v1/products/variants', () => {
    it('lists every variant across products, ordered by SKU', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      await alpha.agent.post('/v1/products').send(product).expect(201);
      await alpha.agent
        .post('/v1/products')
        .send({ type: 'supply', name: 'Pens', variant: { sku: 'PEN-BLUE' } })
        .expect(201);

      const res = await alpha.agent.get('/v1/products/variants').expect(200);
      const variants = body<VariantPickerResponse[]>(res);

      expect(variants.map((v) => v.sku)).toEqual(['PEN-BLUE', 'VD3-60']);
    });

    it('does not collide with the id route', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      // Declared above @Get(':id'). If that order is ever reversed, this 400s
      // with a UUID error and the failure reads like a client bug.
      await alpha.agent.get('/v1/products/variants').expect(200);
    });

    it('does not show another organization variants', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');

      await beta.agent.post('/v1/products').send(product).expect(201);

      const res = await alpha.agent.get('/v1/products/variants').expect(200);
      expect(body<VariantPickerResponse[]>(res)).toHaveLength(0);
    });

    it('hides a variant whose product was discontinued', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      const created = body<{ product: ProductResponse }>(
        await alpha.agent.post('/v1/products').send(product).expect(201),
      ).product;

      await alpha.agent
        .patch(`/v1/products/${created.id}`)
        .send({ isActive: false })
        .expect(204);

      // The variant's own flag is still true — the product's is never cascaded.
      // Only the join to products can see this, which is why the picker joins.
      const [variant] = await db.select().from(productVariants);
      expect(variant.isActive).toBe(true);

      const res = await alpha.agent.get('/v1/products/variants').expect(200);
      expect(body<VariantPickerResponse[]>(res)).toHaveLength(0);
    });

    it('hides a discontinued variant of an active product', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      const created = body<{ product: ProductResponse }>(
        await alpha.agent.post('/v1/products').send(product).expect(201),
      ).product;

      await alpha.agent
        .post(`/v1/products/${created.id}/variants`)
        .send({ sku: 'VD3-120' })
        .expect(201);

      await alpha.agent
        .patch(`/v1/products/${created.id}/variants/${created.variants[0].id}`)
        .send({ isActive: false })
        .expect(204);

      const res = await alpha.agent.get('/v1/products/variants').expect(200);
      const skus = body<VariantPickerResponse[]>(res).map((v) => v.sku);
      expect(skus).toEqual(['VD3-120']);
    });

    it('is readable by a Viewer, which holds products.view', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await alpha.agent.post('/v1/products').send(product).expect(201);
      const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');

      const res = await viewer.get('/v1/products/variants').expect(200);
      expect(body<VariantPickerResponse[]>(res)).toHaveLength(1);
    });
  });

  describe('PATCH /v1/products/:id', () => {
    it('discontinues without touching its variants', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      const created = body<{ product: ProductResponse }>(
        await alpha.agent.post('/v1/products').send(product).expect(201),
      ).product;

      await alpha.agent
        .patch(`/v1/products/${created.id}`)
        .send({ isActive: false })
        .expect(204);

      // The decision this test exists for: the product's flag is never
      // cascaded. Deactivating would write false to every variant, and
      // reactivating could not know which had been individually discontinued
      // first — that information would be destroyed by the write.
      const [variant] = await db.select().from(productVariants);
      expect(variant.isActive).toBe(true);

      const [row] = await db.select().from(products);
      expect(row.isActive).toBe(false);
    });

    it('refuses a product in another organization', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');

      const created = body<{ product: ProductResponse }>(
        await beta.agent.post('/v1/products').send(product).expect(201),
      ).product;

      await alpha.agent
        .patch(`/v1/products/${created.id}`)
        .send({ name: 'Hijacked' })
        .expect(404);
    });

    // The type forks nothing (ADR-023), so it may change at any time
    // (ADR-092, #306's 26 and 39): the item moves to that tab, and History
    // says from and to, in the reader's words, as it says Discontinue.
    it('changes its type, which History records from and to, as Discontinue', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      const created = body<{ product: ProductResponse }>(
        await alpha.agent.post('/v1/products').send(product).expect(201),
      ).product;

      await alpha.agent
        .patch(`/v1/products/${created.id}`)
        .send({ type: 'material' })
        .expect(204);
      await alpha.agent
        .patch(`/v1/products/${created.id}`)
        .send({ type: 'widget' })
        .expect(400);

      const [row] = await db.select().from(products);
      expect(row.type).toBe('material');
      const tab = await alpha.agent
        .get('/v1/products?type=material')
        .expect(200);
      expect(
        body<{ entries: { id: string }[] }>(tab).entries.map(
          (entry) => entry.id,
        ),
      ).toEqual([created.id]);

      await alpha.agent
        .patch(`/v1/products/${created.id}`)
        .send({ isActive: false })
        .expect(204);

      const history = await alpha.agent
        .get(`/v1/audit?action=product.updated&resourceId=${created.id}`)
        .set('Accept-Language', 'zh-Hans')
        .expect(200);
      const [discontinued, retyped] = body<{
        entries: {
          payload: unknown;
          details: { field: string; from: { text: string } | null }[];
        }[];
      }>(history).entries;
      expect(retyped.payload).toEqual({
        type: { from: 'good', to: 'material' },
      });
      expect(retyped.details).toMatchObject([
        { field: '类型', from: { text: '商品' }, value: { text: '原材料' } },
      ]);
      expect(discontinued.payload).toEqual({
        isActive: { from: true, to: false },
      });
    });

    it('refuses a Viewer, which lacks products.update', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      const created = body<{ product: ProductResponse }>(
        await alpha.agent.post('/v1/products').send(product).expect(201),
      ).product;

      const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');

      await viewer
        .patch(`/v1/products/${created.id}`)
        .send({ isActive: false })
        .expect(403);
    });

    describe('variants', () => {
      async function createProduct(
        agent: Awaited<ReturnType<typeof registerOrganization>>['agent'],
      ) {
        const res = await agent.post('/v1/products').send(product).expect(201);
        return body<{ product: ProductResponse }>(res).product;
      }

      it('adds a second variant to an existing product', async () => {
        const alpha = await registerOrganization(app, 'alpha');
        const created = await createProduct(alpha.agent);

        await alpha.agent
          .post(`/v1/products/${created.id}/variants`)
          .send({ sku: 'VD3-120', name: '120ct' })
          .expect(201);

        // The ordinary case ADR-023 exists for: same product, different
        // physical facts.
        const res = await alpha.agent
          .get(`/v1/products/${created.id}`)
          .expect(200);

        expect(body<ProductResponse>(res).variants).toHaveLength(2);
      });

      it('refuses a SKU already used elsewhere in the organization', async () => {
        const alpha = await registerOrganization(app, 'alpha');
        const created = await createProduct(alpha.agent);

        // Uniqueness is per organization, not per product — the constraint is
        // on (organization_id, sku).
        await alpha.agent
          .post(`/v1/products/${created.id}/variants`)
          .send({ sku: 'VD3-60' })
          .expect(409);
      });

      it('renames a SKU and frees the old one', async () => {
        const alpha = await registerOrganization(app, 'alpha');
        const created = await createProduct(alpha.agent);

        await alpha.agent
          .patch(
            `/v1/products/${created.id}/variants/${created.variants[0].id}`,
          )
          .send({ sku: 'VD3-060' })
          .expect(204);

        const [variant] = await db.select().from(productVariants);
        expect(variant.sku).toBe('VD3-060');

        // Editable rather than locked (ADR-023): a typo found after the first
        // receipt should be fixable, and the old value is now available again.
        await alpha.agent
          .post(`/v1/products/${created.id}/variants`)
          .send({ sku: 'VD3-60' })
          .expect(201);
      });

      it('rejects tracksLots in an update', async () => {
        const alpha = await registerOrganization(app, 'alpha');
        const created = await createProduct(alpha.agent);

        // Absent from UpdateVariantDto deliberately. Flipping it on a variant
        // that already has stock leaves every existing row violating the
        // invariant — in one direction with a null lot_id, in the other with
        // one. That is a data migration, not a PATCH.
        await alpha.agent
          .patch(
            `/v1/products/${created.id}/variants/${created.variants[0].id}`,
          )
          .send({ tracksLots: false })
          .expect(400);

        const [variant] = await db.select().from(productVariants);
        expect(variant.tracksLots).toBe(true);
      });

      it('refuses a variant belonging to another product', async () => {
        const alpha = await registerOrganization(app, 'alpha');
        const first = await createProduct(alpha.agent);

        const second = body<{ product: ProductResponse }>(
          await alpha.agent
            .post('/v1/products')
            .send({
              type: 'good',
              name: 'Vitamin C',
              variant: { sku: 'VC-60' },
            })
            .expect(201),
        ).product;

        // Both ids are checked together. Without that, any variant in the
        // organization could be edited through any product's URL.
        await alpha.agent
          .patch(`/v1/products/${second.id}/variants/${first.variants[0].id}`)
          .send({ name: 'Hijacked' })
          .expect(404);
      });
    });
  });

  /**
   * Several at once (ADR-092): each item to its own category, or in use or
   * not, in one transaction, refused whole for another organization's item
   * or category; the answer each item's values before, so Undo is the same
   * route with them, and History an entry for each item that changed.
   */
  describe('PATCH /v1/products, several at once', () => {
    type Org = Awaited<ReturnType<typeof registerOrganization>>;

    interface Changes {
      items: { id: string; categoryId?: string | null; isActive?: boolean }[];
    }

    async function addCategory(org: Org, name: string): Promise<string> {
      const res = await org.agent
        .post('/v1/products/categories')
        .send({ name })
        .expect(201);
      return body<{ category: { id: string } }>(res).category.id;
    }

    async function addItem(
      org: Org,
      sku: string,
      fields: Record<string, unknown> = {},
    ): Promise<string> {
      const res = await org.agent
        .post('/v1/products')
        .send({ type: 'good', name: sku, variant: { sku }, ...fields })
        .expect(201);
      return body<{ product: ProductResponse }>(res).product.id;
    }

    async function updates(org: Org) {
      const res = await org.agent
        .get('/v1/audit?action=product.updated')
        .expect(200);
      return body<{
        entries: {
          resourceId: string;
          resourceLabel: string;
          payload: unknown;
        }[];
      }>(res).entries;
    }

    async function categoryOf(id: string) {
      const rows = await db.select().from(products);
      return rows.find((row) => row.id === id)?.categoryId;
    }

    it('moves several items to a category, each recorded, and Undo sends the answer back', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const vitamins = await addCategory(alpha, 'Vitamins');
      const first = await addItem(alpha, 'FOCUS-60');
      const second = await addItem(alpha, 'CALM-90');
      const already = await addItem(alpha, 'OMEGA-1', {
        categoryId: vitamins,
      });

      const res = await alpha.agent
        .patch('/v1/products')
        .send({
          items: [first, second, already].map((id) => ({
            id,
            categoryId: vitamins,
          })),
        })
        .expect(200);
      const before = body<Changes>(res);
      expect(before.items).toEqual([
        { id: first, categoryId: null },
        { id: second, categoryId: null },
        { id: already, categoryId: vitamins },
      ]);
      for (const id of [first, second, already]) {
        expect(await categoryOf(id)).toBe(vitamins);
      }

      // An entry for each item that moved, named as it was; none for the
      // one already there.
      const moved = await updates(alpha);
      expect(moved.map((entry) => entry.resourceLabel).sort()).toEqual([
        'CALM-90',
        'FOCUS-60',
      ]);
      expect(moved[0].payload).toEqual({
        categoryId: { from: null, to: { id: vitamins, label: 'Vitamins' } },
      });

      // Undo: the answer, sent back.
      const undone = await alpha.agent
        .patch('/v1/products')
        .send(before)
        .expect(200);
      expect(await categoryOf(first)).toBeNull();
      expect(await categoryOf(second)).toBeNull();
      expect(await categoryOf(already)).toBe(vitamins);
      expect(body<Changes>(undone).items).toEqual(
        [first, second, already].map((id) => ({ id, categoryId: vitamins })),
      );
      expect(await updates(alpha)).toHaveLength(4);
    });

    it('discontinues several at once, and Undo brings each back as it was', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const first = await addItem(alpha, 'FOCUS-60');
      const second = await addItem(alpha, 'CALM-90');
      await alpha.agent
        .patch(`/v1/products/${second}`)
        .send({ isActive: false })
        .expect(204);

      const res = await alpha.agent
        .patch('/v1/products')
        .send({
          items: [first, second].map((id) => ({ id, isActive: false })),
        })
        .expect(200);
      const before = body<Changes>(res);
      expect(before.items).toEqual([
        { id: first, isActive: true },
        { id: second, isActive: false },
      ]);
      const [discontinued] = await updates(alpha);
      expect(discontinued).toMatchObject({
        resourceId: first,
        payload: { isActive: { from: true, to: false } },
      });

      await alpha.agent.patch('/v1/products').send(before).expect(200);
      const rows = await db.select().from(products);
      expect(
        Object.fromEntries(rows.map((row) => [row.id, row.isActive])),
      ).toEqual({ [first]: true, [second]: false });
    });

    it('refuses the whole request for another organization’s item or category, changing nothing', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');
      const ours = await addItem(alpha, 'FOCUS-60');
      const theirs = await addItem(beta, 'CALM-90');
      const theirCategory = await addCategory(beta, 'Vitamins');
      const ourCategory = await addCategory(alpha, 'Vitamins');

      await alpha.agent
        .patch('/v1/products')
        .send({
          items: [
            { id: ours, categoryId: ourCategory },
            { id: theirs, categoryId: ourCategory },
          ],
        })
        .expect(400);
      await alpha.agent
        .patch('/v1/products')
        .send({
          items: [{ id: ours, categoryId: theirCategory, isActive: false }],
        })
        .expect(400);

      const rows = await db.select().from(products);
      expect(rows.every((row) => row.categoryId === null)).toBe(true);
      expect(rows.every((row) => row.isActive)).toBe(true);
      expect(await updates(alpha)).toHaveLength(0);
    });

    it('refuses more than 500 items, one twice, and whoever may not change items', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const ours = await addItem(alpha, 'FOCUS-60');

      await alpha.agent
        .patch('/v1/products')
        .send({
          items: Array.from({ length: 501 }, () => ({
            id: crypto.randomUUID(),
            isActive: false,
          })),
        })
        .expect(400);
      await alpha.agent
        .patch('/v1/products')
        .send({
          items: [
            { id: ours, isActive: false },
            { id: ours, isActive: true },
          ],
        })
        .expect(400);
      await alpha.agent.patch('/v1/products').send({ items: [] }).expect(400);

      const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');
      await viewer
        .patch('/v1/products')
        .send({ items: [{ id: ours, isActive: false }] })
        .expect(403);

      const [row] = await db.select().from(products);
      expect(row.isActive).toBe(true);
    });
  });
});
