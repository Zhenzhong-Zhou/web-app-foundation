import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';

import { recordPrevious } from '../../core/audit/audit-context';
import { isUniqueViolation } from '../../database/errors';
import {
  priceListItems,
  priceLists,
  products,
  productVariants,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { itemName } from '../stock/item-name';
import type { Tx } from '../stock/stock.service';
import type { CreatePriceListDto } from './dto/create-price-list.dto';
import type { ListPriceListsDto } from './dto/list-price-lists.dto';
import type { SetPriceListItemDto } from './dto/set-price-list-item.dto';
import type { UpdatePriceListDto } from './dto/update-price-list.dto';

/**
 * Price lists and their items (ADR-049). Nothing here touches an order: a
 * list is read when a line is added, from the orders module, and never again.
 */
@Injectable()
export class PriceListsService {
  private readonly logger = new Logger(PriceListsService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  /** Every list, with how many items each prices, for the list page. */
  list(query: ListPriceListsDto) {
    return this.tenantDb.transaction((tx, organizationId) =>
      tx
        .select({
          id: priceLists.id,
          name: priceLists.name,
          direction: priceLists.direction,
          currency: priceLists.currency,
          isActive: priceLists.isActive,
          itemCount: sql<number>`(
            select count(*)::int
            from price_list_items i
            where i.price_list_id = price_lists.id
          )`,
        })
        .from(priceLists)
        .where(
          and(
            eq(priceLists.organizationId, organizationId),
            query.direction
              ? eq(priceLists.direction, query.direction)
              : undefined,
          ),
        )
        .orderBy(asc(priceLists.name)),
    );
  }

  /** One list and every item on it, ordered by SKU. */
  findById(priceListId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const list = await this.load(tx, organizationId, priceListId);

      const items = await tx
        .select({
          variantId: priceListItems.variantId,
          sku: productVariants.sku,
          productName: products.name,
          variantName: productVariants.name,
          unitPrice: priceListItems.unitPrice,
          updatedAt: priceListItems.updatedAt,
        })
        .from(priceListItems)
        .innerJoin(
          productVariants,
          eq(productVariants.id, priceListItems.variantId),
        )
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(
          and(
            eq(priceListItems.organizationId, organizationId),
            eq(priceListItems.priceListId, priceListId),
          ),
        )
        .orderBy(asc(productVariants.sku));

      return {
        ...list,
        items: items.map(({ productName, variantName, ...item }) => ({
          ...item,
          description: itemName(productName, variantName),
        })),
      };
    });
  }

  async create(input: CreatePriceListDto) {
    try {
      const list = await this.tenantDb.transaction(
        async (tx, organizationId) => {
          const [row] = await tx
            .insert(priceLists)
            .values({
              organizationId,
              name: input.name,
              direction: input.direction,
              currency: input.currency,
            })
            .returning();

          return row;
        },
      );

      this.logger.log(`Price list ${list.id} created`);
      return list;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `A price list called ${input.name} already exists`,
        );
      }
      throw error;
    }
  }

  async update(priceListId: string, input: UpdatePriceListDto) {
    try {
      await this.tenantDb.transaction(async (tx, organizationId) => {
        const list = await this.load(tx, organizationId, priceListId);

        recordPrevious({ name: list.name, isActive: list.isActive });

        await tx
          .update(priceLists)
          .set(input)
          .where(eq(priceLists.id, priceListId));
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `A price list called ${input.name} already exists`,
        );
      }
      throw error;
    }

    this.logger.log(`Price list ${priceListId} updated`);
  }

  /**
   * Sets one item's price, adding it to the list or replacing what is there.
   * A PUT: the item is the identity, so setting it twice corrects it. Orders
   * already priced from the list keep what they were given (ADR-049).
   */
  setItem(priceListId: string, variantId: string, input: SetPriceListItemDto) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      await this.load(tx, organizationId, priceListId);

      const [variant] = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.id, variantId),
            eq(productVariants.organizationId, organizationId),
          ),
        );

      // In the path, so a variant that is not this organization's is not
      // found, as any other path id is.
      if (!variant) throw new NotFoundException('No such item');

      const [existing] = await tx
        .select({ unitPrice: priceListItems.unitPrice })
        .from(priceListItems)
        .where(
          and(
            eq(priceListItems.priceListId, priceListId),
            eq(priceListItems.variantId, variantId),
          ),
        );

      recordPrevious({ unitPrice: existing?.unitPrice ?? null });

      const [item] = await tx
        .insert(priceListItems)
        .values({
          organizationId,
          priceListId,
          variantId,
          unitPrice: input.unitPrice,
        })
        .onConflictDoUpdate({
          target: [priceListItems.priceListId, priceListItems.variantId],
          set: { unitPrice: input.unitPrice },
        })
        .returning();

      this.logger.log(
        `Price list ${priceListId}: ${variantId} at ${item.unitPrice}`,
      );

      return item;
    });
  }

  /** Takes an item off the list. Lines already priced from it are untouched. */
  removeItem(priceListId: string, variantId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      await this.load(tx, organizationId, priceListId);

      const [removed] = await tx
        .delete(priceListItems)
        .where(
          and(
            eq(priceListItems.organizationId, organizationId),
            eq(priceListItems.priceListId, priceListId),
            eq(priceListItems.variantId, variantId),
          ),
        )
        .returning({ unitPrice: priceListItems.unitPrice });

      if (!removed) throw new NotFoundException('That item is not on the list');

      recordPrevious({ unitPrice: removed.unitPrice });

      this.logger.log(`Price list ${priceListId}: ${variantId} removed`);
    });
  }

  private async load(tx: Tx, organizationId: string, priceListId: string) {
    const [list] = await tx
      .select()
      .from(priceLists)
      .where(
        and(
          eq(priceLists.id, priceListId),
          eq(priceLists.organizationId, organizationId),
        ),
      );

    if (!list) throw new NotFoundException('No such price list');
    return list;
  }
}
