import type { INestApplication } from '@nestjs/common';

import { body, createE2eApp, registerOrganization } from './utils/fixtures';
import { point, receive, site } from './utils/reorder-world';
import { resetDatabase } from './utils/reset-db';
import { captureStatements } from './utils/statements';

type Org = Awaited<ReturnType<typeof registerOrganization>>;
type Agent = Org['agent'];

interface Row {
  id: string;
  type: string;
  displayName: string;
  sku: string;
  variantCount: number;
  category: { id: string; path: string[] } | null;
  isActive: boolean;
  onHand: string | null;
  unitOfMeasure: string | null;
  stockStatus: 'low' | 'out' | null;
}

interface Page {
  entries: Row[];
  nextCursor: string | null;
  counts: {
    types: { type: string; count: number }[];
    all: number;
    discontinued: number;
  } | null;
}

/**
 * Items' list (ADR-092): fifty at a time by keyset, narrowed by its type,
 * its category and its search, discontinued items hidden unless asked,
 * sorted by name, category, stock or date, counted, and each row with its
 * stock on hand and its status read from Inventory's cache.
 */
describe('Items’ list (e2e)', () => {
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

  /** An item with its one variant; its id and its variant's. */
  async function item(
    agent: Agent,
    name: string,
    fields: {
      type?: string;
      sku?: string;
      unitOfMeasure?: string;
      categoryId?: string;
    } = {},
  ): Promise<{ id: string; variantId: string }> {
    const { product } = body<{
      product: { id: string; variants: { id: string }[] };
    }>(
      await agent
        .post('/v1/products')
        .send({
          type: fields.type ?? 'good',
          name,
          categoryId: fields.categoryId,
          variant: {
            sku: fields.sku ?? name.toUpperCase().replace(/\W+/g, '-'),
            unitOfMeasure: fields.unitOfMeasure ?? 'each',
          },
        })
        .expect(201),
    );
    return { id: product.id, variantId: product.variants[0].id };
  }

  async function category(agent: Agent, name: string, parentId?: string) {
    return body<{ category: { id: string } }>(
      await agent
        .post('/v1/products/categories')
        .send({ name, parentId })
        .expect(201),
    ).category.id;
  }

  async function discontinue(agent: Agent, id: string) {
    await agent
      .patch(`/v1/products/${id}`)
      .send({ isActive: false })
      .expect(204);
  }

  async function list(
    org: Org,
    query: Record<string, string> = {},
    language = 'en',
  ): Promise<Page> {
    return body<Page>(
      await org.agent
        .get(`/v1/products?${new URLSearchParams(query).toString()}`)
        .set('Accept-Language', language)
        .expect(200),
    );
  }

  const names = (page: Page) => page.entries.map((row) => row.displayName);

  /** Every row, page by page through the cursor. */
  async function every(
    org: Org,
    query: Record<string, string>,
    language = 'en',
  ): Promise<string[]> {
    const shown: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Page = await list(
        org,
        { ...query, ...(cursor ? { cursor } : {}) },
        language,
      );
      shown.push(...names(page));
      cursor = page.nextCursor;
    } while (cursor);
    return shown;
  }

  it('pages by its cursor, each row once, the counts with the first page alone', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    for (const name of ['Echo', 'Alpha', 'Delta', 'Bravo', 'Charlie']) {
      await item(alpha.agent, name);
    }

    const first = await list(alpha, { limit: '2' });
    expect(names(first)).toEqual(['Alpha', 'Bravo']);
    expect(first.counts).toEqual({
      types: [{ type: 'good', count: 5 }],
      all: 5,
      discontinued: 0,
    });

    const second = await list(alpha, {
      limit: '2',
      cursor: first.nextCursor!,
    });
    expect(names(second)).toEqual(['Charlie', 'Delta']);
    expect(second.counts).toBeNull();

    expect(await every(alpha, { limit: '2' })).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
      'Echo',
    ]);
    // Fifty unless asked.
    expect((await list(alpha)).nextCursor).toBeNull();
  });

  it('keeps two items of one name apart across a page’s edge', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await item(alpha.agent, 'Focus', { sku: 'FOCUS-A' });
    await item(alpha.agent, 'Focus', { sku: 'FOCUS-B' });
    await item(alpha.agent, 'Calm');

    for (const order of ['asc', 'desc']) {
      const rows: string[] = [];
      let cursor: string | null = null;
      do {
        const page: Page = await list(alpha, {
          limit: '1',
          order,
          ...(cursor ? { cursor } : {}),
        });
        rows.push(...page.entries.map((row) => row.sku));
        cursor = page.nextCursor;
      } while (cursor);

      expect(rows).toHaveLength(3);
      expect(new Set(rows)).toEqual(new Set(['FOCUS-A', 'FOCUS-B', 'CALM']));
      expect(rows[order === 'asc' ? 0 : 2]).toBe('CALM');
    }
  });

  it('narrows to a type, to a category with those under it, or to the Uncategorised', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const vitamins = await category(alpha.agent, 'Vitamins');
    const vitaminC = await category(alpha.agent, 'Vitamin C', vitamins);
    const herbs = await category(alpha.agent, 'Herbs');
    await item(alpha.agent, 'C 500', { categoryId: vitaminC });
    await item(alpha.agent, 'Multi', { categoryId: vitamins });
    await item(alpha.agent, 'Ginseng', { categoryId: herbs });
    await item(alpha.agent, 'Ascorbic acid', { type: 'material' });
    await item(alpha.agent, 'Bottle', { type: 'packaging' });

    expect(names(await list(alpha, { type: 'material' }))).toEqual([
      'Ascorbic acid',
    ]);
    expect(names(await list(alpha, { category: vitamins }))).toEqual([
      'C 500',
      'Multi',
    ]);
    expect(names(await list(alpha, { category: vitaminC }))).toEqual(['C 500']);
    expect(names(await list(alpha, { category: 'uncategorised' }))).toEqual([
      'Ascorbic acid',
      'Bottle',
    ]);
    expect(
      names(await list(alpha, { category: 'uncategorised', type: 'good' })),
    ).toEqual([]);

    // A row names its category by its path from the top.
    const [c500] = (await list(alpha, { category: vitaminC })).entries;
    expect(c500.category).toEqual({
      id: vitaminC,
      path: ['Vitamins', 'Vitamin C'],
    });

    await alpha.agent.get('/v1/products?category=none').expect(400);
    await alpha.agent.get('/v1/products?type=widget').expect(400);
  });

  // #306's 10: the Discontinued filter, and its count.
  it('hides discontinued items unless asked, then alone or beside the rest, and counts them', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const old = await item(alpha.agent, 'Old Focus');
    await item(alpha.agent, 'Focus');
    const oldBottle = await item(alpha.agent, 'Old bottle', {
      type: 'packaging',
    });
    await discontinue(alpha.agent, old.id);
    await discontinue(alpha.agent, oldBottle.id);

    const hidden = await list(alpha, { type: 'good' });
    expect(names(hidden)).toEqual(['Focus']);
    expect(hidden.counts).toEqual({
      // Packaging keeps its tab though each of its items is discontinued.
      types: [
        { type: 'good', count: 1 },
        { type: 'packaging', count: 0 },
      ],
      all: 1,
      // The open tab's: Products'.
      discontinued: 1,
    });

    const only = await list(alpha, { discontinued: 'only' });
    expect(names(only)).toEqual(['Old bottle', 'Old Focus']);
    expect(only.counts).toMatchObject({
      types: [
        { type: 'good', count: 1 },
        { type: 'packaging', count: 1 },
      ],
      all: 2,
      discontinued: 2,
    });

    expect(names(await list(alpha, { discontinued: 'include' }))).toEqual([
      'Focus',
      'Old bottle',
      'Old Focus',
    ]);
    await alpha.agent.get('/v1/products?discontinued=true').expect(400);
  });

  it('counts each tab with the search and the category, a tab kept while a search finds none there', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const vitamins = await category(alpha.agent, 'Vitamins');
    await item(alpha.agent, 'Vitamin C 500', { categoryId: vitamins });
    await item(alpha.agent, 'Vitamin D3', { categoryId: vitamins });
    await item(alpha.agent, 'Vitamin C powder', {
      type: 'material',
      categoryId: vitamins,
    });
    await item(alpha.agent, 'Fish oil');

    const searched = await list(alpha, {
      type: 'good',
      search: 'vitamin c',
    });
    expect(searched.counts).toEqual({
      types: [
        { type: 'good', count: 1 },
        { type: 'material', count: 1 },
      ],
      all: 2,
      discontinued: 0,
    });

    const none = await list(alpha, { type: 'good', search: 'powder' });
    expect(names(none)).toEqual([]);
    expect(none.counts?.types).toEqual([
      { type: 'good', count: 0 },
      { type: 'material', count: 1 },
    ]);

    expect((await list(alpha, { category: vitamins })).counts?.types).toEqual([
      { type: 'good', count: 2 },
      { type: 'material', count: 1 },
    ]);
  });

  // #305: a number in a name by its value; a Chinese name by its pinyin.
  it('sorts by the name the reader sees, a number by its value and Chinese by its pinyin, either way', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await item(alpha.agent, 'Calm 120 caps');
    await item(alpha.agent, 'Calm 30 caps');
    await item(alpha.agent, 'Bamboo');
    await item(alpha.agent, '茶', { sku: 'TEA' });
    await item(alpha.agent, '安神茶', { sku: 'CALM-TEA' });
    await item(alpha.agent, '专注胶囊 120 粒', { sku: 'FOCUS-120' });
    await item(alpha.agent, '专注胶囊 30 粒', { sku: 'FOCUS-30' });

    const ascending = [
      '安神茶',
      'Bamboo',
      'Calm 30 caps',
      'Calm 120 caps',
      '茶',
      '专注胶囊 30 粒',
      '专注胶囊 120 粒',
    ];
    expect(names(await list(alpha, {}, 'zh-Hans'))).toEqual(ascending);
    expect(
      names(await list(alpha, { sort: 'name', order: 'desc' }, 'zh-Hans')),
    ).toEqual([...ascending].reverse());
    expect(await every(alpha, { limit: '3' }, 'zh-Hans')).toEqual(ascending);
  });

  it('sorts by category by its path, the Uncategorised last either way', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const vitamins = await category(alpha.agent, 'Vitamins');
    const vitaminC = await category(alpha.agent, 'Vitamin C', vitamins);
    const vitaminsB = await category(alpha.agent, 'Vitamins B');
    const herbs = await category(alpha.agent, 'Herbs');
    await item(alpha.agent, 'C 500', { categoryId: vitaminC });
    await item(alpha.agent, 'A multi', { categoryId: vitamins });
    await item(alpha.agent, 'Z multi', { categoryId: vitamins });
    await item(alpha.agent, 'B12', { categoryId: vitaminsB });
    await item(alpha.agent, 'Ginseng', { categoryId: herbs });
    await item(alpha.agent, 'Loose');

    expect(await every(alpha, { sort: 'category', limit: '2' })).toEqual([
      'Ginseng',
      'A multi',
      'Z multi',
      'C 500',
      'B12',
      'Loose',
    ]);
    expect(
      await every(alpha, { sort: 'category', order: 'desc', limit: '2' }),
    ).toEqual(['B12', 'C 500', 'A multi', 'Z multi', 'Ginseng', 'Loose']);
  });

  it('sums the stock on hand of every variant and place in its unit, or counts its variants where units differ', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const shelf = await site(alpha.agent, 'SHELF');
    const store = await site(alpha.agent, 'STORE');
    const focus = await item(alpha.agent, 'Focus', {
      sku: 'FOC-60',
      unitOfMeasure: 'bottle',
    });
    const focus120 = body<{ variant: { id: string } }>(
      await alpha.agent
        .post(`/v1/products/${focus.id}/variants`)
        .send({ sku: 'FOC-120', name: '120ct', unitOfMeasure: 'bottle' })
        .expect(201),
    ).variant.id;
    const powder = await item(alpha.agent, 'Powder', { unitOfMeasure: 'kg' });
    await alpha.agent
      .post(`/v1/products/${powder.id}/variants`)
      .send({ sku: 'POWDER-BAG', name: 'Bag', unitOfMeasure: 'each' })
      .expect(201);
    await item(alpha.agent, 'Empty');

    await receive(alpha.agent, focus.variantId, shelf, '10');
    await receive(alpha.agent, focus.variantId, store, '2.5');
    await receive(alpha.agent, focus120, shelf, '4');
    await receive(alpha.agent, powder.variantId, shelf, '7');

    const rows = (await list(alpha)).entries;
    expect(
      rows.map((row) => [
        row.displayName,
        row.sku,
        row.variantCount,
        row.onHand,
        row.unitOfMeasure,
      ]),
    ).toEqual([
      ['Empty', 'EMPTY', 1, '0.0000', 'each'],
      // Its codes in their order, a number by its value.
      ['Focus', 'FOC-60', 2, '16.5000', 'bottle'],
      ['Powder', 'POWDER', 2, null, null],
    ]);

    // Fewest first; units that differ last, either way.
    expect(names(await list(alpha, { sort: 'stock' }))).toEqual([
      'Empty',
      'Focus',
      'Powder',
    ]);
    expect(
      await every(alpha, { sort: 'stock', order: 'desc', limit: '1' }),
    ).toEqual(['Focus', 'Empty', 'Powder']);
  });

  it('says low or out from its reorder points, out before low', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const shelf = await site(alpha.agent, 'SHELF');
    const low = await item(alpha.agent, 'Low');
    const out = await item(alpha.agent, 'Out');
    const enough = await item(alpha.agent, 'Enough');
    const both = await item(alpha.agent, 'Both', { sku: 'BOTH-1' });
    const bothOut = body<{ variant: { id: string } }>(
      await alpha.agent
        .post(`/v1/products/${both.id}/variants`)
        .send({ sku: 'BOTH-2', name: 'Two' })
        .expect(201),
    ).variant.id;
    await item(alpha.agent, 'Unwatched');

    await receive(alpha.agent, low.variantId, shelf, '50');
    await receive(alpha.agent, enough.variantId, shelf, '500');
    await receive(alpha.agent, both.variantId, shelf, '50');
    for (const variant of [
      low.variantId,
      out.variantId,
      enough.variantId,
      both.variantId,
      bothOut,
    ]) {
      await point(alpha.agent, variant, '100');
    }

    expect(
      (await list(alpha)).entries.map((row) => [
        row.displayName,
        row.stockStatus,
      ]),
    ).toEqual([
      ['Both', 'out'],
      ['Enough', null],
      ['Low', 'low'],
      ['Out', 'out'],
      ['Unwatched', null],
    ]);

    // A discontinued item is never low.
    await discontinue(alpha.agent, low.id);
    const [shown] = (await list(alpha, { discontinued: 'only' })).entries;
    expect(shown.stockStatus).toBeNull();
  });

  it('sorts by date added and last changed, either way', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const first = await item(alpha.agent, 'First');
    await item(alpha.agent, 'Second');
    await item(alpha.agent, 'Third');

    expect(names(await list(alpha, { sort: 'added' }))).toEqual([
      'First',
      'Second',
      'Third',
    ]);
    expect(
      await every(alpha, { sort: 'added', order: 'desc', limit: '2' }),
    ).toEqual(['Third', 'Second', 'First']);

    await alpha.agent
      .patch(`/v1/products/${first.id}`)
      .send({ name: 'First, renamed' })
      .expect(204);
    expect(
      names(await list(alpha, { sort: 'changed', order: 'desc' })),
    ).toEqual(['First, renamed', 'Third', 'Second']);
  });

  it('ranks a search before the sort, the closest first either way, and pages on the rank', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await item(alpha.agent, 'Deep Focus');
    await item(alpha.agent, 'Focus Night');
    await item(alpha.agent, 'Focus');
    await item(alpha.agent, 'Calm');

    expect(names(await list(alpha, { search: 'focus' }))).toEqual([
      'Focus',
      'Focus Night',
      'Deep Focus',
    ]);
    expect(
      await every(alpha, { search: 'focus', order: 'desc', limit: '1' }),
    ).toEqual(['Focus', 'Focus Night', 'Deep Focus']);
  });

  // #547: a search's first page read the variants for the match, again
  // for the rank, and twice more for the counts.
  it('matches and ranks a searched page’s variants once, its counts read from the same statement', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await item(alpha.agent, 'Deep Focus');
    await item(alpha.agent, 'Focus');
    await item(alpha.agent, 'Focus powder', { type: 'material' });
    await item(alpha.agent, 'Calm');

    const { result: page, statements } = await captureStatements(() =>
      list(alpha, { type: 'good', search: 'focus' }),
    );

    expect(names(page)).toEqual(['Focus', 'Deep Focus']);
    expect(page.counts).toEqual({
      types: [
        { type: 'good', count: 2 },
        { type: 'material', count: 1 },
      ],
      all: 3,
      discontinued: 0,
    });
    // The match's own test, a variant's name, and the rank's, a code
    // exactly: each once, in one statement, which the counts ride in.
    const times = (text: string, part: string) => text.split(part).length - 1;
    const match = 'search_text("product_variants"."name")';
    const rank = 'lower("product_variants"."sku") =';
    const reads = statements.filter(({ text }) => text.includes(match));
    expect(reads).toHaveLength(1);
    expect(times(reads[0].text, match)).toBe(1);
    expect(times(reads[0].text, rank)).toBe(1);
    expect(reads[0].text).toContain('count(*) filter');
  });

  it('refuses a cursor made for another order, or not made here', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await item(alpha.agent, 'Alpha');
    await item(alpha.agent, 'Bravo');
    const { nextCursor } = await list(alpha, { limit: '1' });

    await alpha.agent
      .get(`/v1/products?limit=1&sort=stock&cursor=${nextCursor}`)
      .expect(400);
    await alpha.agent
      .get(`/v1/products?limit=1&order=desc&cursor=${nextCursor}`)
      .expect(400);
    for (const cursor of [
      'not-a-cursor',
      Buffer.from('{"o":"name asc en unranked","v":["a"]}').toString(
        'base64url',
      ),
      Buffer.from(
        '{"o":"name asc en unranked","v":["a","not-an-id"]}',
      ).toString('base64url'),
    ]) {
      await alpha.agent.get(`/v1/products?cursor=${cursor}`).expect(400);
    }
  });

  it('never shows another organization’s items, nor counts them', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const beta = await registerOrganization(app, 'beta');
    const betaShelf = await site(beta.agent, 'SHELF');
    const betaCategory = await category(beta.agent, 'Vitamins');
    const theirs = await item(beta.agent, 'Focus', {
      categoryId: betaCategory,
    });
    await receive(beta.agent, theirs.variantId, betaShelf, '9');
    const mine = await item(alpha.agent, 'Focus', { sku: 'MINE' });

    const page = await list(alpha, { sort: 'stock' });
    expect(page.entries.map((row) => [row.id, row.onHand])).toEqual([
      [mine.id, '0.0000'],
    ]);
    expect(page.counts?.all).toBe(1);
    expect(names(await list(alpha, { category: betaCategory }))).toEqual([]);
    expect(names(await list(alpha, { search: 'focus' }))).toEqual(['Focus']);
    expect(
      (await list(alpha, { category: betaCategory })).counts?.types,
    ).toEqual([{ type: 'good', count: 0 }]);
  });
});
