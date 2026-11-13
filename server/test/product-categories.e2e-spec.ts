import type { INestApplication } from '@nestjs/common';

import type {
  ProductCategory,
  ProductCategoryEnvelope,
  ProductCategoryList,
} from '../src/modules/products/dto/product-category-response.dto';
import {
  addViewer,
  body,
  createE2eApp,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

type Org = Awaited<ReturnType<typeof registerOrganization>>;
type Agent = Org['agent'];

interface AuditEntry {
  action: string;
  resourceId: string | null;
  resourceLabel: string | null;
  payload: Record<string, unknown> | null;
}

/**
 * Items' categories (ADR-092): one tree per organization, nested as
 * locations are, read by whoever may see items and managed by whoever may
 * change them; and an item in one category or none.
 */
describe('Product categories (e2e)', () => {
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

  async function add(
    agent: Agent,
    name: string,
    parentId?: string | null,
  ): Promise<string> {
    const res = await agent
      .post('/v1/products/categories')
      .send({ name, parentId })
      .expect(201);
    return body<ProductCategoryEnvelope>(res).category.id;
  }

  async function tree(agent: Agent): Promise<ProductCategory[]> {
    const res = await agent.get('/v1/products/categories').expect(200);
    return body<ProductCategoryList>(res).categories;
  }

  async function addProduct(
    agent: Agent,
    sku: string,
    fields: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await agent
      .post('/v1/products')
      .send({ type: 'good', name: sku, variant: { sku }, ...fields })
      .expect(201);
    return body<{ product: { id: string } }>(res).product.id;
  }

  async function log(agent: Agent, action: string): Promise<AuditEntry[]> {
    const res = await agent.get(`/v1/audit?action=${action}`).expect(200);
    return body<{ entries: AuditEntry[] }>(res).entries;
  }

  describe('the tree', () => {
    it('adds a category at the top and one under it, and answers it as the tree shows it', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      const res = await alpha.agent
        .post('/v1/products/categories')
        .send({ name: '  Vitamins  ' })
        .expect(201);
      const vitamins = body<ProductCategoryEnvelope>(res).category;
      expect(vitamins).toEqual({
        id: vitamins.id,
        name: 'Vitamins',
        parentId: null,
        items: [],
      });
      const vitaminC = await add(alpha.agent, 'Vitamin C', vitamins.id);

      expect(await tree(alpha.agent)).toEqual([
        expect.objectContaining({
          id: vitaminC,
          name: 'Vitamin C',
          parentId: vitamins.id,
        }),
        expect.objectContaining({ id: vitamins.id, parentId: null }),
      ]);
    });

    it('lists the categories by name: a number by its value, a Chinese name by its pinyin', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      for (const name of ['Size 10', 'Size 2', '维生素', 'Omega', 'ácido']) {
        await add(alpha.agent, name);
      }

      expect((await tree(alpha.agent)).map((each) => each.name)).toEqual([
        'ácido',
        'Omega',
        'Size 2',
        'Size 10',
        // weishengsu
        '维生素',
      ]);
    });

    it('counts the items each category holds itself, by type, the discontinued apart', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const supplies = await add(alpha.agent, 'Supplies');
      const gloves = await add(alpha.agent, 'Gloves', supplies);
      await addProduct(alpha.agent, 'GLOVE-S', {
        type: 'supply',
        categoryId: gloves,
      });
      const retired = await addProduct(alpha.agent, 'GLOVE-M', {
        type: 'supply',
        categoryId: gloves,
      });
      await alpha.agent
        .patch(`/v1/products/${retired}`)
        .send({ isActive: false })
        .expect(204);
      await addProduct(alpha.agent, 'BOX-1', {
        type: 'packaging',
        categoryId: gloves,
      });
      await addProduct(alpha.agent, 'CALM-90', {
        type: 'good',
        categoryId: gloves,
      });
      await addProduct(alpha.agent, 'LOOSE');

      const byId = new Map(
        (await tree(alpha.agent)).map((each) => [each.id, each]),
      );
      // In the types' order; the branch's own count is the client's sum.
      expect(byId.get(gloves)!.items).toEqual([
        { type: 'good', active: 1, discontinued: 0 },
        { type: 'packaging', active: 1, discontinued: 0 },
        { type: 'supply', active: 1, discontinued: 1 },
      ]);
      expect(byId.get(supplies)!.items).toEqual([]);
    });

    // Uncategorised had no count beside it on Items (ADR-092's review, 16).
    it('counts the items in no category by type, the discontinued apart', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const vitamins = await add(alpha.agent, 'Vitamins');
      await addProduct(alpha.agent, 'FOCUS-60', { categoryId: vitamins });
      await addProduct(alpha.agent, 'CALM-90');
      await addProduct(alpha.agent, 'KELP-1', { type: 'material' });
      const old = await addProduct(alpha.agent, 'OLD-1');
      await alpha.agent
        .patch(`/v1/products/${old}`)
        .send({ isActive: false })
        .expect(204);

      const res = await alpha.agent.get('/v1/products/categories').expect(200);
      expect(body<ProductCategoryList>(res).uncategorised).toEqual([
        { type: 'good', active: 1, discontinued: 1 },
        { type: 'material', active: 1, discontinued: 0 },
      ]);
    });

    it('refuses a name already used under the same parent, at the top too, and allows it under another', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const vitamins = await add(alpha.agent, 'Vitamins');
      const minerals = await add(alpha.agent, 'Minerals');
      await add(alpha.agent, 'Other', vitamins);

      const top = await alpha.agent
        .post('/v1/products/categories')
        .send({ name: 'Vitamins' })
        .expect(409);
      expect(body<{ message: string }>(top).message).toBe(
        'There is already a category named Vitamins in the same place. Choose another name.',
      );
      await alpha.agent
        .post('/v1/products/categories')
        .send({ name: 'Other', parentId: vitamins })
        .expect(409);

      // Under another parent, the same name is another category.
      await add(alpha.agent, 'Other', minerals);
      // And a move into a place holding its name is refused alike.
      const other = (await tree(alpha.agent)).find(
        (each) => each.name === 'Other' && each.parentId === minerals,
      )!;
      const moved = await alpha.agent
        .patch(`/v1/products/categories/${other.id}`)
        .send({ parentId: vitamins })
        .expect(409);
      expect(body<{ message: string }>(moved).message).toContain('Other');
    });

    it('refuses a blank name or one past 100 characters', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      await alpha.agent
        .post('/v1/products/categories')
        .send({ name: '   ' })
        .expect(400);
      await alpha.agent
        .post('/v1/products/categories')
        .send({ name: 'x'.repeat(101) })
        .expect(400);
    });

    it('does not collide with the product id route', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      await alpha.agent.get('/v1/products/categories').expect(200);
    });
  });

  describe('renaming and moving', () => {
    it('renames a category, and moves it under another and back to the top', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const vitamins = await add(alpha.agent, 'Vitamins');
      const fishOil = await add(alpha.agent, 'Fish oil');

      await alpha.agent
        .patch(`/v1/products/categories/${fishOil}`)
        .send({ name: 'Omega-3', parentId: vitamins })
        .expect(204);
      expect(
        (await tree(alpha.agent)).find((each) => each.id === fishOil),
      ).toMatchObject({ name: 'Omega-3', parentId: vitamins });

      await alpha.agent
        .patch(`/v1/products/categories/${fishOil}`)
        .send({ parentId: null })
        .expect(204);
      expect(
        (await tree(alpha.agent)).find((each) => each.id === fishOil),
      ).toMatchObject({ name: 'Omega-3', parentId: null });
    });

    it('refuses a move under itself or under any category inside it', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const vitamins = await add(alpha.agent, 'Vitamins');
      const vitaminC = await add(alpha.agent, 'Vitamin C', vitamins);
      const chewable = await add(alpha.agent, 'Chewable', vitaminC);

      for (const parentId of [vitamins, vitaminC, chewable]) {
        const res = await alpha.agent
          .patch(`/v1/products/categories/${vitamins}`)
          .send({ parentId })
          .expect(409);
        expect(body<{ message: string }>(res).message).toBe(
          'A category cannot go under itself, or under a category inside it. Choose another place.',
        );
      }
      expect(
        (await tree(alpha.agent)).find((each) => each.id === vitamins)!
          .parentId,
      ).toBeNull();
    });

    // IsOptional let a null name through to the NOT NULL column, a 500
    // (ADR-092's review, 77).
    it('refuses a null name with a 400, keeping the one it has', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const vitamins = await add(alpha.agent, 'Vitamins');

      await alpha.agent
        .patch(`/v1/products/categories/${vitamins}`)
        .send({ name: null })
        .expect(400);

      expect(
        (await tree(alpha.agent)).find((each) => each.id === vitamins)!.name,
      ).toBe('Vitamins');
    });

    // At most 10 levels, as locations (ADR-092's review, 85).
    it('refuses a category deeper than 10 levels, added or moved there', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const levels: string[] = [];
      for (let level = 1; level <= 10; level += 1) {
        levels.push(await add(alpha.agent, `Level ${level}`, levels.at(-1)));
      }

      const res = await alpha.agent
        .post('/v1/products/categories')
        .send({ name: 'Level 11', parentId: levels[9] })
        .expect(409);
      expect(body<{ message: string }>(res).message).toBe(
        'Categories go at most 10 levels deep. Choose a place higher up.',
      );

      // A branch two levels deep fits under the eighth, not the ninth.
      const loose = await add(alpha.agent, 'Loose');
      await add(alpha.agent, 'Leaf', loose);
      await alpha.agent
        .patch(`/v1/products/categories/${loose}`)
        .send({ parentId: levels[8] })
        .expect(409);
      await alpha.agent
        .patch(`/v1/products/categories/${loose}`)
        .send({ parentId: levels[7] })
        .expect(204);
      expect((await tree(alpha.agent)).length).toBe(12);
    });

    it('answers 404 for a category that is not there', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      await alpha.agent
        .patch('/v1/products/categories/01a1c17d-0000-7000-8000-000000000000')
        .send({ name: 'Anything' })
        .expect(404);
    });
  });

  describe('deleting', () => {
    it('deletes an empty category', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const empty = await add(alpha.agent, 'Empty');

      await alpha.agent.delete(`/v1/products/categories/${empty}`).expect(204);

      expect(await tree(alpha.agent)).toEqual([]);
    });

    it('refuses to delete a category holding items or categories, saying how many and what to do', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const vitamins = await add(alpha.agent, 'Vitamins');
      await add(alpha.agent, 'Vitamin C', vitamins);
      await add(alpha.agent, 'Vitamin D', vitamins);
      const retired = await addProduct(alpha.agent, 'MULTI-1', {
        categoryId: vitamins,
      });
      // A discontinued item still holds its place.
      await alpha.agent
        .patch(`/v1/products/${retired}`)
        .send({ isActive: false })
        .expect(204);

      const both = await alpha.agent
        .delete(`/v1/products/categories/${vitamins}`)
        .expect(409);
      expect(body<{ message: string }>(both).message).toBe(
        'Vitamins still holds 1 item and 2 categories. Move them out of Vitamins first, then delete it.',
      );

      await alpha.agent
        .patch(`/v1/products/${retired}`)
        .send({ categoryId: null })
        .expect(204);
      const categories = await alpha.agent
        .delete(`/v1/products/categories/${vitamins}`)
        .set('Accept-Language', 'zh-Hans')
        .expect(409);
      expect(body<{ message: string }>(categories).message).toBe(
        'Vitamins 还有 2 个下级分类。请先把它们移出 Vitamins，再删除该分类。',
      );

      const fishOil = await add(alpha.agent, 'Fish oil');
      await addProduct(alpha.agent, 'OMEGA-1', { categoryId: fishOil });
      await addProduct(alpha.agent, 'OMEGA-2', { categoryId: fishOil });
      const items = await alpha.agent
        .delete(`/v1/products/categories/${fishOil}`)
        .set('Accept-Language', 'fr-CA')
        .expect(409);
      expect(body<{ message: string }>(items).message).toBe(
        'Fish oil contient encore 2 articles. Déplacez-les vers une autre catégorie, puis supprimez Fish oil.',
      );
      expect(await tree(alpha.agent)).toHaveLength(4);
    });
  });

  describe('an item’s category', () => {
    it('puts an item in a category when it is added, moves it, and takes it out', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const vitamins = await add(alpha.agent, 'Vitamins');
      const fishOil = await add(alpha.agent, 'Fish oil');

      const res = await alpha.agent
        .post('/v1/products')
        .send({
          type: 'good',
          name: 'Vitamin D3',
          variant: { sku: 'D3-1000' },
          categoryId: vitamins,
        })
        .expect(201);
      const product = body<{ product: { id: string; categoryId: string } }>(
        res,
      ).product;
      expect(product.categoryId).toBe(vitamins);

      const detail = async () =>
        body<{ categoryId: string | null }>(
          await alpha.agent.get(`/v1/products/${product.id}`).expect(200),
        ).categoryId;

      await alpha.agent
        .patch(`/v1/products/${product.id}`)
        .send({ categoryId: fishOil })
        .expect(204);
      expect(await detail()).toBe(fishOil);

      await alpha.agent
        .patch(`/v1/products/${product.id}`)
        .send({ categoryId: null })
        .expect(204);
      expect(await detail()).toBeNull();

      // Added with none, it is Uncategorised.
      const loose = await addProduct(alpha.agent, 'LOOSE');
      expect(
        body<{ categoryId: string | null }>(
          await alpha.agent.get(`/v1/products/${loose}`).expect(200),
        ).categoryId,
      ).toBeNull();
    });
  });

  describe('tenancy', () => {
    it('never shows another organization’s categories, nor counts its items', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');
      const alphaVitamins = await add(alpha.agent, 'Vitamins');
      const betaVitamins = await add(beta.agent, 'Vitamins');
      await addProduct(beta.agent, 'BETA-1', { categoryId: betaVitamins });

      expect(await tree(alpha.agent)).toEqual([
        { id: alphaVitamins, name: 'Vitamins', parentId: null, items: [] },
      ]);
    });

    it('refuses another organization’s category with a 400, as a parent or on an item', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');
      const theirs = await add(beta.agent, 'Theirs');
      const ours = await add(alpha.agent, 'Ours');
      const product = await addProduct(alpha.agent, 'ALPHA-1');

      const asParent = await alpha.agent
        .post('/v1/products/categories')
        .send({ name: 'Under theirs', parentId: theirs })
        .expect(400);
      expect(body<{ message: string }>(asParent).message).toBe(
        'The category to put it under was not found. Choose another, or none.',
      );
      await alpha.agent
        .patch(`/v1/products/categories/${ours}`)
        .send({ parentId: theirs })
        .expect(400);

      const onAdd = await alpha.agent
        .post('/v1/products')
        .send({
          type: 'good',
          name: 'Alpha 2',
          variant: { sku: 'ALPHA-2' },
          categoryId: theirs,
        })
        .expect(400);
      expect(body<{ message: string }>(onAdd).message).toBe(
        'That category was not found. Choose another, or none.',
      );
      await alpha.agent
        .patch(`/v1/products/${product}`)
        .send({ categoryId: theirs })
        .expect(400);

      // Nothing written: no product added, nothing moved.
      expect(await tree(alpha.agent)).toEqual([
        expect.objectContaining({ id: ours, parentId: null }),
      ]);
    });

    it('answers 404 for another organization’s category, to rename or delete', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');
      const theirs = await add(beta.agent, 'Theirs');

      await alpha.agent
        .patch(`/v1/products/categories/${theirs}`)
        .send({ name: 'Mine now' })
        .expect(404);
      await alpha.agent.delete(`/v1/products/categories/${theirs}`).expect(404);

      expect(await tree(beta.agent)).toEqual([
        expect.objectContaining({ id: theirs, name: 'Theirs' }),
      ]);
    });
  });

  describe('who may', () => {
    it('lets a Viewer read the tree but not change it', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');
      const vitamins = await add(alpha.agent, 'Vitamins');

      expect(await tree(viewer)).toHaveLength(1);
      await viewer
        .post('/v1/products/categories')
        .send({ name: 'Mine' })
        .expect(403);
      await viewer
        .patch(`/v1/products/categories/${vitamins}`)
        .send({ name: 'Mine' })
        .expect(403);
      await viewer.delete(`/v1/products/categories/${vitamins}`).expect(403);
    });
  });

  describe('History', () => {
    it('records each change to a category by its name, and its parent by name', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const vitamins = await add(alpha.agent, 'Vitamins');
      const minerals = await add(alpha.agent, 'Minerals');
      const zinc = await add(alpha.agent, 'Zinc', vitamins);

      const [created] = await log(alpha.agent, 'product_category.created');
      expect(created).toMatchObject({
        resourceId: zinc,
        resourceLabel: 'Zinc',
        payload: {
          name: 'Zinc',
          parentId: { id: vitamins, label: 'Vitamins' },
        },
      });

      await alpha.agent
        .patch(`/v1/products/categories/${zinc}`)
        .send({ name: 'Zinc gluconate', parentId: minerals })
        .expect(204);
      const [changed] = await log(alpha.agent, 'product_category.updated');
      expect(changed).toMatchObject({
        resourceLabel: 'Zinc gluconate',
        payload: {
          name: { from: 'Zinc', to: 'Zinc gluconate' },
          parentId: {
            from: { id: vitamins, label: 'Vitamins' },
            to: { id: minerals, label: 'Minerals' },
          },
        },
      });

      // Saved as it was: no entry.
      await alpha.agent
        .patch(`/v1/products/categories/${zinc}`)
        .send({ name: 'Zinc gluconate', parentId: minerals })
        .expect(204);
      expect(await log(alpha.agent, 'product_category.updated')).toHaveLength(
        1,
      );

      await alpha.agent.delete(`/v1/products/categories/${zinc}`).expect(204);
      const [deleted] = await log(alpha.agent, 'product_category.deleted');
      expect(deleted).toMatchObject({
        resourceId: zinc,
        payload: { name: 'Zinc gluconate' },
      });
    });

    it('records an item’s category from and to, by name, and a rename beside an unchanged one', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const vitamins = await add(alpha.agent, 'Vitamins');
      const fishOil = await add(alpha.agent, 'Fish oil');
      const product = await addProduct(alpha.agent, 'OMEGA-1', {
        categoryId: vitamins,
      });

      const [created] = await log(alpha.agent, 'product.created');
      expect(created.payload).toEqual({
        categoryId: { id: vitamins, label: 'Vitamins' },
      });

      await alpha.agent
        .patch(`/v1/products/${product}`)
        .send({ categoryId: fishOil })
        .expect(204);
      const [moved] = await log(alpha.agent, 'product.updated');
      expect(moved.payload).toEqual({
        categoryId: {
          from: { id: vitamins, label: 'Vitamins' },
          to: { id: fishOil, label: 'Fish oil' },
        },
      });

      // A new name sent beside the same category is still recorded.
      await alpha.agent
        .patch(`/v1/products/${product}`)
        .send({ name: 'Omega-3', categoryId: fishOil })
        .expect(204);
      const updates = await log(alpha.agent, 'product.updated');
      expect(updates).toHaveLength(2);
      expect(updates[0].resourceLabel).toBe('Omega-3');
    });
  });
});
