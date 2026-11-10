import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';

import { namePinyin, pinyinOf } from '../../common/pinyin';
import { recordContext, recordPrevious } from '../../core/audit/audit-context';
import type { Transaction } from '../../database/database.module';
import { isUniqueViolation } from '../../database/errors';
import {
  PRODUCT_TYPES,
  productCategories,
  products,
  type ProductType,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { assertCategoryIn, isWithinBranch, lockTree } from './category-tree';
import type {
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
} from './dto/product-category.dto';
import type {
  CategoryItemCount,
  ProductCategory,
  ProductCategoryList,
} from './dto/product-category-response.dto';

const NAME_TAKEN = 'product_categories_org_parent_name_key';

const UNKNOWN_PARENT = t({
  id: 'productCategories.unknownParent',
  defaultMessage:
    'The category to put it under was not found. Choose another, or none.',
});

/**
 * Items' categories (ADR-092): one tree per organization, each category
 * renamed and moved in place, and deleted only once nothing is in it.
 * Whoever may change items manages them; the controller says so.
 */
@Injectable()
export class ProductCategoriesService {
  private readonly logger = new Logger(ProductCategoriesService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * Every category, flat and in name order, each with the items it holds
   * itself by type, and the items in none by type beside them. A name
   * sorts as an item's does: a Chinese one by its pinyin, the others
   * accent-free, and a number inside it by its value.
   */
  list(): Promise<ProductCategoryList> {
    return this.read();
  }

  /**
   * Added under its parent, or at the top. Its answer is the category as
   * the tree shows it, holding nothing yet, so nothing is counted for it.
   */
  async create(input: CreateProductCategoryDto): Promise<ProductCategory> {
    const parentId = input.parentId ?? null;
    try {
      const created = await this.tenantDb.transaction(
        async (tx, organizationId) => {
          await lockTree(tx, organizationId);
          if (parentId) {
            await assertCategoryIn(
              tx,
              organizationId,
              parentId,
              UNKNOWN_PARENT,
            );
          }

          const [row] = await tx
            .insert(productCategories)
            .values({
              organizationId,
              name: input.name,
              namePinyin: namePinyin(input.name),
              parentId,
            })
            .returning({
              id: productCategories.id,
              name: productCategories.name,
              parentId: productCategories.parentId,
            });
          return row;
        },
      );

      this.logger.log(`Category ${created.id} created`);
      return {
        id: created.id,
        name: created.name,
        parentId: created.parentId,
        items: [],
      };
    } catch (error) {
      throw nameTakenOr(error, input.name);
    }
  }

  /**
   * Renamed, moved, or both. A move under the category itself, or under
   * any category inside it, is refused: the branch would hang from
   * nothing, every row still there and none of them reachable from the top.
   */
  async update(
    categoryId: string,
    input: UpdateProductCategoryDto,
  ): Promise<void> {
    // Its own name where a move alone meets one already there.
    let name = input.name;
    try {
      await this.tenantDb.transaction(async (tx, organizationId) => {
        await lockTree(tx, organizationId);
        const existing = await this.categoryOf(tx, organizationId, categoryId);
        name ??= existing.name;

        const moving =
          input.parentId !== undefined && input.parentId !== existing.parentId;
        if (moving && input.parentId) {
          await assertCategoryIn(
            tx,
            organizationId,
            input.parentId,
            UNKNOWN_PARENT,
          );
          if (
            await isWithinBranch(tx, organizationId, categoryId, input.parentId)
          ) {
            throw new ConflictException(
              t({
                id: 'productCategories.movedInsideItself',
                defaultMessage:
                  'A category cannot go under itself, or under a category inside it. Choose another place.',
              }),
            );
          }
        }

        // What it was, so History reads "Vitamins → Vitamines", and the
        // parent by its name (ADR-018, ADR-076).
        recordPrevious({ name: existing.name, parentId: existing.parentId });

        await tx
          .update(productCategories)
          .set({
            ...(input.name !== undefined && {
              name: input.name,
              ...pinyinOf(input.name),
            }),
            ...(input.parentId !== undefined && { parentId: input.parentId }),
          })
          .where(
            and(
              eq(productCategories.organizationId, organizationId),
              eq(productCategories.id, categoryId),
            ),
          );
      });
    } catch (error) {
      throw nameTakenOr(error, name);
    }

    this.logger.log(`Category ${categoryId} updated`);
  }

  /**
   * Only once it holds nothing: every item and every category in it moved
   * elsewhere first. The refusal says how many of each, so whoever asked
   * knows what to move.
   */
  async remove(categoryId: string): Promise<void> {
    await this.tenantDb.transaction(async (tx, organizationId) => {
      await lockTree(tx, organizationId);
      // Locked for update, so an item put in it meanwhile is counted below
      // or refused by its key, never left pointing at nothing.
      const category = await this.categoryOf(tx, organizationId, categoryId, {
        lock: true,
      });

      const [{ items }] = await tx
        .select({ items: sql<number>`count(*)::int` })
        .from(products)
        .where(
          and(
            eq(products.organizationId, organizationId),
            eq(products.categoryId, categoryId),
          ),
        );
      const [{ categories }] = await tx
        .select({ categories: sql<number>`count(*)::int` })
        .from(productCategories)
        .where(
          and(
            eq(productCategories.organizationId, organizationId),
            eq(productCategories.parentId, categoryId),
          ),
        );

      if (items > 0 || categories > 0) {
        throw new ConflictException(
          stillHolds(category.name, items, categories),
        );
      }

      // The row is gone once the entry is written, so the entry keeps its
      // name (ADR-038).
      recordContext({ name: category.name });

      await tx
        .delete(productCategories)
        .where(
          and(
            eq(productCategories.organizationId, organizationId),
            eq(productCategories.id, categoryId),
          ),
        );
    });

    this.logger.log(`Category ${categoryId} deleted`);
  }

  private async categoryOf(
    tx: Transaction,
    organizationId: string,
    categoryId: string,
    options: { lock?: boolean } = {},
  ): Promise<{ name: string; parentId: string | null }> {
    const query = tx
      .select({
        name: productCategories.name,
        parentId: productCategories.parentId,
      })
      .from(productCategories)
      .where(
        and(
          eq(productCategories.organizationId, organizationId),
          eq(productCategories.id, categoryId),
        ),
      );
    const [category] = await (options.lock ? query.for('update') : query);

    if (!category) {
      throw new NotFoundException(
        t({
          id: 'productCategories.notFound',
          defaultMessage: 'No such category',
        }),
      );
    }
    return category;
  }

  /** The categories as the API returns them (ADR-068). */
  private read(): Promise<ProductCategoryList> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const categories = await tx
        .select({
          id: productCategories.id,
          name: productCategories.name,
          parentId: productCategories.parentId,
        })
        .from(productCategories)
        .where(eq(productCategories.organizationId, organizationId))
        .orderBy(
          sql`coalesce(${productCategories.namePinyin}, search_text(${productCategories.name})) collate numeric_order`,
          asc(productCategories.id),
        );

      // What each holds itself, by type, and what none holds, read by the
      // products' index led by the organization and the category.
      const counts = await tx
        .select({
          categoryId: products.categoryId,
          type: products.type,
          active: sql<number>`(count(*) filter (where ${products.isActive}))::int`,
          discontinued: sql<number>`(count(*) filter (where not ${products.isActive}))::int`,
        })
        .from(products)
        .where(eq(products.organizationId, organizationId))
        .groupBy(products.categoryId, products.type);

      // By category, Uncategorised under null.
      const itemsOf = new Map<string | null, CategoryItemCount[]>();
      for (const row of counts) {
        const items = itemsOf.get(row.categoryId) ?? [];
        items.push({
          type: row.type as ProductType,
          active: row.active,
          discontinued: row.discontinued,
        });
        itemsOf.set(row.categoryId, items);
      }
      const inTypeOrder = (items: CategoryItemCount[] = []) =>
        items.sort(
          (a, b) =>
            PRODUCT_TYPES.indexOf(a.type) - PRODUCT_TYPES.indexOf(b.type),
        );

      return {
        categories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          parentId: category.parentId,
          items: inTypeOrder(itemsOf.get(category.id)),
        })),
        uncategorised: inTypeOrder(itemsOf.get(null)),
      };
    });
  }
}

/** A name already used beside it becomes a 409 naming it; else as it was. */
function nameTakenOr(error: unknown, name: string | undefined): unknown {
  if (!isUniqueViolation(error, NAME_TAKEN)) return error;
  return new ConflictException(
    t(
      {
        id: 'productCategories.nameTaken',
        defaultMessage:
          'There is already a category named {name} in the same place. Choose another name.',
      },
      { name },
    ),
  );
}

/** Why a category cannot be deleted yet: how many of each, and what to do. */
function stillHolds(name: string, items: number, categories: number) {
  if (categories === 0) {
    return t(
      {
        id: 'productCategories.holdsItems',
        defaultMessage:
          '{name} still holds {items, plural, one {# item} other {# items}}. Move {items, plural, one {it} other {them}} to another category first, then delete {name}.',
      },
      { name, items },
    );
  }
  if (items === 0) {
    return t(
      {
        id: 'productCategories.holdsCategories',
        defaultMessage:
          '{name} still holds {categories, plural, one {# category} other {# categories}}. Move {categories, plural, one {it} other {them}} out of {name} first, then delete it.',
      },
      { name, categories },
    );
  }
  return t(
    {
      id: 'productCategories.holdsBoth',
      defaultMessage:
        '{name} still holds {items, plural, one {# item} other {# items}} and {categories, plural, one {# category} other {# categories}}. Move them out of {name} first, then delete it.',
    },
    { name, items, categories },
  );
}
