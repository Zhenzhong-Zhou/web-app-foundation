import type { INestApplication } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  auditLog,
  organizations,
  products,
  productTranslations,
  productVariants,
  variantTranslations,
} from '../src/database/schema';
import {
  addViewer,
  asOrganizationFromBefore,
  body,
  createE2eApp,
  registerOrganization,
} from './utils/fixtures';
import type { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

type Agent = ReturnType<typeof authedAgent>;

interface Row {
  kind: 'item' | 'variant';
  id: string;
  productId: string;
  sku: string | null;
  ownName: string | null;
  keptName: string;
  ownDescription: string | null;
  keptDescription: string | null;
}

interface Preview {
  language: string;
  items: number;
  variants: number;
  copies: number;
  total: number;
  differing: Row[];
}

const ROUTE = '/v1/organization/product-name-language';

/**
 * The language an organization's items are named in, chosen (ADR-054,
 * amended for #531): what the choice will do, read first; then the choice,
 * in one transaction under the organization's lock, the copies removed and
 * each name that differs kept as chosen; and no name kept in that language
 * afterwards, a names save meanwhile waiting for it.
 */
describe('The language items are named in (e2e)', () => {
  let app: INestApplication;
  let db: Database;

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

  /** An item with its one variant, and its ids. */
  async function item(
    agent: Agent,
    name: string,
    variant: { sku: string; name?: string },
    description?: string,
  ) {
    const { product } = body<{
      product: { id: string; variants: { id: string }[] };
    }>(
      await agent
        .post('/v1/products')
        .send({ type: 'good', name, description, variant })
        .expect(201),
    );
    return { productId: product.id, variantId: product.variants[0].id };
  }

  function keepNames(agent: Agent, productId: string, names: object[]) {
    return agent
      .put(`/v1/products/${productId}/translations`)
      .send({ translations: names });
  }

  function keepVariantNames(
    agent: Agent,
    ids: { productId: string; variantId: string },
    names: object[],
  ) {
    return agent
      .put(
        `/v1/products/${ids.productId}/variants/${ids.variantId}/translations`,
      )
      .send({ translations: names });
  }

  async function preview(agent: Agent, language: string) {
    return body<Preview>(
      await agent.get(`${ROUTE}?language=${language}`).expect(200),
    );
  }

  /** Each row as it was shown, with the one name chosen for all. */
  function choicesOf(rows: Row[], keep?: 'own' | 'kept') {
    return rows.map((row) => ({
      kind: row.kind,
      id: row.id,
      keep,
      ownName: row.ownName,
      keptName: row.keptName,
      ownDescription: row.ownDescription,
      keptDescription: row.keptDescription,
    }));
  }

  function choose(agent: Agent, language: string, choices: object[]) {
    return agent.put(ROUTE).send({ language, choices });
  }

  async function languageOf(organizationId: string) {
    const [row] = await db
      .select({ language: organizations.productNameLanguage })
      .from(organizations)
      .where(eq(organizations.id, organizationId));
    return row.language;
  }

  async function keptIn(organizationId: string, locale: 'en' | 'zh-Hans') {
    const items = await db
      .select({ name: productTranslations.name })
      .from(productTranslations)
      .where(
        and(
          eq(productTranslations.organizationId, organizationId),
          eq(productTranslations.locale, locale),
        ),
      );
    const variants = await db
      .select({ name: variantTranslations.name })
      .from(variantTranslations)
      .where(
        and(
          eq(variantTranslations.organizationId, organizationId),
          eq(variantTranslations.locale, locale),
        ),
      );
    return [...items, ...variants].map((row) => row.name).sort();
  }

  it('says what choosing a language will do: the own names it counts, the copies, and each name that differs', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await asOrganizationFromBefore(app, alpha.organizationId);
    const { agent } = alpha;

    // Copies: the name the same, the description empty or the same.
    const focus = await item(agent, 'Focus', { sku: 'FOC-60', name: '60ct' });
    await keepNames(agent, focus.productId, [
      { locale: 'zh-Hans', name: 'Focus' },
    ]).expect(204);
    await keepVariantNames(agent, focus, [
      { locale: 'zh-Hans', name: '60ct' },
    ]).expect(204);
    const night = await item(agent, 'Night', { sku: 'NIGHT' }, 'Sleep support');
    await keepNames(agent, night.productId, [
      { locale: 'zh-Hans', name: 'Night', description: 'Sleep support' },
    ]).expect(204);

    // Different: a name, a description alone, and a variant's name.
    const calm = await item(agent, 'Calm 90ct', { sku: 'CALM-90' });
    await keepNames(agent, calm.productId, [
      { locale: 'zh-Hans', name: '安神' },
    ]).expect(204);
    const sleep = await item(agent, 'Sleep', { sku: 'SLEEP' }, 'At night');
    await keepNames(agent, sleep.productId, [
      { locale: 'zh-Hans', name: 'Sleep', description: '夜间' },
    ]).expect(204);
    const vitamin = await item(agent, 'Vitamin D', {
      sku: 'VITD-60',
      name: '60ct',
    });
    await keepVariantNames(agent, vitamin, [
      { locale: 'zh-Hans', name: '60粒' },
    ]).expect(204);

    // Another language's name is not counted.
    const iron = await item(agent, 'Iron', { sku: 'IRON' });
    await keepNames(agent, iron.productId, [
      { locale: 'fr-CA', name: 'Fer' },
    ]).expect(204);

    expect(await preview(agent, 'zh-Hans')).toEqual({
      language: 'zh-Hans',
      items: 6,
      variants: 2,
      copies: 3,
      total: 3,
      differing: [
        {
          kind: 'item',
          id: calm.productId,
          productId: calm.productId,
          sku: null,
          ownName: 'Calm 90ct',
          keptName: '安神',
          ownDescription: null,
          keptDescription: null,
        },
        {
          kind: 'item',
          id: sleep.productId,
          productId: sleep.productId,
          sku: null,
          ownName: 'Sleep',
          keptName: 'Sleep',
          ownDescription: 'At night',
          keptDescription: '夜间',
        },
        {
          kind: 'variant',
          id: vitamin.variantId,
          productId: vitamin.productId,
          sku: 'VITD-60',
          ownName: '60ct',
          keptName: '60粒',
          ownDescription: null,
          keptDescription: null,
        },
      ],
    });

    // Read only: nothing is removed, nothing chosen.
    expect(await keptIn(alpha.organizationId, 'zh-Hans')).toHaveLength(6);
    expect(await languageOf(alpha.organizationId)).toBeNull();

    await agent.get(`${ROUTE}?language=zh`).expect(400);
    await agent.get(ROUTE).expect(400);
  });

  it('removes the copies, sets the language and records it with the counts', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await asOrganizationFromBefore(app, alpha.organizationId);
    const { agent } = alpha;
    const focus = await item(agent, 'Focus', { sku: 'FOC-60', name: '60ct' });
    await keepNames(agent, focus.productId, [
      { locale: 'zh-Hans', name: 'Focus' },
      { locale: 'fr-CA', name: 'Focus' },
    ]).expect(204);
    await keepVariantNames(agent, focus, [
      { locale: 'zh-Hans', name: '60ct' },
    ]).expect(204);

    // Never back to not set, nor a language the app does not speak.
    await choose(agent, null as unknown as string, []).expect(400);
    await choose(agent, 'zh', []).expect(400);

    const res = await choose(agent, 'zh-Hans', []).expect(200);
    expect(body(res)).toEqual({
      copiesRemoved: 2,
      namesRemoved: 0,
      renamed: 0,
    });

    const { organization } = body<{
      organization: { productNameLanguage: string | null };
    }>(await agent.get('/v1/organization').expect(200));
    expect(organization.productNameLanguage).toBe('zh-Hans');
    expect(await keptIn(alpha.organizationId, 'zh-Hans')).toEqual([]);
    // Another language's names stay.
    const [french] = await db
      .select({ name: productTranslations.name })
      .from(productTranslations)
      .where(eq(productTranslations.locale, 'fr-CA'));
    expect(french.name).toBe('Focus');

    const entries = await db
      .select({ payload: auditLog.payload })
      .from(auditLog)
      .where(eq(auditLog.action, 'organization.updated'));
    expect(entries.map((entry) => entry.payload)).toEqual([
      {
        productNameLanguage: { from: null, to: 'zh-Hans' },
        copiesRemoved: 2,
        namesRemoved: 0,
        renamed: 0,
      },
    ]);
  });

  it('keeps the name chosen on each row: the own one removes the kept, the kept one renames the item as Edit does, History saying so', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const focus = await item(agent, 'Focus capsules', {
      sku: 'FOC-60',
      name: '60ct',
    });
    await keepNames(agent, focus.productId, [
      { locale: 'zh-Hans', name: '专注胶囊', description: '每瓶六十粒' },
    ]).expect(204);
    await keepVariantNames(agent, focus, [
      { locale: 'zh-Hans', name: '60粒' },
    ]).expect(204);
    const calm = await item(agent, 'Calm', { sku: 'CALM' }, 'For the day');
    await keepNames(agent, calm.productId, [
      { locale: 'zh-Hans', name: '安神', description: '白天用' },
    ]).expect(204);

    const shown = await preview(agent, 'zh-Hans');
    const choices = choicesOf(shown.differing).map((choice) => ({
      ...choice,
      keep: choice.id === calm.productId ? 'own' : 'kept',
    }));
    const res = await choose(agent, 'zh-Hans', choices).expect(200);
    expect(body(res)).toEqual({
      copiesRemoved: 0,
      namesRemoved: 1,
      renamed: 2,
    });

    // The kept name is the own one now, its pinyin and description with it.
    const [renamed] = await db
      .select({
        name: products.name,
        namePinyin: products.namePinyin,
        description: products.description,
      })
      .from(products)
      .where(eq(products.id, focus.productId));
    expect(renamed).toEqual({
      name: '专注胶囊',
      namePinyin: 'zhuanzhujiaonang zzjn',
      description: '每瓶六十粒',
    });
    const [variant] = await db
      .select({ name: productVariants.name })
      .from(productVariants)
      .where(eq(productVariants.id, focus.variantId));
    expect(variant.name).toBe('60粒');
    // The own name kept, the kept one gone.
    const [kept] = await db
      .select({ name: products.name, description: products.description })
      .from(products)
      .where(eq(products.id, calm.productId));
    expect(kept).toEqual({ name: 'Calm', description: 'For the day' });
    expect(await keptIn(alpha.organizationId, 'zh-Hans')).toEqual([]);

    const history = await db
      .select({
        action: auditLog.action,
        resourceId: auditLog.resourceId,
        resourceLabel: auditLog.resourceLabel,
        payload: auditLog.payload,
      })
      .from(auditLog)
      .where(eq(auditLog.resourceId, focus.productId));
    expect(history).toEqual(
      expect.arrayContaining([
        {
          action: 'product.updated',
          resourceId: focus.productId,
          resourceLabel: '专注胶囊',
          payload: {
            name: { from: 'Focus capsules', to: '专注胶囊' },
            productNameLanguage: 'zh-Hans',
          },
        },
        {
          action: 'product.variant_updated',
          resourceId: focus.productId,
          resourceLabel: '专注胶囊',
          payload: {
            sku: 'FOC-60',
            name: { from: '60ct', to: '60粒' },
            productNameLanguage: 'zh-Hans',
          },
        },
      ]),
    );

    // As History reads it to a person.
    const { entries } = body<{
      entries: {
        actionName: string;
        details: { field: string; value: { text: string } | null }[];
      }[];
    }>(await agent.get(`/v1/audit?resourceId=${focus.productId}`).expect(200));
    expect(
      entries.flatMap((entry) =>
        entry.details.map((detail) => `${detail.field} ${detail.value?.text}`),
      ),
    ).toEqual(
      expect.arrayContaining([
        'Name 专注胶囊',
        'Items named in Simplified Chinese',
      ]),
    );
  });

  it('refuses while a row has no choice, saving nothing', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const calm = await item(agent, 'Calm', { sku: 'CALM' });
    await keepNames(agent, calm.productId, [
      { locale: 'zh-Hans', name: '安神' },
    ]).expect(204);

    const shown = await preview(agent, 'zh-Hans');
    const res = await choose(
      agent,
      'zh-Hans',
      choicesOf(shown.differing),
    ).expect(409);
    expect(body<{ message: string }>(res).message).toBe(
      '1 name has no choice yet. Choose the own name or the Chinese name on each row, then save.',
    );

    expect(await languageOf(alpha.organizationId)).toBe('en');
    expect(await keptIn(alpha.organizationId, 'zh-Hans')).toEqual(['安神']);
  });

  it('refuses with product_names_changed when the list changed since it was shown, saving nothing', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const calm = await item(agent, 'Calm', { sku: 'CALM' });
    await keepNames(agent, calm.productId, [
      { locale: 'zh-Hans', name: '安神' },
    ]).expect(204);
    const shown = await preview(agent, 'zh-Hans');
    const chosen = choicesOf(shown.differing, 'own');

    const refused = async () => {
      const res = await choose(agent, 'zh-Hans', chosen).expect(409);
      expect(body<{ code: string }>(res).code).toBe('product_names_changed');
      expect(await languageOf(alpha.organizationId)).toBe('en');
    };

    // Changed: its kept name.
    await keepNames(agent, calm.productId, [
      { locale: 'zh-Hans', name: '安神胶囊' },
    ]).expect(204);
    await refused();

    // Added: another row that differs.
    await keepNames(agent, calm.productId, [
      { locale: 'zh-Hans', name: '安神' },
    ]).expect(204);
    const sleep = await item(agent, 'Sleep', { sku: 'SLEEP' });
    await keepNames(agent, sleep.productId, [
      { locale: 'zh-Hans', name: '睡眠' },
    ]).expect(204);
    await refused();

    // Gone: the row chosen no longer differs.
    await keepNames(agent, sleep.productId, []).expect(204);
    await keepNames(agent, calm.productId, []).expect(204);
    await refused();

    expect(await keptIn(alpha.organizationId, 'zh-Hans')).toEqual([]);
    await choose(agent, 'zh-Hans', []).expect(200);
  });

  it('refuses more than 500 names to choose, naming how many', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await db.execute(sql`
      with made as (
        insert into products (organization_id, type, name)
        select ${alpha.organizationId}::uuid, 'good', 'Item ' || n
        from generate_series(1, 501) n
        returning id, name
      )
      insert into product_translations
        (organization_id, product_id, locale, name)
      select ${alpha.organizationId}::uuid, id, 'zh-Hans', name || ' 中文'
      from made
    `);

    const shown = await preview(alpha.agent, 'zh-Hans');
    expect(shown.total).toBe(501);
    expect(shown.differing).toHaveLength(500);

    const res = await choose(
      alpha.agent,
      'zh-Hans',
      choicesOf(shown.differing, 'own'),
    ).expect(409);
    expect(body<{ message: string }>(res).message).toBe(
      '501 names kept in Chinese differ from their own, and at most 500 can be chosen at once. Change some in Edit names first, then choose again.',
    );
    expect(await languageOf(alpha.organizationId)).toBe('en');
  });

  it('changes from one language to another, the own names then counting as the new one’s', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const focus = await item(agent, 'Focus', { sku: 'FOC' });

    // Named in English, as it registered: an English name is refused, a
    // Chinese one kept.
    await keepNames(agent, focus.productId, [
      { locale: 'en', name: 'Focus capsules' },
    ]).expect(409);
    await keepNames(agent, focus.productId, [
      { locale: 'zh-Hans', name: '专注' },
    ]).expect(204);

    const toChinese = await preview(agent, 'zh-Hans');
    expect(toChinese.items).toBe(1);
    await choose(
      agent,
      'zh-Hans',
      choicesOf(toChinese.differing, 'own'),
    ).expect(200);

    // Now the other way round.
    await keepNames(agent, focus.productId, [
      { locale: 'zh-Hans', name: '专注胶囊' },
    ]).expect(409);
    await keepNames(agent, focus.productId, [
      { locale: 'en', name: 'Focus capsules' },
    ]).expect(204);

    const toEnglish = await preview(agent, 'en');
    expect(toEnglish.differing.map((row) => row.keptName)).toEqual([
      'Focus capsules',
    ]);
    await choose(agent, 'en', choicesOf(toEnglish.differing, 'kept')).expect(
      200,
    );

    expect(await languageOf(alpha.organizationId)).toBe('en');
    const [renamed] = await db
      .select({ name: products.name })
      .from(products)
      .where(eq(products.id, focus.productId));
    expect(renamed.name).toBe('Focus capsules');
    const entries = await db
      .select({ payload: auditLog.payload })
      .from(auditLog)
      .where(eq(auditLog.action, 'organization.updated'));
    expect(entries.map((entry) => entry.payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productNameLanguage: { from: 'en', to: 'zh-Hans' },
        }),
        expect.objectContaining({
          productNameLanguage: { from: 'zh-Hans', to: 'en' },
        }),
      ]),
    );
  });

  it('refuses a Viewer the preview and the choice', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');

    await viewer.get(`${ROUTE}?language=zh-Hans`).expect(403);
    await viewer
      .put(ROUTE)
      .send({ language: 'zh-Hans', choices: [] })
      .expect(403);
    expect(await languageOf(alpha.organizationId)).toBe('en');
  });

  it('never counts or touches another organization’s names', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const beta = await registerOrganization(app, 'beta');
    const own = await item(alpha.agent, 'Calm', { sku: 'CALM' });
    await keepNames(alpha.agent, own.productId, [
      { locale: 'zh-Hans', name: 'Calm' },
    ]).expect(204);
    const theirs = await item(beta.agent, 'Calm', {
      sku: 'CALM',
      name: '60ct',
    });
    await keepNames(beta.agent, theirs.productId, [
      { locale: 'zh-Hans', name: 'Calm' },
    ]).expect(204);
    await keepVariantNames(beta.agent, theirs, [
      { locale: 'zh-Hans', name: '60粒' },
    ]).expect(204);

    const shown = await preview(alpha.agent, 'zh-Hans');
    expect(shown).toMatchObject({
      items: 1,
      variants: 0,
      copies: 1,
      total: 0,
    });
    await choose(alpha.agent, 'zh-Hans', []).expect(200);

    expect(await keptIn(beta.organizationId, 'zh-Hans')).toEqual([
      '60粒',
      'Calm',
    ]);
    expect(await languageOf(beta.organizationId)).toBe('en');
  });

  it('refuses a name kept in the items’ own language, for an item and a variant', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const focus = await item(agent, 'Focus', { sku: 'FOC-60', name: '60ct' });

    const res = await keepNames(agent, focus.productId, [
      { locale: 'zh-Hans', name: '专注' },
      { locale: 'en', name: 'Focus capsules' },
    ]).expect(409);
    expect(body<{ message: string }>(res).message).toBe(
      'Items are named in English, so an item’s own name is its English name. Change it with Edit.',
    );
    const inChinese = await keepVariantNames(agent, focus, [
      { locale: 'en', name: '60 capsules' },
    ])
      .set('Accept-Language', 'zh-Hans')
      .expect(409);
    expect(body<{ message: string }>(inChinese).message).toBe(
      '物品以英文命名，因此物品本身的名称就是它的英文名称。请通过“编辑”修改。',
    );

    // Nothing written, and another language kept as before.
    expect(await keptIn(alpha.organizationId, 'zh-Hans')).toEqual([]);
    await keepNames(agent, focus.productId, [
      { locale: 'zh-Hans', name: '专注' },
    ]).expect(204);
  });

  /** Until this many connections are waiting on a lock, for up to 5s. */
  async function waitingOnLocks(count: number): Promise<void> {
    const until = Date.now() + 5000;
    for (;;) {
      const { rows } = await db.execute<{ waiting: number }>(sql`
        select count(*)::int as waiting from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'
      `);
      if (rows[0].waiting >= count) return;
      if (Date.now() > until) {
        throw new Error(`${rows[0].waiting} of ${count} waiting on a lock`);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  /**
   * A names save during the choice would keep a name in the language being
   * chosen, unless it waits for it on the organization's row. The test holds
   * that row until the choice and then the save are both waiting on it, so
   * they overlap every time rather than by luck: the choice first, the save
   * after it.
   */
  it('makes a names save wait for the choice under way, then refuses it in that language', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const focus = await item(agent, 'Focus', { sku: 'FOC' });
    await agent.get('/v1/auth/me').expect(200);

    let choosing!: Promise<{ status: number }>;
    let saving!: Promise<{ status: number }>;
    await db.transaction(async (tx) => {
      await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, alpha.organizationId))
        .for('update');
      choosing = choose(agent, 'zh-Hans', []).then((res) => res);
      await waitingOnLocks(1);
      saving = keepNames(agent, focus.productId, [
        { locale: 'zh-Hans', name: '专注' },
      ]).then((res) => res);
      await waitingOnLocks(2);
    });

    expect((await choosing).status).toBe(200);
    expect((await saving).status).toBe(409);
    expect(await languageOf(alpha.organizationId)).toBe('zh-Hans');
    expect(await keptIn(alpha.organizationId, 'zh-Hans')).toEqual([]);
  });
});
