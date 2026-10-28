import type { INestApplication } from '@nestjs/common';

import {
  body,
  createE2eApp,
  createPartner,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

type Org = Awaited<ReturnType<typeof registerOrganization>>;
type Language = 'en' | 'zh-Hans';

interface ProductRow {
  name: string;
}
interface PartnerRow {
  name: string;
}
interface VariantRow {
  sku: string;
  productName: string;
}

/**
 * Search on the lists that load whole (ADR-056, amended October 2026):
 * Products, Partners and the item pickers' catalogue, each matched as the
 * lookup matches its kind (common/search.ts, item-search, partner-search)
 * and ranked as the lookup ranks, exact, then at the start, then anywhere,
 * then by name. Each ranking case is built so that the name's own order
 * would put the rows the other way round.
 */
describe('Whole-list search (e2e)', () => {
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

  /** A product with its one variant; its id. */
  async function product(
    org: Org,
    name: string,
    sku: string,
    translations: { locale: string; name: string }[] = [],
  ): Promise<string> {
    const { product } = body<{ product: { id: string } }>(
      await org.agent
        .post('/v1/products')
        .send({ type: 'good', name, variant: { sku, tracksLots: false } })
        .expect(201),
    );
    if (translations.length > 0) {
      await org.agent
        .put(`/v1/products/${product.id}/translations`)
        .send({ translations })
        .expect(204);
    }
    return product.id;
  }

  /** The catalogue every case below reads. */
  async function catalogue(slug: string) {
    const org = await registerOrganization(app, slug);
    const focus = await product(org, 'Focus', 'FOCUS-60', [
      { locale: 'fr-CA', name: 'Capsules Focus' },
      { locale: 'zh-Hans', name: '专注胶囊' },
    ]);
    await org.agent
      .post(`/v1/products/${focus}/variants`)
      .send({ sku: 'FOCUS-120', name: '120ct', tracksLots: false })
      .expect(201);
    await product(org, 'Focus Night', 'NIGHT-30');
    await product(org, 'Deep Focus', 'DEEP-30');
    await product(org, 'Éleuthéro 90', 'ELEU-90');
    await product(org, '深海鱼油', 'FISH-OIL');
    await product(org, '安神专注胶囊', 'CALM-60');
    await product(org, 'Magnesium A', 'MAG-600');
    await product(org, 'Magnesium B', 'MAG-60');
    return org;
  }

  async function get<T>(
    org: Org,
    path: string,
    search: string,
    language: Language = 'en',
  ): Promise<T[]> {
    return body<T[]>(
      await org.agent
        .get(`${path}?search=${encodeURIComponent(search)}`)
        .set('Accept-Language', language)
        .expect(200),
    );
  }

  const products = async (org: Org, search: string, language?: Language) =>
    (await get<ProductRow>(org, '/v1/products', search, language)).map(
      (row) => row.name,
    );

  const variants = async (org: Org, search: string, language?: Language) =>
    (await get<VariantRow>(org, '/v1/products/variants', search, language)).map(
      (row) => row.sku,
    );

  const partners = async (org: Org, search: string) =>
    (await get<PartnerRow>(org, '/v1/partners', search)).map((row) => row.name);

  describe('GET /v1/products', () => {
    it('finds a product by part of a SKU or a name, case and accents ignored', async () => {
      const alpha = await catalogue('alpha');

      expect(await products(alpha, 'eleu-9')).toEqual(['Éleuthéro 90']);
      expect(await products(alpha, 'FOCUS NIGHT')).toEqual(['Focus Night']);
      expect(await products(alpha, 'eleuthero')).toEqual(['Éleuthéro 90']);
      // Any of its SKUs, not only the first variant's.
      expect(await products(alpha, 'focus-120')).toEqual(['Focus']);
      expect(await products(alpha, 'nothing-like-this')).toEqual([]);
    });

    it('finds a product by its name in another language, shown in the reader’s', async () => {
      const alpha = await catalogue('alpha');

      expect(await products(alpha, 'capsules')).toEqual(['Focus']);
      expect(await products(alpha, 'deep focus', 'zh-Hans')).toEqual([
        'Deep Focus',
      ]);
      expect(await products(alpha, 'capsules', 'zh-Hans')).toEqual([
        '专注胶囊',
      ]);
    });

    it('finds a Chinese name by its pinyin, its initials or one character', async () => {
      const alpha = await catalogue('alpha');

      expect(await products(alpha, 'shenhaiyuyou')).toEqual(['深海鱼油']);
      expect(await products(alpha, 'shyy')).toEqual(['深海鱼油']);
      expect(await products(alpha, '鱼')).toEqual(['深海鱼油']);
    });

    it('ranks exact, then at the start, then anywhere, before the name’s order', async () => {
      const alpha = await catalogue('alpha');

      expect(await products(alpha, 'focus')).toEqual([
        'Focus',
        'Focus Night',
        'Deep Focus',
      ]);
      // A translation's name and its pinyin rank as the base name does.
      expect(await products(alpha, '专注胶囊', 'zh-Hans')).toEqual([
        '专注胶囊',
        '安神专注胶囊',
      ]);
      expect(await products(alpha, 'zhuanzhujiaonang', 'zh-Hans')).toEqual([
        '专注胶囊',
        '安神专注胶囊',
      ]);
    });

    it('finds a discontinued product, as the list shows it', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const id = await product(alpha, 'Old Focus', 'OLD-1');
      await alpha.agent
        .patch(`/v1/products/${id}`)
        .send({ isActive: false })
        .expect(204);

      expect(await products(alpha, 'old')).toEqual(['Old Focus']);
    });

    it('answers as before without a search', async () => {
      const alpha = await catalogue('alpha');

      const all = body<ProductRow[]>(
        await alpha.agent.get('/v1/products').expect(200),
      );
      expect(all).toHaveLength(8);
    });
  });

  describe('GET /v1/products/variants', () => {
    it('finds an item by SKU, name, another language, pinyin or one character', async () => {
      const alpha = await catalogue('alpha');

      expect(await variants(alpha, 'eleu-9')).toEqual(['ELEU-90']);
      expect(await variants(alpha, 'FOCUS NIGHT')).toEqual(['NIGHT-30']);
      expect(await variants(alpha, 'eleuthero')).toEqual(['ELEU-90']);
      expect(await variants(alpha, '120ct')).toEqual(['FOCUS-120']);
      expect(await variants(alpha, 'capsules')).toEqual([
        'FOCUS-120',
        'FOCUS-60',
      ]);
      expect(await variants(alpha, 'shyy')).toEqual(['FISH-OIL']);
      expect(await variants(alpha, '鱼')).toEqual(['FISH-OIL']);
    });

    it('names what it finds in the reader’s language', async () => {
      const alpha = await catalogue('alpha');

      const [found] = await get<VariantRow>(
        alpha,
        '/v1/products/variants',
        'focus-60',
        'zh-Hans',
      );
      expect(found).toMatchObject({ sku: 'FOCUS-60', productName: '专注胶囊' });
    });

    it('puts a SKU typed whole first, and a translation’s exact name', async () => {
      const alpha = await catalogue('alpha');

      // By name, Magnesium A (MAG-600) would come first.
      expect(await variants(alpha, 'mag-60')).toEqual(['MAG-60', 'MAG-600']);
      expect(await variants(alpha, '专注胶囊', 'zh-Hans')).toEqual([
        'FOCUS-120',
        'FOCUS-60',
        'CALM-60',
      ]);
    });

    it('leaves out a discontinued item, as it does without a search', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const id = await product(alpha, 'Old Focus', 'OLD-1');
      await alpha.agent
        .patch(`/v1/products/${id}`)
        .send({ isActive: false })
        .expect(204);

      expect(await variants(alpha, 'old')).toEqual([]);
    });
  });

  describe('GET /v1/partners', () => {
    async function directory(slug: string) {
      const org = await registerOrganization(app, slug);
      await createPartner(org.agent, {
        name: 'Northside Pharmacy',
        code: 'NS-01',
        taxId: '123456789RT0001',
      });
      await createPartner(org.agent, { name: 'Pharmacie Saint-Laurent' });
      await createPartner(org.agent, { name: '明德药房' });
      await createPartner(org.agent, { name: 'Pharmabest' });
      await createPartner(org.agent, { name: 'Pharma' });
      return org;
    }

    it('finds a partner by part of its name, its code or its tax ID', async () => {
      const alpha = await directory('alpha');

      expect(await partners(alpha, 'NORTH')).toEqual(['Northside Pharmacy']);
      expect(await partners(alpha, 'ns-0')).toEqual(['Northside Pharmacy']);
      expect(await partners(alpha, '456789rt')).toEqual(['Northside Pharmacy']);
      expect(await partners(alpha, 'nothing-like-this')).toEqual([]);
    });

    it('ignores accents and punctuation in a name', async () => {
      const alpha = await directory('alpha');

      expect(await partners(alpha, 'saint laurent')).toEqual([
        'Pharmacie Saint-Laurent',
      ]);
      expect(await partners(alpha, 'pharmacie  saint-laurent')).toEqual([
        'Pharmacie Saint-Laurent',
      ]);
    });

    it('finds a Chinese name by characters, pinyin, initials or one character', async () => {
      const alpha = await directory('alpha');

      expect(await partners(alpha, '明德')).toEqual(['明德药房']);
      expect(await partners(alpha, 'mingde')).toEqual(['明德药房']);
      expect(await partners(alpha, 'mdyf')).toEqual(['明德药房']);
      expect(await partners(alpha, '德')).toEqual(['明德药房']);
    });

    it('ranks exact, then at the start, then anywhere, then by name', async () => {
      const alpha = await directory('alpha');

      // By name alone, Northside Pharmacy would come first.
      expect(await partners(alpha, 'pharma')).toEqual([
        'Pharma',
        'Pharmabest',
        'Pharmacie Saint-Laurent',
        'Northside Pharmacy',
      ]);
    });

    it('answers as before without a search', async () => {
      const alpha = await directory('alpha');

      const all = body<PartnerRow[]>(
        await alpha.agent.get('/v1/partners').expect(200),
      );
      expect(all).toHaveLength(5);
    });
  });

  it("never finds another organization's products, items or partners", async () => {
    const alpha = await catalogue('alpha');
    await createPartner(alpha.agent, { name: 'Northside Pharmacy' });
    const beta = await registerOrganization(app, 'beta');

    for (const search of ['focus', '专注胶囊', 'shyy', '鱼']) {
      expect(await products(beta, search, 'zh-Hans')).toEqual([]);
      expect(await variants(beta, search, 'zh-Hans')).toEqual([]);
    }
    expect(await partners(beta, 'northside')).toEqual([]);
  });

  it.each(['/v1/products', '/v1/products/variants', '/v1/partners'])(
    'reads and validates search on %s',
    async (path) => {
      const alpha = await registerOrganization(app, 'alpha');

      expect(await get(alpha, path, 'zz%_top')).toEqual([]);
      await alpha.agent.get(`${path}?search=${'x'.repeat(101)}`).expect(400);
    },
  );
});
