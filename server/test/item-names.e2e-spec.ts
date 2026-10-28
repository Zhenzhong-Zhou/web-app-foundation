import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { users } from '../src/database/schema';
import { itemName } from '../src/modules/stock/item-name';
import {
  body,
  createE2eApp,
  createLocation,
  createPartner,
  createVariant,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

type Agent = Awaited<ReturnType<typeof registerOrganization>>['agent'];
type Language = 'zh-Hans' | 'en';

/** What the reads are asked about, made once. */
interface World {
  agent: Agent;
  productId: string;
  variantId: string;
  /** Another item, untranslated, for an order to start from. */
  scoopId: string;
  orderId: string;
  lineId: string;
  shelf: string;
  lotId: string;
  priceListId: string;
}

/** Each read's item, as an item (product and variant) or a product alone. */
const NAMES = {
  item: { 'zh-Hans': '专注胶囊 (60粒)', en: 'Focus (60ct)' },
  product: { 'zh-Hans': '专注胶囊', en: 'Focus' },
} as const;

interface NamedRead {
  /** As the OpenAPI document names it: method and path. */
  operation: string;
  of: keyof typeof NAMES;
  ask: (world: World, language: Language) => Promise<string>;
}

async function read<T>(
  world: World,
  language: Language,
  path: string,
): Promise<T> {
  return body<T>(
    await world.agent.get(path).set('Accept-Language', language).expect(200),
  );
}

interface Line {
  description: string;
}
interface Named {
  id: string;
  productName: string;
  variantName: string | null;
}
interface Items {
  items: Line[];
}

/**
 * Every read that names an item for a person (ADR-056): asked in Chinese,
 * the Chinese name; in English, the base. The writes among them return
 * what their read returns, through the same function, so the ones that can
 * show a translated name are asked too.
 */
const NAMED_READS: NamedRead[] = [
  {
    operation: 'GET /v1/products',
    of: 'product',
    ask: async (world, language) =>
      (
        await read<{ id: string; name: string }[]>(
          world,
          language,
          '/v1/products',
        )
      ).find((product) => product.id === world.productId)!.name,
  },
  {
    operation: 'GET /v1/products/{id}',
    of: 'item',
    ask: async (world, language) => {
      const product = await read<{
        displayName: string;
        variants: { displayName: string | null }[];
      }>(world, language, `/v1/products/${world.productId}`);
      return itemName(product.displayName, product.variants[0].displayName);
    },
  },
  {
    operation: 'GET /v1/products/variants',
    of: 'item',
    ask: async (world, language) => {
      const option = (
        await read<Named[]>(world, language, '/v1/products/variants')
      ).find((each) => each.id === world.variantId)!;
      return itemName(option.productName, option.variantName);
    },
  },
  {
    operation: 'GET /v1/stock',
    of: 'item',
    ask: async (world, language) => {
      const page = await read<{ entries: (Named & { variantId: string })[] }>(
        world,
        language,
        '/v1/stock',
      );
      const row = page.entries.find(
        (entry) => entry.variantId === world.variantId,
      )!;
      return itemName(row.productName, row.variantName);
    },
  },
  {
    operation: 'GET /v1/stock/lots/{id}/trace',
    of: 'item',
    ask: async (world, language) =>
      (
        await read<{ lot: Line }>(
          world,
          language,
          `/v1/stock/lots/${world.lotId}/trace`,
        )
      ).lot.description,
  },
  {
    operation: 'GET /v1/orders/{id}',
    of: 'item',
    ask: async (world, language) =>
      (
        await read<{ lines: Line[] }>(
          world,
          language,
          `/v1/orders/${world.orderId}`,
        )
      ).lines[0].description,
  },
  {
    operation: 'GET /v1/orders/{id}/shipments',
    of: 'item',
    ask: async (world, language) =>
      (
        await read<Items[]>(
          world,
          language,
          `/v1/orders/${world.orderId}/shipments`,
        )
      )[0].items[0].description,
  },
  {
    operation: 'GET /v1/orders/{id}/returns',
    of: 'item',
    ask: async (world, language) =>
      (
        await read<Items[]>(
          world,
          language,
          `/v1/orders/${world.orderId}/returns`,
        )
      )[0].items[0].description,
  },
  {
    operation: 'GET /v1/price-lists/{id}',
    of: 'item',
    ask: async (world, language) =>
      (
        await read<{ priceList: Items }>(
          world,
          language,
          `/v1/price-lists/${world.priceListId}`,
        )
      ).priceList.items[0].description,
  },
  {
    operation: 'GET /v1/recent',
    of: 'product',
    ask: async (world, language) =>
      (
        await read<{ recent: { title: string }[] }>(
          world,
          language,
          '/v1/recent',
        )
      ).recent[0].title,
  },
  {
    operation: 'GET /v1/home',
    of: 'product',
    ask: async (world, language) => {
      const home = await read<{
        welcome: { items: { key: string; what: { words: string } | null }[] };
      }>(world, language, '/v1/home');
      return home.welcome.items.find((item) => item.key === 'lookUp')!.what!
        .words;
    },
  },
  {
    operation: 'GET /v1/lookup',
    of: 'item',
    ask: async (world, language) => {
      const found = await read<{
        groups: { kind: string; results: { title: string }[] }[];
      }>(world, language, '/v1/lookup?q=FOCUS');
      return found.groups.find((group) => group.kind === 'item')!.results[0]
        .title;
    },
  },
  {
    operation: 'POST /v1/orders',
    of: 'item',
    ask: async (world, language) =>
      body<{ order: { lines: Line[] } }>(
        await world.agent
          .post('/v1/orders')
          .set('Accept-Language', language)
          .send({
            partnerId: await createPartner(world.agent, {
              name: `Another ${language}`,
            }),
            direction: 'sale',
            lines: [{ variantId: world.variantId, quantityOrdered: '1' }],
          })
          .expect(201),
      ).order.lines[0].description,
  },
  {
    operation: 'POST /v1/orders/{id}/duplicate',
    of: 'item',
    ask: async (world, language) => {
      // A draft: an order shipped against is not copied (ADR-031).
      const draft = body<{ order: { id: string } }>(
        await world.agent
          .post('/v1/orders')
          .send({
            partnerId: await createPartner(world.agent, {
              name: `Draft ${language}`,
            }),
            direction: 'sale',
            lines: [{ variantId: world.variantId, quantityOrdered: '1' }],
          })
          .expect(201),
      ).order;
      return body<{ order: { lines: Line[] } }>(
        await world.agent
          .post(`/v1/orders/${draft.id}/duplicate`)
          .set('Accept-Language', language)
          .send({})
          .expect(201),
      ).order.lines[0].description;
    },
  },
  {
    operation: 'POST /v1/orders/{id}/lines',
    of: 'item',
    ask: async (world, language) => {
      const order = body<{ order: { id: string } }>(
        await world.agent
          .post('/v1/orders')
          .send({
            partnerId: await createPartner(world.agent, {
              name: `Scoops ${language}`,
            }),
            direction: 'sale',
            lines: [{ variantId: world.scoopId, quantityOrdered: '1' }],
          })
          .expect(201),
      ).order;
      return body<{ line: Line }>(
        await world.agent
          .post(`/v1/orders/${order.id}/lines`)
          .set('Accept-Language', language)
          .send({ variantId: world.variantId, quantityOrdered: '1' })
          .expect(201),
      ).line.description;
    },
  },
  {
    operation: 'POST /v1/orders/{id}/returns',
    of: 'item',
    ask: async (world, language) =>
      body<{ orderReturn: Items }>(
        await world.agent
          .post(`/v1/orders/${world.orderId}/returns`)
          .set('Accept-Language', language)
          .send({
            toLocationId: world.shelf,
            lines: [
              {
                lineId: world.lineId,
                lots: [{ lotId: world.lotId, quantity: '1' }],
              },
            ],
          })
          .expect(201),
      ).orderReturn.items[0].description,
  },
  {
    operation: 'PUT /v1/price-lists/{id}/items/{variantId}',
    of: 'item',
    ask: async (world, language) =>
      body<{ item: Line }>(
        await world.agent
          .put(`/v1/price-lists/${world.priceListId}/items/${world.variantId}`)
          .set('Accept-Language', language)
          .send({ unitPrice: '13' })
          .expect(200),
      ).item.description,
  },
];

/**
 * Writes that return their read's detail, through the same function, but
 * whose answer has nothing translated to show: a new product or variant
 * has no other names yet, and a new price list no items.
 */
const AS_THEIR_READ = [
  'POST /v1/products',
  'POST /v1/products/{id}/variants',
  'POST /v1/price-lists',
];

/**
 * What keeps the base name, by ADR-056's "Unchanged": documents, in their
 * own languages (ADR-054, ADR-071). The packing slip's names are #161's.
 */
const KEEP_THE_BASE: Record<string, string> = {
  'GET /v1/orders/{id}/shipments/{shipmentId}': 'the packing slip',
  'POST /v1/orders/{id}/shipments': 'the packing slip',
  'GET /v1/invoices/{id}': 'an invoice',
  'POST /v1/invoices': 'an invoice',
  'POST /v1/invoices/{id}/issue': 'an invoice',
  'POST /v1/invoices/{id}/void': 'an invoice',
  'POST /v1/invoices/{id}/credit-notes/preview': 'a credit note',
  'POST /v1/invoices/{id}/credit-notes': 'a credit note',
  'GET /v1/credit-notes/{id}': 'a credit note',
};

interface Schema {
  properties?: Record<string, unknown>;
}
interface Operation {
  parameters?: { name: string; in: string }[];
  responses?: Record<string, { content?: Record<string, unknown> }>;
}

/** Every `$ref` inside a part of the document, by schema name. */
function refsIn(part: unknown): string[] {
  if (Array.isArray(part)) return part.flatMap(refsIn);
  if (typeof part !== 'object' || part === null) return [];
  return Object.entries(part).flatMap(([key, value]) =>
    key === '$ref' && typeof value === 'string'
      ? [value.split('/').at(-1)!]
      : refsIn(value),
  );
}

/**
 * Every operation in the OpenAPI document: whether its answer names an
 * item, a schema with a SKU beside a name reached from the response, and
 * whether it takes the reader's language. How a read added later is found,
 * so it fails here until it takes the rule or says why it keeps the base.
 */
function documentedOperations() {
  const document = JSON.parse(
    readFileSync(join(__dirname, '..', 'openapi.json'), 'utf8'),
  ) as {
    paths: Record<string, Record<string, Operation>>;
    components: { schemas: Record<string, Schema> };
  };
  const { schemas } = document.components;
  const naming = (schema: Schema) => {
    const fields = Object.keys(schema.properties ?? {});
    return (
      fields.includes('sku') &&
      ['name', 'description', 'productName'].some((name) =>
        fields.includes(name),
      )
    );
  };
  const reaches = (name: string, seen: string[] = []): boolean =>
    naming(schemas[name] ?? {}) ||
    (!seen.includes(name) &&
      refsIn(schemas[name]).some((ref) => reaches(ref, [...seen, name])));

  return Object.entries(document.paths).flatMap(([path, operations]) =>
    Object.entries(operations).map(([method, operation]) => ({
      operation: `${method.toUpperCase()} ${path}`,
      namesItem: refsIn(operation.responses).some((ref) => reaches(ref)),
      readsLanguage: (operation.parameters ?? []).some(
        (parameter) => parameter.name === 'accept-language',
      ),
    })),
  );
}

/**
 * An item's name in the reader's language, on every screen (ADR-056): one
 * product named in Chinese, and every read that names it.
 */
describe('Names in the reader’s language (e2e)', () => {
  let app: INestApplication;
  let world: World;

  beforeAll(async () => {
    app = await createE2eApp();
    await resetDatabase(app);
    const db = app.get<Database>(UNSAFE_GLOBAL_DB);

    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    // Home's welcome with its first week (ADR-079), Look something up
    // among it.
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, alpha.userId));
    await agent.post('/v1/home/getting-started/dismiss').expect(204);

    const product = body<{
      product: { id: string; variants: { id: string }[] };
    }>(
      await agent
        .post('/v1/products')
        .send({
          type: 'good',
          name: 'Focus',
          variant: { sku: 'FOCUS-60CT', name: '60ct', tracksLots: true },
        })
        .expect(201),
    ).product;
    const productId = product.id;
    const variantId = product.variants[0].id;
    await agent
      .put(`/v1/products/${productId}/translations`)
      .send({ translations: [{ locale: 'zh-Hans', name: '专注胶囊' }] })
      .expect(204);
    await agent
      .put(`/v1/products/${productId}/variants/${variantId}/translations`)
      .send({ translations: [{ locale: 'zh-Hans', name: '60粒' }] })
      .expect(204);

    const scoopId = await createVariant(agent, {
      type: 'good',
      name: 'Scoop',
      variant: { sku: 'SCOOP' },
    });

    const shelf = await createLocation(agent, { type: 'site', name: 'Shelf' });
    await agent
      .post('/v1/stock/movements')
      .send({
        variantId,
        toLocationId: shelf,
        quantity: '100',
        reason: 'receipt',
        lot: { code: 'L-01', expiresAt: '2030-01-01' },
      })
      .expect(201);
    const lotId = body<{ entries: { lotId: string | null }[] }>(
      await agent.get('/v1/stock').expect(200),
    ).entries[0].lotId!;

    // A sale, shipped, and one back.
    const order = body<{ order: { id: string; lines: { id: string }[] } }>(
      await agent
        .post('/v1/orders')
        .send({
          partnerId: await createPartner(agent, { name: 'Northside' }),
          direction: 'sale',
          lines: [
            {
              variantId,
              quantityOrdered: '10',
              unitPrice: '12.5',
              currency: 'CAD',
            },
          ],
        })
        .expect(201),
    ).order;
    const lineId = order.lines[0].id;
    await agent
      .patch(`/v1/orders/${order.id}`)
      .send({ status: 'confirmed' })
      .expect(204);
    await agent
      .post(`/v1/orders/${order.id}/shipments`)
      .send({ fromLocationId: shelf, lines: [{ lineId, quantity: '6' }] })
      .expect(201);
    await agent
      .post(`/v1/orders/${order.id}/returns`)
      .send({
        toLocationId: shelf,
        lines: [{ lineId, lots: [{ lotId, quantity: '1' }] }],
      })
      .expect(201);

    const priceListId = body<{ priceList: { id: string } }>(
      await agent
        .post('/v1/price-lists')
        .send({ name: 'Retail', direction: 'sale', currency: 'CAD' })
        .expect(201),
    ).priceList.id;
    await agent
      .put(`/v1/price-lists/${priceListId}/items/${variantId}`)
      .send({ unitPrice: '12' })
      .expect(200);

    // Opened, so Recently opened and the welcome name it.
    await agent
      .post('/v1/recent')
      .send({ kind: 'product', id: productId })
      .expect(204);

    world = {
      agent,
      productId,
      variantId,
      scoopId,
      orderId: order.id,
      lineId,
      shelf,
      lotId,
      priceListId,
    };
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(NAMED_READS.map((named) => [named.operation, named] as const))(
    '%s names the item in Chinese for a reader in Chinese, else by its base name',
    async (_operation, named) => {
      expect(await named.ask(world, 'zh-Hans')).toBe(
        NAMES[named.of]['zh-Hans'],
      );
      expect(await named.ask(world, 'en')).toBe(NAMES[named.of].en);
    },
  );

  it('lists every operation that names an item, each reading the language or keeping the base', () => {
    const operations = documentedOperations();
    const resolved = [
      ...NAMED_READS.map((named) => named.operation),
      ...AS_THEIR_READ,
    ];

    // Found by a SKU beside a name; the rest are listed by hand above.
    const unlisted = operations
      .filter(({ namesItem }) => namesItem)
      .map(({ operation }) => operation)
      .filter(
        (operation) =>
          !resolved.includes(operation) && !(operation in KEEP_THE_BASE),
      );
    expect(unlisted).toEqual([]);

    // Every one that resolves takes the reader's language, and exists.
    const deaf = resolved.filter(
      (operation) =>
        !operations.find((each) => each.operation === operation)?.readsLanguage,
    );
    expect(deaf).toEqual([]);
  });

  it('keeps the base name on the packing slip and in CSV, for a reader in Chinese', async () => {
    const { agent, orderId, priceListId } = world;
    const [shipment] = await read<{ id: string }[]>(
      world,
      'zh-Hans',
      `/v1/orders/${orderId}/shipments`,
    );
    const slip = await read<Items>(
      world,
      'zh-Hans',
      `/v1/orders/${orderId}/shipments/${shipment.id}`,
    );
    expect(slip.items[0].description).toBe(NAMES.item.en);

    for (const path of [
      `/v1/price-lists/${priceListId}/export`,
      '/v1/stock/export',
    ]) {
      const csv = (
        await agent.get(path).set('Accept-Language', 'zh-Hans').expect(200)
      ).text;
      expect(csv).toContain('Focus');
      expect(csv).not.toContain('专注胶囊');
    }
  });

  it('keeps the base name where the product page edits it, for a reader in Chinese (4.2)', async () => {
    const { agent, productId, variantId } = world;
    const ask = async (language: Language) =>
      body<{
        name: string;
        displayName: string;
        variants: {
          name: string | null;
          displayName: string | null;
          unitOfMeasure: string;
        }[];
      }>(
        await agent
          .get(`/v1/products/${productId}`)
          .set('Accept-Language', language)
          .expect(200),
      );

    const shown = await ask('zh-Hans');
    expect(shown).toMatchObject({ name: 'Focus', displayName: '专注胶囊' });
    expect(shown.variants[0]).toMatchObject({
      name: '60ct',
      displayName: '60粒',
    });

    // Edit variant sends back the name it was filled from, with a new unit.
    await agent
      .patch(`/v1/products/${productId}/variants/${variantId}`)
      .set('Accept-Language', 'zh-Hans')
      .send({ name: shown.variants[0].name, unitOfMeasure: 'bottle' })
      .expect(204);

    const after = await ask('en');
    expect(after.variants[0]).toMatchObject({
      name: '60ct',
      displayName: '60ct',
      unitOfMeasure: 'bottle',
    });
    expect((await ask('zh-Hans')).variants[0].displayName).toBe('60粒');
  });
});
