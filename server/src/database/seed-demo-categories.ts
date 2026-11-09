import type { INestApplicationContext } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { Locale } from '../common/locales';
import { AUDIT_ACTIONS } from '../core/audit/audit-actions';
import { ProductCategoriesService } from '../modules/products/product-categories.service';
import { ProductsService } from '../modules/products/products.service';
import type { Database } from './database.module';
import { PRODUCT_TYPES, productVariants } from './schema';
import type { Audited } from './seed-demo-audit';
import type { Team } from './seed-demo-team';
import { runInTenantContext } from './tenant-context';

/**
 * One category of the demo's tree and the items in it, named in each of the
 * organization's languages and picked by the one it writes its documents
 * in (ADR-092: a category has one name, so a French organization's tree is
 * French and nobody has to rename it to read the demo). Items are named by
 * code; a category with children usually holds none itself.
 */
interface DemoCategory {
  names: Record<Locale, string>;
  codes?: string[];
  children?: DemoCategory[];
}

/**
 * Two levels deep, by what the company makes and sells rather than by
 * type, so one tree serves every tab: a vitamin and the capsule filler sit
 * in different branches. The last branch holds its items directly, as a
 * small company's categories often do.
 *
 * Left out on purpose, so Uncategorised has an item on four tabs: the
 * Focus blend, the 60ct bottle, the trade-show sample bag and the new
 * sample sachet.
 */
const TREE: DemoCategory[] = [
  {
    names: {
      en: 'Vitamins and minerals',
      'fr-CA': 'Vitamines et minéraux',
      'zh-Hans': '维生素和矿物质',
    },
    children: [
      {
        names: { en: 'Vitamins', 'fr-CA': 'Vitamines', 'zh-Hans': '维生素' },
        codes: ['D3-1000-120', 'VITC-100'],
      },
      {
        names: { en: 'Minerals', 'fr-CA': 'Minéraux', 'zh-Hans': '矿物质' },
        codes: ['MAGCAP-60', 'ZINC-60', 'MAG-GLY'],
      },
    ],
  },
  {
    names: {
      en: 'Mind and sleep',
      'fr-CA': 'Esprit et sommeil',
      'zh-Hans': '专注与睡眠',
    },
    children: [
      {
        names: { en: 'Focus', 'fr-CA': 'Concentration', 'zh-Hans': '专注' },
        codes: ['FOCUS-60CT'],
      },
      {
        names: { en: 'Calm', 'fr-CA': 'Calme', 'zh-Hans': '舒缓' },
        codes: ['CALM-90CT', 'ASH-EXT-5', 'THEANINE'],
      },
      {
        names: { en: 'Sleep', 'fr-CA': 'Sommeil', 'zh-Hans': '助眠' },
        codes: ['SLEEP-60CT', 'SLEEP-BLEND', 'CHAMOMILE-EXT', 'MELATONIN'],
      },
    ],
  },
  {
    names: {
      en: 'Immunity and digestion',
      'fr-CA': 'Immunité et digestion',
      'zh-Hans': '免疫与消化',
    },
    children: [
      {
        names: {
          en: 'Immune support',
          'fr-CA': 'Soutien immunitaire',
          'zh-Hans': '免疫支持',
        },
        codes: ['ELDER-250'],
      },
      {
        names: {
          en: 'Digestion and heart',
          'fr-CA': 'Digestion et cœur',
          'zh-Hans': '消化与心脏',
        },
        codes: ['PROBIO-30', 'OMEGA3-90'],
      },
    ],
  },
  {
    names: {
      en: 'Bottling and shipping',
      'fr-CA': 'Embouteillage et expédition',
      'zh-Hans': '灌装与运输',
    },
    children: [
      {
        names: { en: 'Bottles', 'fr-CA': 'Flacons', 'zh-Hans': '瓶子' },
        codes: ['BOTTLE-90', 'BOTTLE-A60'],
      },
      {
        names: { en: 'Cartons', 'fr-CA': 'Cartons', 'zh-Hans': '纸箱' },
        codes: ['CARTON-24'],
      },
    ],
  },
  {
    names: {
      en: 'Plant and cleaning',
      'fr-CA': 'Usine et entretien',
      'zh-Hans': '车间与清洁',
    },
    codes: ['EQ-CAPFILL-01', 'GLOVES-100'],
  },
];

/** The sachet the Samples tab shows: a sample, not yet made, so no stock. */
const SAMPLE_CODE = 'CALM-SAMPLE';

/**
 * Items' categories (ADR-092) and the one type the demo lacked: Daniel,
 * who adds what the company buys, builds the tree and puts the items in
 * it, each write in History as his route would leave it. Last of all, on
 * items that exist already, so no figure the manual checks name moves: a
 * category changes no stock, and the sachet holds none.
 *
 * Read back as Items' list counts them, so a change upstream that loses a
 * type, a category or the demo's Low and Out products fails the seed, and
 * CI with it.
 */
export async function addCategories(
  app: INestApplicationContext,
  db: Database,
  audited: Audited,
  owner: { userId: string; organizationId: string },
  team: Team,
  language: Locale,
): Promise<string> {
  const products = app.get(ProductsService);
  const categories = app.get(ProductCategoriesService);
  const { organizationId } = owner;

  async function productOf(code: string): Promise<string> {
    const [row] = await db
      .select({ id: productVariants.productId })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.organizationId, organizationId),
          eq(productVariants.sku, code),
        ),
      );
    if (!row) throw new Error(`The demo has no item ${code}`);
    return row.id;
  }

  const placed = await runInTenantContext(
    { userId: team.daniel.id, organizationId },
    async () => {
      const actor = team.daniel.id;
      let made = 0;
      let filled = 0;

      async function add(
        category: DemoCategory,
        parentId?: string,
      ): Promise<void> {
        const body = { name: category.names[language], parentId };
        const created = await audited(
          actor,
          {
            action: AUDIT_ACTIONS.PRODUCT_CATEGORY_CREATED,
            type: 'product_category',
            id: (result) => result.id,
            body,
            fields: ['name', 'parentId'],
          },
          () => categories.create(body),
        );
        made++;

        for (const code of category.codes ?? []) {
          const productId = await productOf(code);
          const change = { categoryId: created.id };
          await audited(
            actor,
            {
              action: AUDIT_ACTIONS.PRODUCT_UPDATED,
              type: 'product',
              id: productId,
              body: change,
              fields: ['categoryId', 'type', 'isActive'],
            },
            () => products.update(productId, change),
          );
          filled++;
        }
        for (const child of category.children ?? []) {
          await add(child, created.id);
        }
      }

      for (const category of TREE) await add(category);

      // The Samples tab's one item: a sachet of Calm to hand out, in the
      // three languages like the nine with reorder points.
      const sachet = await audited(
        actor,
        {
          action: AUDIT_ACTIONS.PRODUCT_CREATED,
          type: 'product',
          id: (result) => result.id,
        },
        () =>
          products.create({
            type: 'sample',
            name: 'Calm sample sachet, 5 capsules',
            variant: { sku: SAMPLE_CODE, unitOfMeasure: 'each' },
          }),
      );
      await audited(
        actor,
        {
          action: AUDIT_ACTIONS.PRODUCT_UPDATED,
          type: 'product',
          id: sachet.id,
        },
        () =>
          products.setTranslations(sachet.id, {
            translations: [
              { locale: 'fr-CA', name: 'Sachet d’essai Calme, 5 capsules' },
              { locale: 'zh-Hans', name: '舒缓试用装，5 粒' },
            ],
          }),
      );

      return { made, filled };
    },
  );

  // As the Owner, and as the list counts: every type has an item, some
  // are in no category, and the products include one low and one out
  // (ADR-085), which the nine reorder points leave (seed-demo-team-work.ts).
  const everything = await products.list({ discontinued: 'include' }, 'en');
  const types = everything.counts?.types.map((each) => each.type) ?? [];
  const missing = PRODUCT_TYPES.filter((type) => !types.includes(type));
  if (missing.length > 0) {
    throw new Error(`The demo has no item of type ${missing.join(', ')}`);
  }

  const loose = await products.list(
    { category: 'uncategorised', discontinued: 'include' },
    'en',
  );
  const looseCodes = loose.entries.map((entry) => entry.sku);
  const expected = ['BLEND-FOCUS', 'BOTTLE-60', SAMPLE_CODE, 'MAGCAP-SAMPLE'];
  const lost = expected.filter((code) => !looseCodes.includes(code));
  if (lost.length > 0) {
    throw new Error(
      `Uncategorised should hold ${lost.join(', ')}, and holds ${looseCodes.join(', ')}`,
    );
  }

  const goods = await products.list(
    { type: 'good', discontinued: 'include' },
    'en',
  );
  const statuses = new Set(goods.entries.map((entry) => entry.stockStatus));
  if (!statuses.has('low') || !statuses.has('out')) {
    throw new Error(
      'The demo’s products should include one low and one out, and do not',
    );
  }

  return `Items sorted: ${placed.made} categories, ${placed.filled} items placed in them, Uncategorised ${expected.join(', ')}; ${SAMPLE_CODE} the Samples tab's one item; products read one Low and one Out at least`;
}
