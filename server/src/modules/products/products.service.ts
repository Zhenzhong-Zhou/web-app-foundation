import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';

import { EXPORT_LIMIT } from '../../common/export';
import type { Locale } from '../../common/locales';
import { namePinyin, pinyinOf } from '../../common/pinyin';
import { searchTerms } from '../../common/search';
import { recordContext, recordPrevious } from '../../core/audit/audit-context';
import { todayOf } from '../../core/organizations/time-zone';
import type { Transaction } from '../../database/database.module';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../database/errors';
import {
  productCategories,
  products,
  productTranslations,
  type ProductType,
  productVariants,
  variantTranslations,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { namesIn, productNameOrder } from '../stock/item-name';
import {
  itemStock,
  type ItemStockStatus,
  itemStockStatus,
} from '../stock/item-stock';
import {
  assertCategoryIn,
  categoryPaths,
  UNKNOWN_CATEGORY,
} from './category-tree';
import type { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import type { ExportProductsDto } from './dto/export-products.dto';
import type { ListProductsDto } from './dto/list-products.dto';
import type {
  ProductDetail,
  ProductPage,
  ProductSummary,
  Variant,
  VariantOption,
} from './dto/product-response.dto';
import type {
  SetProductTranslationsDto,
  SetVariantTranslationsDto,
} from './dto/set-translations.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import {
  afterKeys,
  countsOf,
  cursorOf,
  itemOrder,
  matchedBy,
  orderOf,
  readCursor,
  shownOf,
} from './item-list';
import { foundBy, itemMatches, itemRank } from './item-search';
import { coverOf, imagesOf, publicImages } from './product-images';

/**
 * A set of names in other languages as one line for the audit log:
 * "zh-Hans 专注胶囊 · fr-CA Capsules Focus", or "none" once cleared.
 */
function describeNames(translations: { locale: string; name: string }[]) {
  return translations.length > 0
    ? translations
        .map((translation) => `${translation.locale} ${translation.name}`)
        .join(' · ')
    : 'none';
}

/**
 * Its category's key, refused when the category went between the check and
 * the write: deleted by someone else in that moment (ADR-092).
 */
const CATEGORY_KEY = 'products_category_id_product_categories_id_fk';

/** Items' list a page at a time unless asked for fewer (ADR-092). */
const ITEMS_PAGE_SIZE = 50;

/** A place on Items' list: the row, and its order's parts as text. */
type PlaceRow = {
  id: string;
  keys: string[];
};

/** An item's variants and stock on hand, as itemStock gives them. */
type StockRow = {
  product_id: string;
  variants: number;
  unit: string | null;
  on_hand: string | null;
};

/** An item that is low or out, as itemStockStatus gives it. */
type StatusRow = {
  product_id: string;
  status: ItemStockStatus;
};

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * A variant is visible only when both it and its product are active. Never
   * cascade the product's flag onto variants: deactivating would write false
   * to every one, and reactivating could not know which had been individually
   * discontinued first — that information is destroyed by the write.
   *
   * The cost is two booleans in a WHERE on a join already being made.
   *
   * With a search, the pickers' (ADR-056): only the items it finds, the
   * closest first, then by the name shown; without one, by SKU.
   */
  listActiveVariants(
    locale: Locale,
    search?: string,
  ): Promise<VariantOption[]> {
    return this.tenantDb.transaction((tx, organizationId) => {
      // In the reader's language (ADR-056).
      const shown = namesIn(locale, organizationId);
      const terms = search ? searchTerms(search) : null;

      return tx
        .select({
          id: productVariants.id,
          sku: productVariants.sku,
          variantName: shown.variantName,
          productName: shown.productName,
          type: products.type,
          unitOfMeasure: productVariants.unitOfMeasure,
          tracksLots: productVariants.tracksLots,
        })
        .from(productVariants)
        .innerJoin(
          products,
          and(
            eq(products.id, productVariants.productId),
            eq(products.organizationId, organizationId),
          ),
        )
        .where(
          and(
            eq(productVariants.organizationId, organizationId),
            eq(products.isActive, true),
            eq(productVariants.isActive, true),
            terms ? itemMatches(terms, organizationId) : undefined,
          ),
        )
        .orderBy(
          ...(terms
            ? [
                itemRank(terms, locale, organizationId),
                productNameOrder(locale, organizationId),
              ]
            : []),
          asc(productVariants.sku),
        );
    });
  }

  /**
   * Items' list (ADR-092): a page of fifty unless asked, narrowed by its
   * type, its category with every category under it, or Uncategorised, and
   * its search, discontinued items hidden unless asked; sorted by item-list's
   * key, the cursor after the last row's. Each row named for the reader,
   * with its first code, its category's path, and its stock on hand and
   * status read for the page's items alone; the counts with the first page.
   *
   * With a search, only the items it finds through any of their variants,
   * as an item is found everywhere (item-search), each ranked by its
   * closest variant before the sort, as the lookup ranks (ADR-056, amended).
   */
  list(query: ListProductsDto, locale: Locale): Promise<ProductPage> {
    const limit = query.limit ?? ITEMS_PAGE_SIZE;
    const terms = query.search ? searchTerms(query.search) : null;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const { parts, order, joins } = itemOrder(
        query,
        locale,
        organizationId,
        terms,
      );
      const matched = matchedBy(query, terms, organizationId);
      const after = query.cursor
        ? afterKeys(parts, readCursor(query.cursor, order, parts))
        : undefined;

      // The page's places, by the order's parts; each row's parts as text
      // for the cursor, worked out after the LIMIT for the page alone.
      const { rows: places } = await tx.execute<PlaceRow>(sql`
        select ${products.id} as id,
          array[${sql.join(
            parts.map((part) => sql`(${part.value})::text`),
            sql`, `,
          )}] as keys
        from ${products}
        ${joins}
        where ${and(
          eq(products.organizationId, organizationId),
          matched,
          shownOf(query),
          after,
        )}
        order by ${sql.join(orderOf(parts), sql`, `)}
        limit ${limit + 1}
      `);

      const page = places.slice(0, limit);
      const last = page.at(-1);
      return {
        entries: await this.rowsOf(
          tx,
          organizationId,
          locale,
          page.map((place) => place.id),
        ),
        nextCursor:
          places.length > limit && last ? cursorOf(order, last.keys) : null,
        counts: query.cursor
          ? null
          : await countsOf(tx, organizationId, query, matched),
      };
    });
  }

  /**
   * The rows for the page's items, in the page's order: each named for
   * the reader, its first code, its category's path, and its variants'
   * stock on hand and status, read for these items alone.
   */
  private async rowsOf(
    tx: Transaction,
    organizationId: string,
    locale: Locale,
    ids: string[],
  ): Promise<ProductSummary[]> {
    if (ids.length === 0) return [];

    const org = sql`${organizationId}::uuid`;
    const items = sql`(${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`;

    const details = await tx
      .select({
        id: products.id,
        type: products.type,
        displayName: namesIn(locale, organizationId).productName,
        // Its codes in their order, a number by its value: FOC-30 before
        // FOC-120.
        sku: sql<string>`(
          select pv.sku from product_variants pv
          where pv.organization_id = ${org}
            and pv.product_id = products.id
          order by pv.sku collate numeric_order, pv.id
          limit 1
        )`,
        categoryId: products.categoryId,
        path: sql<string[] | null>`(
          select cp.names from ${categoryPaths(organizationId)} cp
          where cp.id = products.category_id
        )`,
        coverFileId: coverOf(),
        isActive: products.isActive,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .where(
        and(
          eq(products.organizationId, organizationId),
          inArray(products.id, ids),
        ),
      );

    const { rows: stock } = await tx.execute<StockRow>(sql`
      select s.product_id, s.variants, s.unit, s.on_hand
      from ${itemStock(organizationId, items)} s
    `);
    const today = await todayOf(tx, organizationId);
    const { rows: statuses } = await tx.execute<StatusRow>(sql`
      select s.product_id, s.status
      from ${itemStockStatus(organizationId, today, items)} s
    `);

    const byId = new Map(details.map((row) => [row.id, row]));
    const stockOf = new Map(stock.map((row) => [row.product_id, row]));
    const statusOf = new Map(
      statuses.map((row) => [row.product_id, row.status]),
    );

    return ids.map((id) => {
      const row = byId.get(id)!;
      const held = stockOf.get(id)!;
      return {
        id,
        type: row.type as ProductType,
        displayName: row.displayName,
        sku: row.sku,
        variantCount: held.variants,
        category:
          row.categoryId && row.path
            ? { id: row.categoryId, path: row.path }
            : null,
        coverFileId: row.coverFileId,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        onHand: held.on_hand,
        unitOfMeasure: held.unit,
        stockStatus: statusOf.get(id) ?? null,
      };
    });
  }

  /**
   * The catalogue as a spreadsheet (ADR-057): a row per variant, with its
   * product, and the product's name in each language it has. The products
   * its list shows: those its search finds, and only the discontinued ones
   * when asked, each with every variant. One query, at most EXPORT_LIMIT +
   * 1 rows, for withinLimit to judge.
   */
  exportRows(query: ExportProductsDto = {}) {
    const terms = query.search ? searchTerms(query.search) : null;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const translated = (locale: string) => sql<string | null>`(
        select ${productTranslations.name} from ${productTranslations}
        where ${productTranslations.productId} = ${products.id}
          and ${productTranslations.locale} = ${locale}
      )`;

      return tx
        .select({
          id: productVariants.id,
          sku: productVariants.sku,
          productName: products.name,
          variantName: productVariants.name,
          type: products.type,
          unitOfMeasure: productVariants.unitOfMeasure,
          tracksLots: productVariants.tracksLots,
          discontinued: sql<boolean>`not (${products.isActive} and ${productVariants.isActive})`,
          nameFrench: translated('fr-CA'),
          nameChinese: translated('zh-Hans'),
        })
        .from(productVariants)
        .innerJoin(
          products,
          and(
            eq(products.id, productVariants.productId),
            eq(products.organizationId, organizationId),
          ),
        )
        .where(
          and(
            eq(productVariants.organizationId, organizationId),
            terms ? foundBy(terms, organizationId) : undefined,
            query.discontinued === 'true'
              ? eq(products.isActive, false)
              : undefined,
          ),
        )
        .orderBy(asc(products.name), asc(productVariants.sku))
        .limit(EXPORT_LIMIT + 1);
    });
  }

  /**
   * `name` is the base name, which the edit forms fill from and send back;
   * `displayName` is the one the reader sees, the product's and each
   * variant's (ADR-056).
   */
  async findById(productId: string, locale: Locale): Promise<ProductDetail> {
    const [product] = await this.tenantDb.select(
      products,
      eq(products.id, productId),
    );

    if (!product)
      throw new NotFoundException(
        t({ id: 'products.suchProduct', defaultMessage: 'No such product' }),
      );

    // Its variants with the names shown, and its gallery, the cover first
    // (ADR-062).
    const { variants, images } = await this.tenantDb.transaction(
      async (tx, organizationId) => {
        const shown = namesIn(locale, organizationId);

        return {
          variants: await tx
            .select({
              variant: productVariants,
              productName: shown.productName,
              variantName: shown.variantName,
            })
            .from(productVariants)
            .innerJoin(
              products,
              and(
                eq(products.id, productVariants.productId),
                eq(products.organizationId, organizationId),
              ),
            )
            .where(
              and(
                eq(productVariants.organizationId, organizationId),
                eq(productVariants.productId, productId),
              ),
            )
            .orderBy(asc(productVariants.id)),
          images: await imagesOf(tx, organizationId, productId),
        };
      },
    );

    // Its names in other languages, and each variant's (ADR-054).
    const [translations, variantNames] = await Promise.all([
      this.tenantDb.select(
        productTranslations,
        eq(productTranslations.productId, productId),
        { orderBy: asc(productTranslations.locale) },
      ),
      this.tenantDb.select(
        variantTranslations,
        inArray(
          variantTranslations.variantId,
          variants.map(({ variant }) => variant.id),
        ),
        { orderBy: asc(variantTranslations.locale) },
      ),
    ]);

    return {
      id: product.id,
      type: product.type,
      name: product.name,
      // Every product has a variant (ADR-023), and each row names it alike.
      displayName: variants[0].productName,
      description: product.description,
      isActive: product.isActive,
      categoryId: product.categoryId,
      images: publicImages(images),
      translations: translations.map(({ locale, name, description }) => ({
        locale,
        name,
        description,
      })),
      variants: variants.map(({ variant, variantName }) => ({
        ...variantOf(variant),
        displayName: variantName,
        translations: variantNames
          .filter((row) => row.variantId === variant.id)
          .map(({ locale, name }) => ({ locale, name })),
      })),
    };
  }

  /**
   * Creates the product and its first variant together. ADR-023 requires every
   * product to have at least one, and a transaction is what makes that an
   * invariant rather than a convention — a failure after the product insert
   * would otherwise leave a row nothing can be counted against.
   */
  async create(input: CreateProductDto) {
    try {
      return await this.tenantDb.transaction(async (tx, organizationId) => {
        if (input.categoryId) {
          await assertCategoryIn(
            tx,
            organizationId,
            input.categoryId,
            UNKNOWN_CATEGORY,
          );
        }

        const [product] = await tx
          .insert(products)
          .values({
            organizationId,
            type: input.type,
            name: input.name,
            namePinyin: namePinyin(input.name),
            description: input.description,
            categoryId: input.categoryId ?? null,
          })
          .returning();

        const [variant] = await tx
          .insert(productVariants)
          .values({
            // Denormalised, and set from tenant context rather than from the
            // product row: the two must agree, and this is the only writer.
            organizationId,
            productId: product.id,
            ...input.variant,
            namePinyin: namePinyin(input.variant.name),
          })
          .returning();

        this.logger.log(
          `Product ${product.id} created with variant ${variant.sku}`,
        );
        return { ...product, variants: [variant] };
      });
    } catch (error) {
      if (isForeignKeyViolation(error, CATEGORY_KEY)) {
        throw new BadRequestException(UNKNOWN_CATEGORY);
      }
      if (isUniqueViolation(error)) {
        // The only unique constraint on either table. Naming the SKU tells the
        // caller whether they meant the existing item or have a collision in
        // their own numbering — "already exists" makes them go hunting.
        throw new ConflictException(
          t(
            {
              id: 'products.skuSkuUse',
              defaultMessage: 'SKU {sku} is already in use',
            },
            { sku: input.variant.sku },
          ),
        );
      }
      throw error;
    }
  }

  async update(productId: string, input: UpdateProductDto) {
    const [existing] = await this.tenantDb.select(
      products,
      eq(products.id, productId),
    );

    if (!existing)
      throw new NotFoundException(
        t({ id: 'products.suchProduct', defaultMessage: 'No such product' }),
      );

    if (
      input.categoryId !== undefined &&
      input.categoryId !== existing.categoryId
    ) {
      if (input.categoryId) {
        const [category] = await this.tenantDb.select(
          productCategories,
          eq(productCategories.id, input.categoryId),
        );
        if (!category) throw new BadRequestException(UNKNOWN_CATEGORY);
      }
      // From and to, by name (ADR-076). Only when it moves: a previous
      // equal to the new would mark the whole save unchanged, a rename
      // sent beside it included, and write no entry.
      recordPrevious({ categoryId: existing.categoryId });
    }

    try {
      await this.tenantDb.update(
        products,
        { ...input, ...pinyinOf(input.name) },
        eq(products.id, productId),
      );
    } catch (error) {
      if (isForeignKeyViolation(error, CATEGORY_KEY)) {
        throw new BadRequestException(UNKNOWN_CATEGORY);
      }
      throw error;
    }

    this.logger.log(`Product ${productId} updated`);
  }

  /**
   * Adds a variant to an existing product. The ordinary case ADR-023 exists
   * for: a supplement sold in 60ct gains a 120ct, and both are the same
   * product with different physical facts.
   */
  async addVariant(productId: string, input: CreateVariantDto) {
    // Scoped, so a product in another organization is simply not found.
    const [product] = await this.tenantDb.select(
      products,
      eq(products.id, productId),
    );

    if (!product)
      throw new NotFoundException(
        t({ id: 'products.suchProduct', defaultMessage: 'No such product' }),
      );

    try {
      // organizationId comes from tenant context inside insert() — its
      // parameter type omits the column for exactly that reason.
      const [variant] = await this.tenantDb
        .insert(productVariants, {
          productId,
          ...input,
          namePinyin: namePinyin(input.name),
        })
        .returning();

      this.logger.log(`Variant ${variant.sku} added to product ${productId}`);
      return variant;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          t(
            {
              id: 'products.skuSkuUse',
              defaultMessage: 'SKU {sku} is already in use',
            },
            { sku: input.sku },
          ),
        );
      }
      throw error;
    }
  }

  /**
   * Renaming a SKU is allowed and audited. The audit row names who and when,
   * not what from — ADR-018 keeps payloads out — which is acceptable while
   * renames are rare and is recorded as a limitation in ADR-023.
   */
  async updateVariant(
    productId: string,
    variantId: string,
    input: UpdateVariantDto,
  ) {
    // Both ids checked, and the variant must belong to this product: without
    // the second condition a caller could edit any variant in their
    // organization through any product's URL.
    const [variant] = await this.tenantDb.select(
      productVariants,
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.productId, productId),
      ),
    );

    if (!variant)
      throw new NotFoundException(
        t({ id: 'products.suchVariant', defaultMessage: 'No such variant' }),
      );

    try {
      await this.tenantDb.update(
        productVariants,
        { ...input, ...pinyinOf(input.name) },
        eq(productVariants.id, variantId),
      );

      recordPrevious({ sku: variant.sku });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          t(
            {
              id: 'products.skuSkuUse',
              defaultMessage: 'SKU {sku} is already in use',
            },
            { sku: input.sku },
          ),
        );
      }
      throw error;
    }

    this.logger.log(`Variant ${variantId} updated`);
  }

  /**
   * Replaces a product's names in other languages with the set sent
   * (ADR-054): a language sent is written, one left out is removed. Upserted
   * rather than deleted and reinserted, so an unchanged name keeps its row
   * and its updated_at.
   */
  async setTranslations(productId: string, input: SetProductTranslationsDto) {
    await this.tenantDb.transaction(async (tx, organizationId) => {
      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.organizationId, organizationId),
            eq(products.id, productId),
          ),
        );

      if (!product)
        throw new NotFoundException(
          t({ id: 'products.suchProduct', defaultMessage: 'No such product' }),
        );

      recordContext({ names: describeNames(input.translations) });

      const kept = input.translations.map((translation) => translation.locale);

      await tx
        .delete(productTranslations)
        .where(
          and(
            eq(productTranslations.organizationId, organizationId),
            eq(productTranslations.productId, productId),
            kept.length > 0
              ? notInArray(productTranslations.locale, kept)
              : undefined,
          ),
        );

      if (input.translations.length === 0) return;

      await tx
        .insert(productTranslations)
        .values(
          input.translations.map((translation) => ({
            organizationId,
            productId,
            locale: translation.locale,
            name: translation.name,
            namePinyin: namePinyin(translation.name),
            // Empty means none, which the column holds as null.
            description: translation.description || null,
          })),
        )
        .onConflictDoUpdate({
          target: [productTranslations.productId, productTranslations.locale],
          set: {
            name: sql`excluded.name`,
            namePinyin: sql`excluded.name_pinyin`,
            description: sql`excluded.description`,
          },
          // Plain SQL, so the table each column belongs to is written here.
          setWhere: sql`(product_translations.name, product_translations.description)
            is distinct from (excluded.name, excluded.description)`,
        });
    });

    this.logger.log(`Product ${productId} translations set`);
  }

  /** A variant's names in other languages, as setTranslations. */
  async setVariantTranslations(
    productId: string,
    variantId: string,
    input: SetVariantTranslationsDto,
  ) {
    await this.tenantDb.transaction(async (tx, organizationId) => {
      // The variant must belong to this product, as updateVariant requires.
      const [variant] = await tx
        .select({ id: productVariants.id, sku: productVariants.sku })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.organizationId, organizationId),
            eq(productVariants.id, variantId),
            eq(productVariants.productId, productId),
          ),
        );

      if (!variant)
        throw new NotFoundException(
          t({ id: 'products.suchVariant', defaultMessage: 'No such variant' }),
        );

      recordContext({
        sku: variant.sku,
        names: describeNames(input.translations),
      });

      const kept = input.translations.map((translation) => translation.locale);

      await tx
        .delete(variantTranslations)
        .where(
          and(
            eq(variantTranslations.organizationId, organizationId),
            eq(variantTranslations.variantId, variantId),
            kept.length > 0
              ? notInArray(variantTranslations.locale, kept)
              : undefined,
          ),
        );

      if (input.translations.length === 0) return;

      await tx
        .insert(variantTranslations)
        .values(
          input.translations.map((translation) => ({
            organizationId,
            variantId,
            locale: translation.locale,
            name: translation.name,
            namePinyin: namePinyin(translation.name),
          })),
        )
        .onConflictDoUpdate({
          target: [variantTranslations.variantId, variantTranslations.locale],
          set: {
            name: sql`excluded.name`,
            namePinyin: sql`excluded.name_pinyin`,
          },
          setWhere: sql`variant_translations.name is distinct from excluded.name`,
        });
    });

    this.logger.log(`Variant ${variantId} translations set`);
  }
}

/**
 * A variant as the API returns it (ADR-068): not the organization or the
 * product it belongs to, the pinyin kept for search, or the case
 * dimensions no screen reads yet.
 */
function variantOf(
  row: Omit<Variant, 'displayName'>,
): Omit<Variant, 'displayName'> {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    unitOfMeasure: row.unitOfMeasure,
    isActive: row.isActive,
    tracksLots: row.tracksLots,
    weightGrams: row.weightGrams,
    lengthMm: row.lengthMm,
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    caseQuantity: row.caseQuantity,
  };
}
